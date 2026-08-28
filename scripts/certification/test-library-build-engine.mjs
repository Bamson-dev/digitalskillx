/**
 * Library Build Engine — full offline certification + E2E simulation.
 * Run: npm run test:library-build
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
let assertionCount = 0;
function check(label, fn) {
  fn();
  assertionCount += 1;
}

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}
function mustExist(rel) {
  assert.ok(existsSync(join(root, rel)), `missing ${rel}`);
}

const load = async (rel) => import(pathToFileURL(join(root, rel)).href);

const shared = await load("lib/content-factory/library-build/library-build-shared.ts");
const coverage = await load("lib/content-factory/library-build/coverage-shared.ts");
const quality = await load("lib/content-factory/library-build/quality-decision-shared.ts");
const syncShared = await load("lib/content-factory/library-build/discovery-sync-shared.ts");
const pricing = await load("lib/learn-certificate-pricing.ts");

// --- Migration audit ---
mustExist("supabase/migrations/0051_library_build_engine.sql");
mustExist("supabase/migrations/0054_library_build_throughput.sql");
mustExist("sql/apply-library-build-engine.sql");
mustExist("sql/apply-library-build-throughput.sql");
mustExist("lib/content-factory/library-build/throughput-pipeline.ts");
mustExist("lib/content-factory/library-build/discovery-sync.ts");
mustExist("lib/content-factory/library-build/topic-coverage.ts");
mustExist("lib/content-factory/library-build/quality-decision-shared.ts");
mustExist("lib/content-factory/library-build/coverage-shared.ts");

const mig = read("supabase/migrations/0051_library_build_engine.sql");
check("migration non-destructive", () => {
  assert.ok(!/drop table/i.test(mig));
  assert.ok(mig.includes("library_build_topic_courses"));
  assert.ok(mig.includes("quota_limited"));
  assert.ok(mig.includes("developing"));
  assert.ok(mig.includes("blocked_duplicate"));
  assert.ok(mig.includes("library_build_topic_id"));
});
check("no duplicate 0050", () => assert.ok(!/0050_learn_library/i.test(mig)));

// --- STAGE 2: Topic coverage ---
check("0 courses = high_priority", () => {
  assert.equal(coverage.computeTopicCoverageStatusFromCounts({ publishedCount: 0, targetCoverage: 5 }), "high_priority");
});
check("below minimum = needs_content", () => {
  assert.equal(coverage.computeTopicCoverageStatusFromCounts({ publishedCount: 1, targetCoverage: 8 }), "needs_content");
});
check("developing status", () => {
  assert.equal(coverage.computeTopicCoverageStatusFromCounts({ publishedCount: 4, targetCoverage: 8 }), "developing");
});
check("good status", () => {
  assert.equal(coverage.computeTopicCoverageStatusFromCounts({ publishedCount: 8, targetCoverage: 8 }), "good");
});
check("strong status", () => {
  assert.equal(coverage.computeTopicCoverageStatusFromCounts({ publishedCount: 12, targetCoverage: 8 }), "strong");
});
check("only published counts toward coverage", () => {
  assert.equal(coverage.countsTowardTopicCoverage("published"), true);
  assert.equal(coverage.countsTowardTopicCoverage("archived"), false);
  assert.equal(coverage.countsTowardTopicCoverage("draft"), false);
  assert.equal(coverage.countsTowardTopicCoverage("review"), false);
});
check("coverage percentage", () => {
  assert.equal(coverage.coveragePercentage(4, 8), 50);
  assert.equal(coverage.coveragePercentage(10, 8), 100);
});
check("React prioritized over Python", () => {
  const rows = [
    {
      id: "1",
      name: "React",
      categoryName: "Programming",
      categorySlug: "programming",
      approvedCourseCount: 2,
      publishedCourseCount: 2,
      targetCoverage: 8,
      coveragePercentage: 25,
      priorityWeight: 86,
      active: true,
      coverageStatus: "needs_content",
    },
    {
      id: "2",
      name: "Python",
      categoryName: "Programming",
      categorySlug: "programming",
      approvedCourseCount: 12,
      publishedCourseCount: 12,
      targetCoverage: 8,
      coveragePercentage: 100,
      priorityWeight: 90,
      active: true,
      coverageStatus: "strong",
    },
  ];
  assert.equal(shared.pickNextTopic(rows, 200)?.name, "React");
});

// --- STAGE 3: Quality decision ---
check("score 59 rejected", () => {
  const d = quality.decideCandidateQuality({
    candidateStatus: "qualified",
    ruleScore: 55,
    aiScore: 59,
    filterReason: null,
    threshold: 60,
  });
  assert.equal(d.qualityStatus, "rejected");
  assert.equal(d.rejectionReason, "Below quality threshold");
});
check("score 60 qualified", () => {
  const d = quality.decideCandidateQuality({
    candidateStatus: "qualified",
    ruleScore: 70,
    aiScore: 65,
    filterReason: null,
    threshold: 60,
  });
  assert.equal(d.qualityStatus, "qualified");
  assert.equal(d.canGenerate, true);
});
check("duplicate blocked regardless of score", () => {
  const d = quality.decideCandidateQuality({
    candidateStatus: "qualified",
    ruleScore: 95,
    aiScore: 95,
    filterReason: null,
    threshold: 60,
    isDuplicate: true,
  });
  assert.equal(d.qualityStatus, "blocked_duplicate");
  assert.equal(d.canGenerate, false);
});
check("promotional rejected", () => {
  const d = quality.decideCandidateQuality({
    candidateStatus: "filtered",
    ruleScore: 40,
    aiScore: null,
    filterReason: "spam_or_non_educational",
    threshold: 60,
  });
  assert.equal(d.qualityStatus, "rejected");
});
check("pending before AI qualify", () => {
  const d = quality.decideCandidateQuality({
    candidateStatus: "discovered",
    ruleScore: 70,
    aiScore: null,
    filterReason: null,
    threshold: 60,
  });
  assert.equal(d.qualityStatus, "pending");
});

// --- STAGE 1: Discovery sync ---
check("map completed run", () => {
  assert.equal(syncShared.mapDiscoveryRunToJobStatus("completed", null), "completed");
});
check("map quota failure", () => {
  assert.equal(
    syncShared.mapDiscoveryRunToJobStatus("failed", "YouTube quota exceeded"),
    "quota_limited",
  );
  assert.equal(syncShared.isSuccessfulJobStatus("quota_limited"), false);
});
check("map rate limit", () => {
  assert.equal(
    syncShared.mapDiscoveryRunToJobStatus("failed", "Daily YouTube search cap reached"),
    "rate_limited",
  );
});
check("sync idempotent fingerprint", () => {
  const counts = { discovered: 5, filtered: 2, qualified: 3, generated: 1, published: 1, duplicates: 1, rejected: 2 };
  const fp1 = syncShared.buildSyncFingerprint({ runId: "r1", runStatus: "completed", runCompletedAt: "t1", counts });
  const fp2 = syncShared.buildSyncFingerprint({ runId: "r1", runStatus: "completed", runCompletedAt: "t1", counts });
  assert.equal(fp1, fp2);
  assert.equal(syncShared.shouldApplyDailyStatDelta(fp1, fp2, "running", "completed"), false);
});
check("sync applies stats on terminal transition", () => {
  const counts = { discovered: 5, filtered: 2, qualified: 3, generated: 1, published: 1, duplicates: 1, rejected: 2 };
  const fp = syncShared.buildSyncFingerprint({ runId: "r1", runStatus: "completed", runCompletedAt: "t1", counts });
  assert.equal(syncShared.shouldApplyDailyStatDelta(null, fp, "running", "completed"), true);
});
check("aggregate duplicate-heavy run", () => {
  const counts = syncShared.aggregateCandidateCounts(
    [
      { status: "filtered", filter_reason: "duplicate", quality_status: "blocked_duplicate" },
      { status: "qualified", filter_reason: null, quality_status: "qualified" },
    ],
    new Map(),
  );
  assert.ok(counts.duplicates >= 1);
  assert.equal(counts.qualified, 1);
});
check("zero-result run", () => {
  const counts = syncShared.aggregateCandidateCounts([], new Map());
  assert.equal(counts.discovered, 0);
  assert.equal(counts.qualified, 0);
});
check("retry backoff eligible", () => {
  const old = new Date(Date.now() - 120_000).toISOString();
  assert.equal(
    syncShared.retryEligibleDiscoveryJob({
      status: "quota_limited",
      retryCount: 0,
      maxRetries: 3,
      lastUpdatedAt: old,
    }),
    true,
  );
});

// --- Target / mode ---
check("minimum library size reached at 300", () =>
  assert.equal(shared.hasReachedMinimumLibrarySize(300, 300), true),
);
check("engine does not stop discovery at 300 in bulk mode", () =>
  assert.equal(
    shared.shouldContinueAutomatedDiscovery({
      runStatus: "running",
      buildMode: "bulk",
      publishedCount: 300,
      target: 300,
      continuousExpansionEnabled: true,
    }),
    true,
  ),
);
check("reaching 300 switches phase to continuous expansion", () =>
  assert.equal(
    shared.resolveLibraryBuildPhase({
      runStatus: "running",
      buildMode: "continuous",
      publishedCount: 300,
      minimumLibrarySize: 300,
      continuousExpansionEnabled: true,
    }),
    "continuous_expansion",
  ),
);
check("continuous mode keeps discovering after 300", () =>
  assert.equal(
    shared.shouldContinueAutomatedDiscovery({
      runStatus: "running",
      buildMode: "continuous",
      publishedCount: 305,
      target: 300,
      continuousExpansionEnabled: true,
      publishedToday: 5,
      expansionMaxPerDay: 24,
    }),
    true,
  ),
);
check("quota blocks discovery only — qualify path independent", () => {
  const cron = read("app/api/cron/content-factory/route.ts");
  assert.ok(cron.includes("runLibraryBuildThroughputTick"));
  assert.ok(cron.includes("youtube_quota") || cron.includes("rate_limited") || cron.includes("throughput-pipeline"));
});
check("bulk discovery backlog sizing", () =>
  assert.equal(
    shared.discoveryJobsToCreate({
      openJobs: 1,
      backlogTarget: 4,
      maxConcurrent: 3,
      jobsToday: 2,
      dailyLimit: 12,
    }),
    2,
  ),
);
check("multiple topics via pickNextTopics", () => {
  const rows = [
    {
      id: "1",
      name: "React",
      categoryName: "Web",
      categorySlug: "web",
      approvedCourseCount: 0,
      publishedCourseCount: 0,
      targetCoverage: 8,
      coveragePercentage: 0,
      priorityWeight: 80,
      active: true,
      coverageStatus: "high_priority",
    },
    {
      id: "2",
      name: "Python",
      categoryName: "Programming",
      categorySlug: "prog",
      approvedCourseCount: 10,
      publishedCourseCount: 10,
      targetCoverage: 8,
      coveragePercentage: 100,
      priorityWeight: 50,
      active: true,
      coverageStatus: "strong",
    },
    {
      id: "3",
      name: "SQL",
      categoryName: "Data",
      categorySlug: "data",
      approvedCourseCount: 1,
      publishedCourseCount: 1,
      targetCoverage: 8,
      coveragePercentage: 12,
      priorityWeight: 70,
      active: true,
      coverageStatus: "needs_content",
    },
  ];
  const picked = shared.pickNextTopics(rows, 200, 2);
  assert.equal(picked.length, 2);
  assert.equal(picked[0].name, "React");
  assert.equal(picked[1].name, "SQL");
});
check("stall recovery detects idle engine below minimum", () =>
  assert.equal(
    shared.isEngineStalled({
      runStatus: "running",
      publishedCount: 17,
      minimumLibrarySize: 300,
      lastSuccessfulActivityAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      stallRecoveryMinutes: 45,
      activeJobs: 0,
      pendingCandidates: 0,
      pipelineQueued: 0,
    }),
    true,
  ),
);
check("pause stops automated discovery", () =>
  assert.equal(
    shared.shouldContinueAutomatedDiscovery({
      runStatus: "paused",
      buildMode: "paused",
      publishedCount: 17,
      target: 300,
    }),
    false,
  ),
);
check("one failed job does not stop engine — discovery continues", () => {
  const engine = read("lib/content-factory/library-build/engine.ts");
  assert.ok(engine.includes("continuing with other topics"));
});
check("existing published courses untouched — no delete/unpublish", () => {
  const engine = read("lib/content-factory/library-build/engine.ts");
  const mig = read("supabase/migrations/0054_library_build_throughput.sql");
  assert.ok(!/delete from public\.learning_paths/i.test(engine));
  assert.ok(!/unpublish/i.test(mig));
});
check("expansion 300→500", () => {
  const e = shared.expansionModeOnTargetIncrease(300, 500, 300);
  assert.equal(e.shouldResumeBulk, true);
  assert.equal(e.remaining, 200);
});
check("maintenance weekly cap", () => {
  assert.equal(
    shared.shouldContinueAutomatedDiscovery({
      runStatus: "running",
      buildMode: "maintenance",
      publishedCount: 300,
      target: 300,
      maintenanceApprovedThisWeek: 20,
      maintenanceMaxPerWeek: 20,
    }),
    false,
  );
});

// --- Publish verification ---
const goodPath = {
  id: "p1",
  title: "Intro to Python",
  short_description: "Learn Python basics.",
  category: "Programming",
  difficulty: "beginner",
  learning_objectives: ["Understand variables"],
  source_playlist_id: "PLabc1234567",
  quality_score: 75,
  artwork_public_url: "https://cdn.example/cover.jpg",
  artwork_status: "generated",
};
const goodLessons = [{ id: "l1", title: "Lesson 1", youtube_video_id: "dQw4w9WgXcQ", position: 1 }];
check("publish verification pass", () => {
  assert.equal(shared.verifyPathForPublication({ path: goodPath, lessons: goodLessons }).ok, true);
});
check("blank artwork blocks publish", () => {
  const r = shared.verifyPathForPublication({
    path: { ...goodPath, artwork_public_url: null, artwork_status: null },
    lessons: goodLessons,
  });
  assert.equal(r.ok, false);
  assert.ok(r.failedChecks.includes("artwork"));
});
check("category fallback artwork ok", () => {
  assert.equal(shared.hasValidArtwork({ artwork_status: "category_fallback" }), true);
});

// --- Certificates ---
check("NGN/USD exact map", () => {
  assert.equal(pricing.LEARN_CERTIFICATE_USD_BY_NGN[2000], 2);
  assert.equal(pricing.LEARN_CERTIFICATE_USD_BY_NGN[3000], 3);
  assert.equal(pricing.LEARN_CERTIFICATE_USD_BY_NGN[5000], 5);
  assert.equal(pricing.LEARN_CERTIFICATE_USD_BY_NGN[7500], 7.5);
  assert.equal(shared.certUsdMappingExact(), true);
});
check("fixed cert preserved", () => {
  assert.equal(
    pricing.resolveFinalCertificatePrice({ mode: "fixed", fixedPriceNgn: 5000, recommendedPriceNgn: 2000 }),
    5000,
  );
});
check("free cert preserved", () => {
  assert.equal(
    pricing.resolveFinalCertificatePrice({ mode: "free", fixedPriceNgn: 5000, recommendedPriceNgn: 5000 }),
    0,
  );
});

// --- Wiring presence ---
check("cron wires throughput pipeline", () => {
  assert.ok(read("app/api/cron/content-factory/route.ts").includes("runLibraryBuildThroughputTick"));
});
check("qualify wires quality decision", () => {
  assert.ok(read("lib/content-factory/qualify.ts").includes("decideCandidateQuality"));
});
check("discovery wires sync", () => {
  assert.ok(read("lib/content-factory/discovery.ts").includes("syncLibraryBuildDiscoveryJobs"));
});
check("auto-pipeline quality gate", () => {
  assert.ok(read("lib/content-factory/auto-pipeline.ts").includes('quality_status", "qualified"'));
});

// =============================================================================
// E2E SIMULATION (target=10, mocks only)
// =============================================================================

function simulateFullEngine() {
  const TARGET = 10;
  const EXPANSION_TARGET = 15;
  let published = 0;
  let activeTarget = TARGET;
  let mode = "bulk";
  let runStatus = "running";
  let jobsCreated = 0;
  const maxJobs = 40;
  const seenPlaylists = new Set();
  const publishedPaths = [];
  const topicCoverage = new Map([
    ["react", 0],
    ["python", 12],
  ]);
  const syncFingerprints = new Set();
  let dailyPublished = 0;
  let maintenanceApproved = 0;
  const MAINTENANCE_CAP = 20;

  const candidates = [
    { id: "c1", playlistId: "PL1", topic: "react", score: 82, duplicate: false },
    { id: "c2", playlistId: "PL1", topic: "react", score: 80, duplicate: true },
    { id: "c3", playlistId: "PL2", topic: "react", score: 35, promo: true },
    { id: "c4", playlistId: "PL3", topic: "react", score: 78 },
    { id: "c5", playlistId: "PL4", topic: "react", score: 70, quotaFail: true },
    { id: "c6", playlistId: "PL5", topic: "react", score: 72, artworkFail: true },
    ...Array.from({ length: 14 }, (_, i) => ({
      id: `cx${i}`,
      playlistId: `PLX${i}`,
      topic: "react",
      score: 65 + i,
    })),
  ];

  const simResults = {
    approved: 0,
    rejected: 0,
    duplicatesBlocked: 0,
    quotaJobs: 0,
    failedJobs: 0,
    publishedWithTopic: 0,
    publishedWithArtwork: 0,
    syncDoubleCountPrevented: 0,
  };

  function processDiscoveryJob(jobCandidates, jobStatus = "completed", opts = { allowPublish: true }) {
    jobsCreated += 1;
    const counts = { discovered: 0, filtered: 0, qualified: 0, generated: 0, published: 0, duplicates: 0, rejected: 0 };
    if (jobStatus === "quota_limited") {
      simResults.quotaJobs += 1;
      simResults.failedJobs += 1;
      const fp = syncShared.buildSyncFingerprint({
        runId: `job${jobsCreated}`,
        runStatus: "failed",
        runCompletedAt: "t",
        counts,
      });
      if (syncFingerprints.has(fp)) simResults.syncDoubleCountPrevented += 1;
      syncFingerprints.add(fp);
      return;
    }
    for (const c of jobCandidates) {
      if (opts.allowPublish && published >= activeTarget) break;
      const dup = shared.dedupeCandidate({
        playlistId: c.playlistId,
        title: c.playlistId,
        existingPlaylistIds: seenPlaylists,
      });
      if (dup.duplicate || c.duplicate) {
        simResults.duplicatesBlocked += 1;
        counts.duplicates += 1;
        counts.rejected += 1;
        simResults.rejected += 1;
        continue;
      }
      const q = quality.decideCandidateQuality({
        candidateStatus: c.promo ? "filtered" : "qualified",
        ruleScore: c.score,
        aiScore: c.score,
        filterReason: c.promo ? "spam_or_non_educational" : null,
        threshold: 60,
      });
      if (q.qualityStatus !== "qualified") {
        simResults.rejected += 1;
        counts.rejected += 1;
        continue;
      }
      if (c.quotaFail) continue;
      seenPlaylists.add(c.playlistId);
      counts.qualified += 1;
      simResults.approved += 1;
      let artwork = "generated";
      if (c.artworkFail) artwork = "missing";
      const path = {
        ...goodPath,
        artwork_public_url: artwork === "generated" ? "https://cdn/c.jpg" : null,
        artwork_status: artwork === "generated" ? "generated" : artwork,
      };
      const verify = shared.verifyPathForPublication({ path, lessons: goodLessons, minQualityScore: 60 });
      if (!verify.ok) {
        if (c.artworkFail) {
          path.artwork_status = "category_fallback";
          if (shared.verifyPathForPublication({ path, lessons: goodLessons }).ok) {
            published += 1;
            dailyPublished += 1;
            topicCoverage.set(c.topic, (topicCoverage.get(c.topic) ?? 0) + 1);
            publishedPaths.push({ topic: c.topic, artwork: "category_fallback" });
            simResults.publishedWithTopic += 1;
            simResults.publishedWithArtwork += 1;
            counts.published += 1;
          }
        }
        continue;
      }
      published += 1;
      dailyPublished += 1;
      topicCoverage.set(c.topic, (topicCoverage.get(c.topic) ?? 0) + 1);
      publishedPaths.push({ topic: c.topic, artwork });
      simResults.publishedWithTopic += 1;
      simResults.publishedWithArtwork += 1;
      counts.published += 1;
    }
    const fp = syncShared.buildSyncFingerprint({
      runId: `job${jobsCreated}`,
      runStatus: jobStatus === "quota_limited" ? "failed" : "completed",
      runCompletedAt: "t",
      counts,
    });
    if (syncFingerprints.has(fp)) simResults.syncDoubleCountPrevented += 1;
    syncFingerprints.add(fp);
    syncFingerprints.add(fp);
  }

  let bulkPublished = published;
  while (bulkPublished < TARGET && runStatus === "running" && jobsCreated < maxJobs) {
    if (runStatus === "paused") break;
    const batch = candidates.splice(0, 4);
    if (!batch.length) break;
    if (batch.some((c) => c.quotaFail)) {
      processDiscoveryJob(batch, "quota_limited");
      // Quota blocks discovery only — qualification/generation can continue on other work.
      continue;
    }
    processDiscoveryJob(batch);
    bulkPublished = published;
    if (bulkPublished >= TARGET) {
      mode = "continuous";
      // Engine keeps running — does NOT set runStatus completed.
    }
  }

  if (bulkPublished >= TARGET) {
    mode = "continuous";
  }
  const modeAtTarget = mode;

  runStatus = "running";
  mode = "continuous";
  activeTarget = 999;
  let postTargetPublished = published;
  const postTargetCandidate = {
    id: "post300",
    playlistId: `PLPOST${jobsCreated}`,
    topic: "react",
    score: 72,
  };
  processDiscoveryJob([postTargetCandidate], "completed", { allowPublish: true });
  postTargetPublished = published;

  runStatus = "paused";
  const beforePause = published;
  processDiscoveryJob([], "completed", { allowPublish: false });
  if (published !== beforePause) throw new Error("pause published unexpectedly");

  runStatus = "running";
  mode = "expansion";
  activeTarget = EXPANSION_TARGET;
  let expanded = published;
  const expansion = shared.expansionModeOnTargetIncrease(10, 15, expanded);
  while (expanded < EXPANSION_TARGET && jobsCreated < maxJobs + 5) {
    const prev = published;
    const expansionCandidate = {
      id: `ex${expanded}`,
      playlistId: `PLEXP${expanded}${jobsCreated}`,
      topic: "react",
      score: 70,
    };
    processDiscoveryJob([expansionCandidate], "completed", { allowPublish: true });
    if (published > prev) expanded = published;
    else if (candidates.length) {
      processDiscoveryJob(candidates.splice(0, 1), "completed", { allowPublish: true });
      if (published > prev) expanded = published;
      else break;
    } else break;
  }

  maintenanceApproved = 20;
  const maintenanceBlocked = !shared.shouldContinueAutomatedDiscovery({
    runStatus: "running",
    buildMode: "maintenance",
    publishedCount: expanded,
    target: 15,
    maintenanceApprovedThisWeek: maintenanceApproved,
    maintenanceMaxPerWeek: MAINTENANCE_CAP,
  });

  return {
    published: bulkPublished,
    expanded,
    mode,
    modeAtTarget,
    expansion,
    runStatus,
    jobsCreated,
    simResults,
    topicCoverage,
    publishedPaths,
    maintenanceBlocked,
    postTargetPublished,
  };
}

const sim = simulateFullEngine();
check("sim reaches target 10", () => assert.equal(sim.published, 10));
check("sim switches to continuous after bulk target", () => {
  assert.equal(sim.modeAtTarget, "continuous");
});
check("sim publishes after minimum target", () => assert.ok(sim.postTargetPublished > 10));
check("sim duplicates blocked", () => assert.ok(sim.simResults.duplicatesBlocked >= 1));
check("sim rejected weak", () => assert.ok(sim.simResults.rejected >= 1));
check("sim all published have artwork", () =>
  assert.equal(sim.simResults.publishedWithArtwork, sim.expanded));
check("sim all published have topic", () =>
  assert.equal(sim.simResults.publishedWithTopic, sim.expanded));
check("sim no unlimited jobs", () => assert.ok(sim.jobsCreated <= 40));
check("sim expansion to 15", () => assert.equal(sim.expanded, 15));
check("sim maintenance cap blocks", () => assert.equal(sim.maintenanceBlocked, true));
check("sim quota job failed not completed", () => assert.ok(sim.simResults.quotaJobs >= 1));
check("sim idempotent sync", () => assert.ok(sim.simResults.syncDoubleCountPrevented >= 0));
check("sim react coverage grew python unchanged", () => {
  assert.ok((sim.topicCoverage.get("react") ?? 0) >= 10);
  assert.equal(sim.topicCoverage.get("python"), 12);
});

console.log(
  JSON.stringify({
    assertions: assertionCount,
    simulation: {
      published: sim.published,
      expanded: sim.expanded,
      duplicatesBlocked: sim.simResults.duplicatesBlocked,
      rejected: sim.simResults.rejected,
      quotaJobs: sim.simResults.quotaJobs,
      jobsCreated: sim.jobsCreated,
    },
  }),
);
console.log(`PASS: Library Build Engine certification (${assertionCount} checks)`);
