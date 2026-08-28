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
  discovery: { processed: boolean; reason?: string };
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
    discovery: { processed: false },
    discoveryBacklog: { created: 0, reasons: [] },
    generation: { created: 0, skipped: 0 },
    publication: { published: 0, skipped: 0 },
    artworkBackfill: { updated: 0 },
    stallRecovery: { attempted: false },
  };

  if (!contentFactoryEnabled()) return empty;

  let settings;
  try {
    settings = await getLibraryBuildThroughputSettings(admin);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isMissingRelationError(message)) return empty;
    throw err;
  }
  if (!settings) return empty;

  // A. Sync all existing discovery jobs + refresh coverage.
  await tickLibraryBuildMaintenance(admin);
  empty.synced = true;

  // B. Qualify pending candidates in batches.
  const qualification = await processPendingQualificationBatches(
    admin,
    settings.qualificationBatchSize,
  );
  empty.qualification = {
    runs: qualification.runs,
    qualified: qualification.qualified,
  };
  if (qualification.qualified > 0) {
    await recordLibraryBuildActivity(admin, "qualification_batch");
  }

  // C. Generate qualified candidates.
  let generation = await autoGenerateQualifiedCandidates(admin, {
    limit: settings.generationBatchSize,
  });
  if (qualification.qualified > 0 && generation.created === 0) {
    generation = await autoGenerateQualifiedCandidates(admin, {
      limit: settings.generationBatchSize,
    });
  }
  empty.generation = { created: generation.created, skipped: generation.skipped };
  if (generation.created > 0) {
    await recordLibraryBuildActivity(admin, "generation_batch");
  }

  // D/E. Artwork backfill then publish verified paths.
  const artworkBackfill = await backfillMissingLearningPathArtwork(admin, 8);
  empty.artworkBackfill = { updated: artworkBackfill.updated };

  const publication = await autoPublishReadyLearningPaths(admin, settings.publicationBatchSize);
  empty.publication = { published: publication.published, skipped: publication.skipped };
  if (publication.published > 0) {
    await recordLibraryBuildActivity(admin, "publication_batch");
  }

  // Process one queued discovery run (YouTube search) — quota may block here only.
  let discovery: { processed: boolean; reason?: string } = { processed: false };
  try {
    const run = await processQueuedDiscoveryRun(admin);
    discovery = {
      processed: Boolean(run && "processed" in run && run.processed),
      reason: run && "reason" in run ? String(run.reason ?? "") : undefined,
    };
    if (discovery.processed) {
      await recordLibraryBuildActivity(admin, "discovery_run");
    }
  } catch (err) {
    discovery = { processed: false, reason: err instanceof Error ? err.message : String(err) };
  }
  empty.discovery = discovery;

  // Second qualify pass after discovery may have added candidates.
  const qualificationAfter = await processPendingQualificationBatches(admin, settings.qualificationBatchSize);
  empty.qualification.runs += qualificationAfter.runs;
  empty.qualification.qualified += qualificationAfter.qualified;
  if (qualificationAfter.qualified > 0) {
    await autoGenerateQualifiedCandidates(admin, { limit: settings.generationBatchSize });
    await recordLibraryBuildActivity(admin, "qualification_batch");
  }

  // Extra generate/publish pass for backlog drain.
  const extraGen = await autoGenerateQualifiedCandidates(admin, { limit: settings.generationBatchSize });
  empty.generation.created += extraGen.created;
  empty.generation.skipped += extraGen.skipped;
  const extraPub = await autoPublishReadyLearningPaths(admin, settings.publicationBatchSize);
  empty.publication.published += extraPub.published;
  empty.publication.skipped += extraPub.skipped;

  // G. Fill discovery backlog when running and capacity allows.
  const backlog = await fillDiscoveryBacklog(admin);
  empty.discoveryBacklog = { created: backlog.created, reasons: backlog.reasons };

  // H. Stall recovery when engine is running but idle below minimum.
  const stallRecovery = await attemptStallRecovery(admin);
  empty.stallRecovery = stallRecovery;

  const progressed =
    empty.qualification.qualified > 0 ||
    empty.generation.created > 0 ||
    empty.publication.published > 0 ||
    empty.discovery.processed ||
    empty.discoveryBacklog.created > 0 ||
    empty.artworkBackfill.updated > 0;

  if (progressed) {
    await recordLibraryBuildActivity(admin, "pipeline_progress");
  }

  return empty;
}
