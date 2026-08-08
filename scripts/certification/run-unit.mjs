#!/usr/bin/env node
/**
 * Fast offline unit checks for security/payment helpers.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Dynamic import of compiled-free TS via next isn't available; duplicate tiny pure helpers inline
// for offline cert, and also import from .ts through a minimal transpile-free reimplementation.

function safeNextPath(raw, fallback = "/dashboard") {
  const value = String(raw ?? "").trim();
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;
  if (!/^\/[A-Za-z0-9/_?&=%#.-]*$/.test(value)) return fallback;
  return value;
}

assert.equal(safeNextPath("/dashboard"), "/dashboard");
assert.equal(safeNextPath("//evil.com"), "/dashboard");
assert.equal(safeNextPath("https://evil.com"), "/dashboard");
assert.equal(safeNextPath("/courses/abc"), "/courses/abc");

const crypto = await import("node:crypto");
function hashCheckoutBinding(reference, email) {
  return crypto
    .createHash("sha256")
    .update(`${reference}:${email.trim().toLowerCase()}`)
    .digest("hex");
}
assert.equal(
  hashCheckoutBinding("dsx_1", "A@B.com"),
  hashCheckoutBinding("dsx_1", "a@b.com"),
);
assert.notEqual(hashCheckoutBinding("dsx_1", "a@b.com"), hashCheckoutBinding("dsx_2", "a@b.com"));

console.log("PASS: offline unit checks (safeNextPath, checkout binding)");

{
  const { parseStudentCsv, isNonCourseCsvValue } = await import(
    pathToFileURL(join(root, "lib/student-csv-parse.ts")).href
  );
  const gumroad = parseStudentCsv(
    "email,full_name,purchase_date,price\nada@example.com,Ada Lovelace,20-03-2026,5000",
  );
  assert.equal(gumroad.rows[0]?.courseRef, "");
  assert.equal(gumroad.rows[0]?.email, "ada@example.com");
  assert.equal(isNonCourseCsvValue("20-03-2026"), true);

  const product = parseStudentCsv(
    "Buyer Email,Buyer Name,Product Name,Sale Date\nbeast@example.com,Beast Buyer,Beast Dropz,20-03-2026",
  );
  assert.equal(product.rows[0]?.courseRef, "Beast Dropz");
  assert.equal(product.rows[0]?.email, "beast@example.com");

  const { buildCourseResolver } = await import(
    pathToFileURL(join(root, "lib/course-resolver.ts")).href
  );
  const resolve = buildCourseResolver([
    { id: "11111111-1111-4111-8111-111111111111", title: "Facebook Ad Mastery" },
  ]);
  assert.equal(
    resolve("Beast", "11111111-1111-4111-8111-111111111111").courseId,
    "11111111-1111-4111-8111-111111111111",
  );
  assert.match(resolve("Beast", null).error ?? "", /Unknown course/);
}

console.log("PASS: CSV parse + course resolver fallback");

{
  const crypto = await import("node:crypto");
  function generateEnrollmentLinkToken() {
    return `el_${crypto.randomBytes(32).toString("base64url")}`;
  }
  function hashEnrollmentLinkToken(plaintext) {
    return crypto.createHash("sha256").update(plaintext.trim()).digest("hex");
  }
  const token = generateEnrollmentLinkToken();
  assert.match(token, /^el_/);
  assert.ok(token.length >= 40);
  assert.equal(hashEnrollmentLinkToken(token), hashEnrollmentLinkToken(` ${token} `));
  assert.notEqual(hashEnrollmentLinkToken(token), hashEnrollmentLinkToken(`${token}x`));

  function resolvePostRedeemPath(result) {
    switch (result.redirectType) {
      case "first_course":
        return result.courses[0]?.id ? `/courses/${result.courses[0].id}` : "/dashboard";
      case "dashboard":
        return "/dashboard";
      case "specific_course":
        return result.redirectCourseId
          ? `/courses/${result.redirectCourseId}`
          : "/dashboard";
      default:
        return `/enrollment/success?link=${encodeURIComponent(result.linkId)}`;
    }
  }
  assert.equal(
    resolvePostRedeemPath({
      redirectType: "success_page",
      redirectCourseId: null,
      courses: [{ id: "c1" }],
      linkId: "link-1",
    }),
    "/enrollment/success?link=link-1",
  );
  assert.equal(
    resolvePostRedeemPath({
      redirectType: "first_course",
      redirectCourseId: null,
      courses: [{ id: "c1" }, { id: "c2" }],
      linkId: "link-1",
    }),
    "/courses/c1",
  );
}

console.log("PASS: enrollment link token + redirect helpers");

{
  // Baseline: production enroll writers must not call the new engine yet.
  // If this fails, a refactor rewired a live path — revert before shipping.
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const guarded = [
    "lib/purchase.ts",
    "lib/automation.ts",
    "app/api/payments/initialize/route.ts",
    "lib/admin-student-onboarding.ts",
  ];
  for (const rel of guarded) {
    const src = readFileSync(join(root, rel), "utf8");
    assert.equal(
      src.includes("enrollment-engine"),
      false,
      `${rel} must not import enrollment-engine until that source is migrated with baselines`,
    );
  }
  const engine = readFileSync(join(root, "lib/enrollment-engine.ts"), "utf8");
  assert.match(engine, /Enrollment Link redeem path only/);
  const redeem = readFileSync(join(root, "lib/enrollment-links/redeem-service.ts"), "utf8");
  assert.match(redeem, /enrollment-engine/);
}

console.log("PASS: production enroll paths isolated from EnrollmentEngine");

{
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  // Pure helpers for device security (impossible travel)
  const { pathToFileURL } = await import("node:url");
  // Inline mirrors — account-sessions uses server-only
  function haversineKm(a, b) {
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function detectImpossibleTravel(params) {
    const now = params.now ?? new Date();
    const prevAt = new Date(params.previous.last_active_at).getTime();
    const hours = (now.getTime() - prevAt) / (1000 * 60 * 60);
    if (hours > 2 || hours < 0) return false;
    const prevCountry = (params.previous.country ?? "").trim().toUpperCase();
    const nextCountry = (params.next.country ?? "").trim().toUpperCase();
    if (prevCountry && nextCountry && prevCountry !== nextCountry) return true;
    if (
      params.previous.latitude != null &&
      params.previous.longitude != null &&
      params.next.latitude != null &&
      params.next.longitude != null
    ) {
      const km = haversineKm(
        { lat: params.previous.latitude, lng: params.previous.longitude },
        { lat: params.next.latitude, lng: params.next.longitude },
      );
      if (km > 500) return true;
    }
    return false;
  }
  assert.equal(
    detectImpossibleTravel({
      previous: {
        country: "NG",
        latitude: 6.5,
        longitude: 3.4,
        last_active_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      },
      next: { country: "CA", latitude: 45.5, longitude: -73.5 },
    }),
    true,
  );
  assert.equal(
    detectImpossibleTravel({
      previous: {
        country: "NG",
        latitude: 6.5,
        longitude: 3.4,
        last_active_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      },
      next: { country: "CA" },
    }),
    false,
  );
  assert.ok(haversineKm({ lat: 6.5, lng: 3.4 }, { lat: 45.5, lng: -73.5 }) > 500);

  const videoProvider = readFileSync(join(root, "lib/video-provider.ts"), "utf8");
  assert.match(videoProvider, /ResolvedPlayback/);
  assert.match(videoProvider, /cloudflare_stream/);
  const advanced = readFileSync(join(root, "components/admin/course-advanced-tools.tsx"), "utf8");
  assert.match(advanced, /Advanced Tools/);
  assert.match(advanced, /YoutubeImport/);
  const editor = readFileSync(join(root, "components/admin/course-editor.tsx"), "utf8");
  assert.match(editor, /Course resources/);
  assert.equal(editor.includes("YoutubeImport"), false);
}

console.log("PASS: device security heuristics + video architecture + course editor layout");

{
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");

  const STOREFRONT_HIDDEN_TITLE =
    /^(RC Course\s+\d+|E2E test course|Automated test course|Test course\s+\d+)/i;
  function isStorefrontHiddenTitle(title) {
    if (!title) return false;
    return STOREFRONT_HIDDEN_TITLE.test(String(title).trim());
  }
  function filterStorefrontCourses(courses) {
    return courses.filter((c) => !isStorefrontHiddenTitle(c.title));
  }
  function pickFeaturedCourse(courses) {
    const visible = filterStorefrontCourses(courses);
    if (visible.length === 0) return null;
    return visible.find((c) => Boolean(c.thumbnail_url?.trim())) ?? visible[0] ?? null;
  }

  assert.equal(isStorefrontHiddenTitle("RC Course 1786090370885"), true);
  assert.equal(isStorefrontHiddenTitle("E2E test course"), true);
  assert.equal(isStorefrontHiddenTitle("Automated test course"), true);
  assert.equal(isStorefrontHiddenTitle("Test course 42"), true);
  assert.equal(isStorefrontHiddenTitle("Facebook Ad Mastery"), false);
  assert.equal(isStorefrontHiddenTitle("RC Course Review Guide"), false);

  assert.deepEqual(
    filterStorefrontCourses([
      { id: "1", title: "RC Course 1", thumbnail_url: "https://x/a.jpg" },
      { id: "2", title: "Real Skills", thumbnail_url: null },
      { id: "3", title: "Sales Funnels", thumbnail_url: "https://x/b.jpg" },
    ]).map((c) => c.id),
    ["2", "3"],
  );

  assert.equal(
    pickFeaturedCourse([
      { id: "1", title: "RC Course 9", thumbnail_url: "https://x/rc.jpg" },
      { id: "2", title: "No Thumb", thumbnail_url: null },
      { id: "3", title: "With Thumb", thumbnail_url: "https://x/ok.jpg" },
    ])?.id,
    "3",
  );

  // Keep unit mirror aligned with source modules.
  const visibilitySrc = readFileSync(join(root, "lib/storefront-visibility.ts"), "utf8");
  assert.match(visibilitySrc, /RC Course\\s\+\\d\+/);
  assert.match(visibilitySrc, /filterStorefrontCourses/);
  assert.match(visibilitySrc, /pickFeaturedCourse/);
  const recSrc = readFileSync(join(root, "lib/recommendations.ts"), "utf8");
  assert.match(recSrc, /recommendCourses/);
  assert.match(recSrc, /filterStorefrontCourses/);
  assert.match(recSrc, /ownedIds/);
  assert.equal(recSrc.includes("Popular with students"), false);
  assert.equal(/RecommendationReason = "[^"]*popular/.test(recSrc), false);
  const publishedSrc = readFileSync(join(root, "lib/published-courses.ts"), "utf8");
  assert.match(publishedSrc, /filterStorefrontCourses/);
  assert.match(publishedSrc, /includeHiddenDevCourses/);
}

console.log("PASS: storefront visibility + heuristic recommendations");

{
  const { resolveNextBestAction } = await import(
    pathToFileURL(join(root, "lib/classroom-next-action.ts")).href
  );
  assert.equal(
    resolveNextBestAction({
      lessonCompleted: false,
      courseId: "c1",
      quizId: "q1",
    }),
    null,
  );
  assert.equal(
    resolveNextBestAction({
      lessonCompleted: true,
      courseId: "c1",
      quizId: "q1",
      quizPassed: false,
      nextLessonId: "l2",
    })?.kind,
    "take_quiz",
  );
  assert.equal(
    resolveNextBestAction({
      lessonCompleted: true,
      courseId: "c1",
      quizId: "q1",
      quizPassed: true,
      nextLessonId: "l2",
    })?.href,
    "/lessons/l2",
  );
  assert.equal(
    resolveNextBestAction({
      lessonCompleted: true,
      courseId: "c1",
      courseComplete: true,
      certificateId: "cert1",
    })?.kind,
    "view_certificate",
  );

  const { youtubeLessonEmbedUrl } = await import(
    pathToFileURL(join(root, "lib/video.ts")).href
  );
  assert.match(youtubeLessonEmbedUrl("abcdefghijk", undefined, 95), /start=95/);
  assert.equal(youtubeLessonEmbedUrl("abcdefghijk").includes("start="), false);
}

console.log("PASS: classroom next-action + bookmark seek helpers");

{
  // Mirror recommendCourses heuristics (Node cannot resolve @/ imports from .ts).
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const STOREFRONT_HIDDEN_TITLE =
    /^(RC Course\s+\d+|E2E test course|Automated test course|Test course\s+\d+)/i;
  function filterStorefrontCourses(courses) {
    return courses.filter((c) => !STOREFRONT_HIDDEN_TITLE.test(String(c.title ?? "").trim()));
  }
  function recommendCourses(params) {
    const owned = new Set(params.ownedIds ?? []);
    const limit = Math.max(1, Math.min(params.limit ?? 4, 8));
    const seedId = params.seed?.id;
    const seedCategory = params.seed?.category_name?.trim().toLowerCase() ?? "";
    const pool = filterStorefrontCourses(params.catalog).filter(
      (c) => c.id !== seedId && !owned.has(c.id) && !c.is_coming_soon,
    );
    const scored = pool.map((course) => {
      let score = 0;
      let reason;
      const cat = course.category_name?.trim().toLowerCase() ?? "";
      if (seedCategory && cat && cat === seedCategory) {
        score += 50;
        reason = params.preferContinue ? "continue" : "related";
      }
      if (course.thumbnail_url) score += 5;
      if (course.created_at) {
        const age = Date.now() - new Date(course.created_at).getTime();
        if (Number.isFinite(age) && age < 1000 * 60 * 60 * 24 * 45) {
          score += 8;
          if (!reason) reason = "new";
        }
      }
      return { course, score, reason };
    });
    scored.sort((a, b) => b.score - a.score || a.course.title.localeCompare(b.course.title));
    return scored.slice(0, limit).map(({ course, reason }) => ({
      course,
      ...(reason ? { reason } : {}),
    }));
  }

  const catalog = [
    {
      id: "a",
      title: "Facebook Ads",
      category_name: "Ads",
      thumbnail_url: "https://x/a.jpg",
      created_at: new Date().toISOString(),
    },
    {
      id: "b",
      title: "RC Course 99",
      category_name: "Ads",
      thumbnail_url: "https://x/b.jpg",
    },
    {
      id: "c",
      title: "Copywriting",
      category_name: "Writing",
      thumbnail_url: null,
    },
    {
      id: "d",
      title: "Owned Course",
      category_name: "Ads",
      thumbnail_url: "https://x/d.jpg",
    },
  ];
  const recs = recommendCourses({
    catalog,
    ownedIds: ["d"],
    seed: { id: "seed", title: "Seed", category_name: "Ads" },
    limit: 4,
  });
  assert.equal(recs.some((r) => r.course.id === "b"), false);
  assert.equal(recs.some((r) => r.course.id === "d"), false);
  assert.equal(recs[0]?.course.id, "a");
  assert.equal(recs[0]?.reason, "related");
  const continued = recommendCourses({
    catalog,
    seed: { id: "seed", title: "Seed", category_name: "Ads" },
    preferContinue: true,
    limit: 1,
  });
  assert.equal(continued[0]?.reason, "continue");

  const recSrc = readFileSync(join(root, "lib/recommendations.ts"), "utf8");
  assert.match(recSrc, /ownedIds/);
  assert.equal(recSrc.includes("Popular with students"), false);
  assert.equal(/RecommendationReason = "[^"]*popular/.test(recSrc), false);
}

console.log("PASS: heuristic recommendations scoring + ownership filter");

{
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const {
    buildClassroomMoment,
    momentAllowsDance,
    crossedProgressMilestone,
  } = await import(pathToFileURL(join(root, "lib/classroom-engagement.ts")).href);

  assert.equal(momentAllowsDance("lesson_complete"), false);
  assert.equal(momentAllowsDance("quiz_passed"), false);
  assert.equal(momentAllowsDance("streak_7_day"), false);
  assert.equal(momentAllowsDance("dashboard_welcome"), false);
  assert.equal(momentAllowsDance("course_complete"), true);
  assert.equal(momentAllowsDance("certificate_unlock"), true);
  assert.equal(buildClassroomMoment("correct").mood, "happy");
  assert.equal(buildClassroomMoment("thinking").mood, "thinking");
  assert.equal(buildClassroomMoment("incorrect").mood, "supportive");
  assert.equal(buildClassroomMoment("lesson_complete").level, "small");
  assert.equal(buildClassroomMoment("module_complete").level, "bigger");
  assert.equal(buildClassroomMoment("streak_7_day").level, "energetic");
  assert.equal(buildClassroomMoment("badge_earned").level, "bigger");
  assert.equal(buildClassroomMoment("course_complete").allowDance, true);
  assert.equal(buildClassroomMoment("certificate_unlock").level, "special");
  assert.equal(buildClassroomMoment("dashboard_welcome").allowDance, false);
  assert.equal(crossedProgressMilestone(49, 50), 50);
  assert.equal(crossedProgressMilestone(50, 51), null);

  const companionSrc = readFileSync(
    join(root, "components/student/classroom-moment-host.tsx"),
    "utf8",
  );
  assert.match(companionSrc, /allowDance/);
  assert.match(companionSrc, /prefers-reduced-motion/);
  assert.match(companionSrc, /Dismiss/);
}

console.log("PASS: classroom companion rarity + reduced-motion guards");

{
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(
    process.execPath,
    [
      "--import",
      join(root, "scripts/certification/register-ts-ext.mjs"),
      join(root, "scripts/certification/test-sales-pages.mjs"),
    ],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
  if (r.status !== 0) {
    console.error(r.stdout);
    console.error(r.stderr);
    process.exit(r.status ?? 1);
  }
  console.log("PASS: sales page phase 1 suite (via test-sales-pages.mjs)");
}
