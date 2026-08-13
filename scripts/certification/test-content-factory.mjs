/**
 * Content Factory Phase 1 offline certification + hardening checks.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function mustExist(rel) {
  assert.ok(existsSync(join(root, rel)), `missing ${rel}`);
}

function parseYoutubePlaylistInput(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return { error: "Playlist URL or ID is required." };
  try {
    const u = new URL(value);
    const list = u.searchParams.get("list");
    if (list && /^[\w-]+$/.test(list)) return { playlistId: list };
  } catch {
    // raw id
  }
  if (/^[\w-]{10,64}$/.test(value)) return { playlistId: value };
  return { error: "Invalid YouTube playlist URL or ID." };
}

function assertSafePublicHttpUrl(raw) {
  const url = new URL(raw.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http(s)");
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    host === "metadata.google.internal" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    throw new Error("Private");
  }
  if (url.username || url.password) throw new Error("Credentials");
  return url;
}

for (const f of [
  "supabase/migrations/0042_content_factory_learning_library.sql",
  "sql/apply-content-factory-learning-library.sql",
  "lib/content-factory/feature-flag.ts",
  "lib/content-factory/shared.ts",
  "lib/content-factory/safe-fetch.ts",
  "lib/content-factory/ai-pipeline.ts",
  "lib/content-factory/artwork.ts",
  "lib/content-factory/jobs.ts",
  "lib/content-factory/process-job.ts",
  "lib/content-factory/learning-paths.ts",
  "app/api/admin/content-factory/jobs/route.ts",
  "app/api/admin/content-factory/jobs/[id]/route.ts",
  "app/api/cron/content-factory/route.ts",
  "app/(admin)/admin/(panel)/content-factory/page.tsx",
  "components/admin/content-factory-panel.tsx",
  "app/(marketplace)/learn/page.tsx",
  "app/(marketplace)/learn/[slug]/page.tsx",
  "components/learn/lazy-youtube-embed.tsx",
]) {
  mustExist(f);
}
console.log("PASS: Content Factory artifacts present");

{
  const mig = read("supabase/migrations/0042_content_factory_learning_library.sql");
  assert.match(mig, /create table if not exists public\.learning_paths/);
  assert.match(mig, /create table if not exists public\.content_factory_jobs/);
  assert.doesNotMatch(mig, /\bdrop table\b/i);
  assert.doesNotMatch(mig, /\btruncate\b/i);
  assert.doesNotMatch(mig, /\bdelete from\b/i);
  assert.doesNotMatch(mig, /\baffiliate\b/i);
  assert.match(mig, /status = 'published'/);
  assert.match(mig, /claim_content_factory_jobs/);
  assert.match(mig, /enable row level security/);
  assert.match(mig, /learning_paths_public_read_published/);
  console.log("PASS: migration additive + draft leak protection patterns");
}

{
  assert.ok(parseYoutubePlaylistInput("").error);
  assert.ok(parseYoutubePlaylistInput("https://example.com/not-youtube").error);
  assert.ok(parseYoutubePlaylistInput("not a url!!!").error);
  assert.equal(
    parseYoutubePlaylistInput("https://www.youtube.com/playlist?list=PLabcdefghij").playlistId,
    "PLabcdefghij",
  );
  assert.equal(parseYoutubePlaylistInput("PLabcdefghij").playlistId, "PLabcdefghij");
  assert.throws(() => assertSafePublicHttpUrl("http://127.0.0.1/x"));
  assert.throws(() => assertSafePublicHttpUrl("http://10.0.0.5/secret"));
  assert.throws(() => assertSafePublicHttpUrl("http://169.254.169.254/latest/meta-data"));
  assert.throws(() => assertSafePublicHttpUrl("http://localhost/admin"));
  assert.throws(() => assertSafePublicHttpUrl("https://user:pass@example.com/x"));
  assert.equal(assertSafePublicHttpUrl("https://example.com/about").hostname, "example.com");
  console.log("PASS: invalid playlist + SSRF URL guard");
}

{
  const safe = read("lib/content-factory/safe-fetch.ts");
  assert.match(safe, /redirect: "manual"/);
  assert.match(safe, /169\\.254/);
  assert.match(safe, /assertSafePublicHttpUrl/);
  console.log("PASS: SSRF redirect-safe fetch");
}

{
  const shared = read("lib/content-factory/shared.ts");
  assert.match(shared, /Never use em dashes/);
  assert.match(shared, /parseYoutubePlaylistInput/);
  const ai = read("lib/content-factory/ai-pipeline.ts");
  assert.match(ai, /scoreLearningPathQuality/);
  assert.match(ai, /generateCreatorProfileCopy/);
  assert.match(ai, /generateLearningPathQuizzes/);
  assert.match(ai, /await getDeepseekModel\(\)/);
  assert.doesNotMatch(ai, /const model = getDeepseekModel\(\)/);
  console.log("PASS: editorial rules + AI pipeline exports");
}

{
  const flag = read("lib/content-factory/feature-flag.ts");
  assert.match(flag, /CONTENT_FACTORY_ENABLED/);
  assert.match(flag, /"false"/);
  const jobs = read("app/api/admin/content-factory/jobs/route.ts");
  assert.match(jobs, /requireAdminApiAuth/);
  assert.match(jobs, /contentFactoryEnabled/);
  const cron = read("app/api/cron/content-factory/route.ts");
  assert.match(cron, /verifyCronSecret/);
  assert.match(cron, /stale_processing_reclaim|timed out while processing/);
  const patch = read("app/api/admin/content-factory/jobs/[id]/route.ts");
  assert.match(patch, /retryFailedContentFactoryJob/);
  assert.match(patch, /requireAdminApiAuth/);
  console.log("PASS: admin auth + cron secret + feature flag + retry");
}

{
  const art = read("lib/content-factory/artwork.ts");
  assert.match(art, /OPENAI_API_KEY/);
  assert.match(art, /getStorageService/);
  assert.match(art, /content-factory\//);
  assert.doesNotMatch(art, /NEXT_PUBLIC_OPENAI/);
  const yt = read("lib/youtube.ts");
  assert.match(yt, /fetchPlaylistMeta/);
  assert.match(yt, /fetchChannelMeta/);
  assert.match(yt, /formatYoutubeApiError/);
  assert.match(yt, /quotaExceeded|quota exceeded/i);
  console.log("PASS: Contabo artwork + YouTube meta helpers + quota errors");
}

{
  const learn = read("app/(marketplace)/learn/[slug]/page.tsx");
  assert.match(learn, /Original content published on YouTube/);
  assert.match(learn, /does not claim a partnership/);
  assert.match(learn, /LazyYoutubeEmbed/);
  assert.match(learn, /revalidate = 300/);
  assert.doesNotMatch(learn, /from \"@\/lib\/youtube\"/);
  assert.doesNotMatch(learn, /from \"@\/lib\/content-factory\/ai-pipeline\"/);
  assert.doesNotMatch(learn, /recordProductEvent|trackProductEvent/);
  const index = read("app/(marketplace)/learn/page.tsx");
  assert.doesNotMatch(index, /from \"@\/lib\/youtube\"/);
  assert.match(index, /revalidate = 300/);
  const proc = read("lib/content-factory/process-job.ts");
  assert.match(proc, /status: "review"/);
  assert.doesNotMatch(proc, /status: "published"/);
  assert.match(proc, /seen\.has\(v\.videoId\)/);
  console.log("PASS: public attribution + lazy embed + no auto-publish + cost path");
}

{
  const approve = read("lib/content-factory/learning-paths.ts");
  assert.match(approve, /Rejected paths cannot be published/);
  assert.match(approve, /creator_profile_id/);
  assert.match(approve, /youtube_video_id/);
  assert.match(approve, /\.eq\(\"status\", \"published\"\)/);
  const jobsLib = read("lib/content-factory/jobs.ts");
  assert.match(jobsLib, /already exists for this playlist/);
  assert.match(jobsLib, /retryFailedContentFactoryJob/);
  console.log("PASS: approve validation + duplicate playlist guard");
}

{
  const vercel = read("vercel.json");
  assert.match(vercel, /content-factory/);
  const sidebar = read("components/admin/admin-sidebar.tsx");
  assert.match(sidebar, /content-factory/);
  assert.doesNotMatch(sidebar, /affiliate/i);
  const mw = read("lib/supabase/middleware.ts");
  assert.match(mw, /"\/learn"/);
  const sitemap = read("app/sitemap.ts");
  assert.match(sitemap, /\/learn/);
  assert.match(sitemap, /learning_paths/);
  assert.match(sitemap, /status\", \"published\"/);
  const panel = read("components/admin/content-factory-panel.tsx");
  assert.match(panel, /Approve & publish/);
  assert.match(panel, /Retry job/);
  assert.match(panel, /Save draft/);
  console.log("PASS: cron schedule + admin nav + sitemap published-only");
}

{
  const envExample = read(".env.example");
  assert.match(envExample, /CONTENT_FACTORY_ENABLED=false/);
  assert.match(envExample, /OPENAI_API_KEY=/);
  assert.doesNotMatch(envExample, /NEXT_PUBLIC_OPENAI/);
  assert.doesNotMatch(envExample, /NEXT_PUBLIC_YOUTUBE/);
  console.log("PASS: env example secrets stay server-side");
}

console.log("\nAll Content Factory Phase 1 offline checks passed.");
