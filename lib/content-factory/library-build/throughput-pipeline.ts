import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import {
  autoGenerateQualifiedCandidates,
  autoPublishReadyLearningPaths,
} from "@/lib/content-factory/auto-pipeline";
import { backfillMissingLearningPathArtwork } from "@/lib/content-factory/artwork-backfill";
import { processQueuedDiscoveryRun } from "@/lib/content-factory/discovery";
import { processPendingQualificationBatches } from "@/lib/content-factory/qualify";
import {
  attemptStallRecovery,
  ensureLibraryBuildKeepsRunning,
  fillDiscoveryBacklog,
  getLibraryBuildThroughputSettings,
  recordLibraryBuildActivity,
  tickLibraryBuildMaintenance,
} from "@/lib/content-factory/library-build/engine";
import { isMissingRelationError } from "@/lib/schema-guard";

type Admin = SupabaseClient<Database>;

export type LibraryBuildThroughputResult = {
  synced: boolean;
  qualification: { runs: number; qualified: number };
  discovery: { processed: number; reason?: string };
  discoveryBacklog: { created: number; reasons: string[] };
  generation: { created: number; skipped: number };
  publication: { published: number; skipped: number };
  artworkBackfill: { updated: number };
  stallRecovery: { attempted: boolean; reason?: string };
};

/**
 * High-throughput Library Build tick: sync → qualify batches → generate → publish →
 * discovery backlog → stall recovery. Stages are independent — YouTube quota blocks only
 * new discovery searches, not qualify/generate/publish.
 */
export async function runLibraryBuildThroughputTick(
  admin: Admin,
): Promise<LibraryBuildThroughputResult> {
  const empty: LibraryBuildThroughputResult = {
    synced: false,
    qualification: { runs: 0, qualified: 0 },
    discovery: { processed: 0 },
    discoveryBacklog: { created: 0, reasons: [] },
    generation: { created: 0, skipped: 0 },
    publication: { published: 0, skipped: 0 },
    artworkBackfill: { updated: 0 },
    stallRecovery: { attempted: false },
  };

  if (!contentFactoryEnabled()) return empty;

  try {
    await ensureLibraryBuildKeepsRunning(admin);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!isMissingRelationError(message)) {
      console.error("[library-build] ensure running failed:", message);
    }
  }

  let settings;
  try {
    settings = await getLibraryBuildThroughputSettings(admin);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isMissingRelationError(message)) return empty;
    throw err;
  }
  if (!settings) return empty;

  await tickLibraryBuildMaintenance(admin);
  empty.synced = true;

  const qualifyCap = Math.max(settings.qualificationBatchSize * 2, 12);
  let qualification = await processPendingQualificationBatches(admin, qualifyCap);
  empty.qualification = {
    runs: qualification.runs,
    qualified: qualification.qualified,
  };
  if (qualification.qualified > 0) {
    await recordLibraryBuildActivity(admin, "qualification_batch");
  }

  let generation = { created: 0, skipped: 0, runIds: [] as string[] };
  for (let pass = 0; pass < 3; pass += 1) {
    const batch = await autoGenerateQualifiedCandidates(admin, {
      limit: settings.generationBatchSize,
    });
    generation.created += batch.created;
    generation.skipped += batch.skipped;
    if (!batch.created) break;
  }
  empty.generation = { created: generation.created, skipped: generation.skipped };
  if (generation.created > 0) {
    await recordLibraryBuildActivity(admin, "generation_batch");
  }

  const artworkBackfill = await backfillMissingLearningPathArtwork(admin, 16);
  empty.artworkBackfill = { updated: artworkBackfill.updated };

  let publication = { published: 0, skipped: 0, errors: [] as string[] };
  for (let pass = 0; pass < 3; pass += 1) {
    const batch = await autoPublishReadyLearningPaths(admin, settings.publicationBatchSize);
    publication.published += batch.published;
    publication.skipped += batch.skipped;
    publication.errors.push(...batch.errors);
    if (!batch.published) break;
  }
  empty.publication = { published: publication.published, skipped: publication.skipped };
  if (publication.published > 0) {
    await recordLibraryBuildActivity(admin, "publication_batch");
  }

  let discoveryProcessed = 0;
  let discoveryReason: string | undefined;
  const discoveryPasses = Math.max(2, Math.min(settings.maxConcurrentDiscoveryJobs, 6));
  for (let i = 0; i < discoveryPasses; i += 1) {
    try {
      const run = await processQueuedDiscoveryRun(admin);
      if (run && "processed" in run && run.processed) {
        discoveryProcessed += 1;
        await recordLibraryBuildActivity(admin, "discovery_run");
      } else if (run && "reason" in run && run.reason) {
        discoveryReason = String(run.reason);
        if (run.reason === "idle") break;
      }
    } catch (err) {
      discoveryReason = err instanceof Error ? err.message : String(err);
      break;
    }
  }
  empty.discovery = { processed: discoveryProcessed, reason: discoveryReason };

  const qualificationAfter = await processPendingQualificationBatches(admin, qualifyCap);
  empty.qualification.runs += qualificationAfter.runs;
  empty.qualification.qualified += qualificationAfter.qualified;
  if (qualificationAfter.qualified > 0) {
    await autoGenerateQualifiedCandidates(admin, { limit: settings.generationBatchSize });
    await recordLibraryBuildActivity(admin, "qualification_batch");
  }

  const extraGen = await autoGenerateQualifiedCandidates(admin, { limit: settings.generationBatchSize });
  empty.generation.created += extraGen.created;
  empty.generation.skipped += extraGen.skipped;
  const extraPub = await autoPublishReadyLearningPaths(admin, settings.publicationBatchSize);
  empty.publication.published += extraPub.published;
  empty.publication.skipped += extraPub.skipped;

  const backlog = await fillDiscoveryBacklog(admin);
  empty.discoveryBacklog = { created: backlog.created, reasons: backlog.reasons };

  const stallRecovery = await attemptStallRecovery(admin);
  empty.stallRecovery = stallRecovery;

  const progressed =
    empty.qualification.qualified > 0 ||
    empty.generation.created > 0 ||
    empty.publication.published > 0 ||
    empty.discovery.processed > 0 ||
    empty.discoveryBacklog.created > 0 ||
    empty.artworkBackfill.updated > 0;

  if (progressed) {
    await recordLibraryBuildActivity(admin, "pipeline_progress");
  }

  return empty;
}
