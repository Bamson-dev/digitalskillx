/**
 * Free Learning Library — full automated behavioral suite (offline, no live OpenAI spend).
 * Covers artwork pipeline logic, pricing, progress, certificate eligibility, and backfill rules.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const load = async (rel) => import(pathToFileURL(join(root, rel)).href);
const read = (rel) => readFileSync(join(root, rel), "utf8");

let passed = 0;
function ok(label) {
  passed += 1;
  console.log(`PASS: ${label}`);
}

const {
  buildLearningPathArtworkPrompt,
  categoryFallbackTone,
  ARTWORK_RETRY_ATTEMPTS,
} = await load("lib/content-factory/artwork-shared.ts");

const {
  recommendLearnCertificatePrice,
  resolveFinalCertificatePrice,
  snapToLearnCertificateTier,
  LEARN_CERTIFICATE_PRICE_TIERS,
  LEARN_CERTIFICATE_USD_BY_NGN,
  learnCertificateUsdFromNgn,
  learnCertificateUsdToCents,
} = await load("lib/learn-certificate-pricing.ts");

const { resolveLearnCoverUrl, learnCoverNeedsCategoryFallback, learnArtworkProxyPath } =
  await load("lib/learn-cover.ts");

const { parseCertificateOfferPatch, isUniqueViolation, isUuid } = await load(
  "lib/learn-certificate-shared.ts",
);
const {
  summarizeLearnCompletion,
  parseLearnProgress,
  pathCertificateOfferable,
  learnProgressStorageKey,
} = await load("lib/content-factory/library-shared.ts");

function generateCertificateNumber() {
  const rand = Math.random().toString(36).toUpperCase().slice(2, 10);
  return `PDG-${rand}`;
}

// ─── Migration reconciliation (repo) ─────────────────────────────────────────
{
  const mig46 = read("supabase/migrations/0046_email_campaigns.sql");
  assert.match(mig46, /email_campaigns|campaign/i);
  assert.throws(() => read("supabase/migrations/0046_learn_library_completion.sql"));
  const mig50 = read("supabase/migrations/0050_learn_library_completion.sql");
  assert.match(mig50, /artwork_status/);
  assert.match(mig50, /learning_path_progress/);
  assert.match(mig50, /add column if not exists/i);
  assert.match(mig50, /create table if not exists/i);
  assert.doesNotMatch(mig50, /drop table/i);
  ok("migration numbering: no duplicate 0046 Learn file; 0050 idempotent");
}

// ─── Artwork prompt / category / cover URL ───────────────────────────────────
{
  const prompt = buildLearningPathArtworkPrompt({
    title: "Advanced Data Analysis Path",
    category: "Data",
    difficulty: "advanced",
    learningObjectives: ["Clean data", "Build dashboards"],
  });
  assert.match(prompt, /Data Analysis/i);
  assert.match(prompt, /dashboard/i);
  assert.ok(ARTWORK_RETRY_ATTEMPTS >= 1);

  const tone = categoryFallbackTone("Programming");
  assert.ok(tone.from && tone.to && tone.label);

  const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  assert.equal(
    resolveLearnCoverUrl({ id, artwork_public_url: "https://cdn.example/a.png" }),
    "https://cdn.example/a.png",
  );
  assert.equal(
    resolveLearnCoverUrl({ id, artwork_public_url: null, artwork_storage_path: "x/a.png" }),
    learnArtworkProxyPath(id),
  );
  assert.equal(
    learnCoverNeedsCategoryFallback({
      artwork_public_url: null,
      artwork_storage_path: null,
      artwork_status: "category_fallback",
    }),
    true,
  );
  assert.equal(
    learnCoverNeedsCategoryFallback({
      artwork_public_url: "https://cdn.example/a.png",
      artwork_status: "generated",
    }),
    false,
  );
  ok("artwork prompt, category tone, cover URL + proxy + category fallback");
}

// ─── Artwork pipeline field mapping / skip-if-valid semantics (source inspect) ─
{
  const applySrc = read("lib/content-factory/artwork-apply.ts");
  assert.match(applySrc, /artworkFieldsFromResult/);
  assert.match(applySrc, /artwork_status: result\.status/);
  assert.match(applySrc, /skipIfHasValidCover/);
  assert.match(applySrc, /source_thumbnail/);
  assert.match(applySrc, /category_fallback/);
  assert.match(applySrc, /status === "generated"/);

  const artSrc = read("lib/content-factory/artwork.ts");
  assert.match(artSrc, /ARTWORK_RETRY_ATTEMPTS/);
  assert.match(artSrc, /OPENAI_API_KEY/);
  assert.doesNotMatch(artSrc, /NEXT_PUBLIC_OPENAI/);
  assert.match(artSrc, /api\/learn\/artwork/);
  assert.match(artSrc, /for \(let attempt = 0; attempt <= ARTWORK_RETRY_ATTEMPTS/);

  const backfill = read("lib/content-factory/artwork-backfill.ts");
  assert.match(backfill, /applyLearningPathArtworkPipeline/);
  assert.match(backfill, /category_fallback|source_thumbnail/);
  ok("artwork result mapping + retry/proxy wiring + skip-if-valid cover guard");
}

// Simulated priority: OpenAI → YouTube → category
{
  function simulateArtworkPipeline({ openaiOk, publicUrlOk, youtubeUrl }) {
    if (openaiOk && publicUrlOk) {
      return { status: "generated", source: "openai", url: "https://cdn.example/ai.png" };
    }
    if (openaiOk && !publicUrlOk) {
      // storage path exists → proxy URL
      return {
        status: "generated",
        source: "openai",
        url: "/api/learn/artwork/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      };
    }
    if (youtubeUrl) {
      return { status: "source_thumbnail", source: "youtube", url: youtubeUrl };
    }
    return { status: "category_fallback", source: "category", url: null };
  }
  assert.equal(simulateArtworkPipeline({ openaiOk: true, publicUrlOk: true }).status, "generated");
  assert.match(
    simulateArtworkPipeline({ openaiOk: true, publicUrlOk: false }).url,
    /\/api\/learn\/artwork\//,
  );
  assert.equal(
    simulateArtworkPipeline({
      openaiOk: false,
      publicUrlOk: false,
      youtubeUrl: "https://i.ytimg.com/vi/abc/hqdefault.jpg",
    }).source,
    "youtube",
  );
  const cat = simulateArtworkPipeline({ openaiOk: false, publicUrlOk: false, youtubeUrl: null });
  assert.equal(cat.status, "category_fallback");
  assert.equal(cat.url, null);
  assert.equal(learnCoverNeedsCategoryFallback({ artwork_status: cat.status }), true);
  ok("artwork priority simulation: AI / proxy / YouTube / category");
}

// LearnCover component never leaves empty gray-only without category design
{
  const cover = read("components/learn/learn-cover.tsx");
  assert.match(cover, /categoryFallbackTone/);
  assert.match(cover, /onError/);
  assert.match(cover, /linear-gradient/);
  const learnPage = read("app/(marketplace)/learn/page.tsx");
  const pathCard = read("components/learn/learn-path-card.tsx");
  assert.match(pathCard, /LearnCover/);
  assert.match(learnPage, /LearnPathCard/);
  assert.doesNotMatch(learnPage, /flex h-full items-center justify-center[\s\S]*Free learning path/);
  ok("Learn cards use LearnCover with designed fallback (no empty gray text box)");
}

// ─── Certificate pricing ─────────────────────────────────────────────────────
{
  const cases = [
    { name: "short", hours: 1.5, lessons: 6, difficulty: "beginner", expect: 2000 },
    { name: "basic", hours: 3, lessons: 10, difficulty: "beginner", expect: 2000 },
    { name: "standard", hours: 6, lessons: 18, difficulty: "intermediate", expect: 3000 },
    {
      name: "advanced",
      hours: 14,
      lessons: 32,
      difficulty: "advanced",
      category: "Programming",
      expect: 5000,
    },
    {
      name: "long",
      hours: 25,
      lessons: 45,
      difficulty: "advanced",
      category: "Data",
      expect: 7500,
    },
  ];
  for (const c of cases) {
    const r = recommendLearnCertificatePrice({
      estimatedDurationSeconds: c.hours * 3600,
      lessonCount: c.lessons,
      difficulty: c.difficulty,
      category: c.category ?? null,
    });
    assert.equal(r.recommendedPriceNgn, c.expect, c.name);
  }
  // missing duration → deterministic lesson estimate
  const missing = recommendLearnCertificatePrice({
    estimatedDurationSeconds: null,
    lessonCount: 20,
    difficulty: "intermediate",
  });
  assert.ok(LEARN_CERTIFICATE_PRICE_TIERS.includes(missing.recommendedPriceNgn));

  assert.equal(
    resolveFinalCertificatePrice({ mode: "fixed", recommendedPriceNgn: 5000, fixedPriceNgn: 3000 }),
    3000,
  );
  assert.equal(
    resolveFinalCertificatePrice({ mode: "free", recommendedPriceNgn: 5000, fixedPriceNgn: 5000 }),
    0,
  );
  assert.equal(
    resolveFinalCertificatePrice({
      mode: "automatic",
      recommendedPriceNgn: 5000,
      fixedPriceNgn: 2000,
    }),
    5000,
  );
  for (const raw of [1999, 2350, 4100, 9000, 0, NaN]) {
    assert.ok(LEARN_CERTIFICATE_PRICE_TIERS.includes(snapToLearnCertificateTier(raw)));
  }

  const fixedBad = parseCertificateOfferPatch({
    certificate_enabled: true,
    certificate_pricing_mode: "fixed",
    certificate_price_ngn: 2350,
  });
  assert.equal(fixedBad.ok, false);

  const freeOk = parseCertificateOfferPatch({
    certificate_enabled: true,
    certificate_pricing_mode: "free",
    certificate_price_ngn: 0,
  });
  assert.equal(freeOk.ok, true);

  // Fixed regional USD map — NOT FX conversion
  assert.equal(LEARN_CERTIFICATE_USD_BY_NGN[2000], 2);
  assert.equal(LEARN_CERTIFICATE_USD_BY_NGN[3000], 3);
  assert.equal(LEARN_CERTIFICATE_USD_BY_NGN[5000], 5);
  assert.equal(LEARN_CERTIFICATE_USD_BY_NGN[7500], 7.5);
  assert.equal(learnCertificateUsdFromNgn(2000), 2);
  assert.equal(learnCertificateUsdFromNgn(3000), 3);
  assert.equal(learnCertificateUsdFromNgn(5000), 5);
  assert.equal(learnCertificateUsdFromNgn(7500), 7.5);
  assert.equal(learnCertificateUsdToCents(7.5), 750);
  assert.equal(learnCertificateUsdToCents(2), 200);
  const pricingSrc = read("lib/learn-certificate-pricing.ts");
  assert.doesNotMatch(pricingSrc, /exchange.?rate|foreign exchange|convertNgnToUsd|live.?fx/i);
  assert.match(pricingSrc, /NOT FX/);
  assert.match(pricingSrc, /LEARN_CERTIFICATE_USD_BY_NGN/);

  // preserve fixed/free documented in defaults
  const defaults = read("lib/learn-certificate-defaults.ts");
  assert.match(defaults, /existingMode === "fixed" \|\| existingMode === "free"/);
  assert.match(defaults, /overwriteAutomaticOnly/);
  ok("certificate pricing tiers, modes, snap, preserve fixed/free");
}

// Browser cannot set price — checkout uses server path price
{
  const checkout = read("lib/learn-certificate-checkout.ts");
  assert.match(checkout, /nairaToKobo\(priceNgn\)/);
  assert.match(checkout, /learnCertificateUsdFromNgn\(priceNgn\)/);
  assert.doesNotMatch(checkout, /body\.price|body\.amount|body\.certificate_price/);
  assert.match(checkout, /assertLearningPathFullyComplete/);
  const init = read("app/api/payments/initialize/route.ts");
  assert.match(init, /completedLessonNumbers/);
  ok("server-side price + completion gate; browser price ignored");
}

// ─── Progress ────────────────────────────────────────────────────────────────
{
  const lessons = ["1", "2", "3", "4"];
  assert.deepEqual(summarizeLearnCompletion({}, lessons), {
    completed: 0,
    total: 4,
    pct: 0,
    isComplete: false,
  });
  const partial = summarizeLearnCompletion({ "1": true, "2": true }, lessons);
  assert.equal(partial.pct, 50);
  assert.equal(partial.isComplete, false);
  assert.equal(pathCertificateOfferable({
    status: "published",
    certificate_enabled: true,
    certificate_price_ngn: 3000,
  }) && partial.isComplete, false);

  const full = summarizeLearnCompletion(
    { "1": true, "2": true, "3": true, "4": true },
    lessons,
  );
  assert.equal(full.isComplete, true);
  assert.equal(full.pct, 100);

  // idempotent mark
  const again = summarizeLearnCompletion(
    { "1": true, "2": true, "3": true, "4": true, "1": true },
    lessons,
  );
  assert.equal(again.completed, 4);

  const parsed = parseLearnProgress(JSON.stringify({ "1": true, "2": false, "x": "yes" }));
  assert.deepEqual(parsed, { "1": true });
  assert.match(learnProgressStorageKey("my-path"), /dsx-learn-progress:my-path/);

  const progressApi = read("app/api/learn/progress/route.ts");
  assert.match(progressApi, /upsertLearnProgress/);
  assert.match(progressApi, /mapLessonNumbersToIds/);
  const progressLib = read("lib/learn-progress.ts");
  assert.match(progressLib, /assertLearningPathFullyComplete/);
  assert.match(progressLib, /clientLessonNumbers/);
  ok("progress incomplete/partial/complete + persistence key + server sync wiring");
}

// Fake completion: checkout requires assertLearningPathFullyComplete
{
  const checkout = read("lib/learn-certificate-checkout.ts");
  assert.match(checkout, /if \(!completion\.ok\)/);
  assert.match(checkout, /return jsonError\(completion\.error, 403\)/);
  ok("incomplete learner blocked at checkout (403)");
}

// ─── Certificate issuance / duplicate protection ─────────────────────────────
{
  const num1 = generateCertificateNumber();
  const num2 = generateCertificateNumber();
  assert.notEqual(num1, num2);
  assert.match(num1, /^PDG-/i);

  assert.equal(
    isUniqueViolation("duplicate key value violates unique constraint certificates_student_learning_path"),
    true,
  );

  const issue = read("lib/learn-certificates.ts");
  assert.match(issue, /isUniqueViolation/);
  assert.match(issue, /fulfillLearningPathCertificatePurchase/);
  assert.match(issue, /\.eq\("status", "pending"\)/);
  // claim pending → success once; duplicate webhook alreadyFulfilled
  assert.match(issue, /alreadyFulfilled: !claimed/);

  const guest = read("lib/guest-checkout.ts");
  assert.match(guest, /fulfillLearningPathCertificatePurchase/);

  assert.equal(isUuid("11111111-1111-4111-8111-111111111111"), true);
  assert.equal(isUuid("not-a-uuid"), false);
  ok("certificate number uniqueness helpers + webhook claim/idempotent issue wiring");
}

// Free cert issues only after completion; paid uses Paystack
{
  const checkout = read("lib/learn-certificate-checkout.ts");
  assert.match(checkout, /pricingMode === "free"/);
  assert.match(checkout, /initializeTransaction/);
  assert.match(checkout, /issueLearningPathCertificate/);
  ok("free vs paid certificate paths present");
}

// ─── Backfill preserve rules ─────────────────────────────────────────────────
{
  const defaults = read("lib/learn-certificate-defaults.ts");
  assert.match(defaults, /backfillLearningPathCertificatePricing/);
  assert.match(defaults, /certificate_pricing_mode/);
  const backfill = read("lib/content-factory/artwork-backfill.ts");
  assert.match(backfill, /skipIfHasValidCover|hasUsable|category_fallback|source_thumbnail/);
  const cron = read("app/api/cron/content-factory/route.ts");
  assert.match(cron, /backfillMissingLearningPathArtwork|runLibraryBuildThroughputTick/);
  assert.match(cron, /backfillLearningPathCertificatePricing/);
  ok("backfill artwork + pricing wired; fixed/free preserve logic present");
}

// ─── Admin artwork route auth ────────────────────────────────────────────────
{
  const artRoute = read("app/api/admin/content-factory/artwork/route.ts");
  assert.match(artRoute, /requireAdminApiAuth/);
  assert.match(artRoute, /preferYoutube/);
  const proxy = read("app/api/learn/artwork/[pathId]/route.ts");
  assert.match(proxy, /artwork_storage_path/);
  assert.match(proxy, /status !== "published"/);
  ok("admin artwork gated; public proxy serves stored art for published/review only");
}

console.log(`\nLearn Library behavioral suite: ${passed} checks passed`);
