#!/usr/bin/env node
/**
 * Phase 4 — Classroom Intelligence regression (offline).
 * Covers existing helpers only — no redesign.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let passed = 0;
function ok(label) {
  passed += 1;
  console.log(`PASS: ${label}`);
}

{
  const { resolveNextBestAction } = await import(
    pathToFileURL(join(root, "lib/classroom-next-action.ts")).href
  );
  assert.equal(
    resolveNextBestAction({
      lessonCompleted: false,
      courseId: "c1",
    }),
    null,
  );
  const quiz = resolveNextBestAction({
    lessonCompleted: true,
    quizId: "q1",
    quizPassed: false,
    courseId: "c1",
    nextLessonId: "l2",
  });
  assert.equal(quiz?.kind, "take_quiz");
  const next = resolveNextBestAction({
    lessonCompleted: true,
    courseId: "c1",
    nextLessonId: "l2",
  });
  assert.equal(next?.kind, "next_lesson");
  assert.match(next?.href ?? "", /\/lessons\/l2/);
  const cert = resolveNextBestAction({
    lessonCompleted: true,
    courseId: "c1",
    courseComplete: true,
    certificateId: "cert1",
  });
  assert.equal(cert?.kind, "view_certificate");
  ok("next lesson / quiz / certificate next-best-action");
}

{
  const {
    buildClassroomMoment,
    momentAllowsDance,
  } = await import(pathToFileURL(join(root, "lib/classroom-engagement.ts")).href);

  assert.equal(momentAllowsDance("lesson_complete"), false);
  assert.equal(momentAllowsDance("streak_7_day"), false);
  assert.equal(momentAllowsDance("course_complete"), true);
  assert.equal(momentAllowsDance("certificate_unlock"), true);

  const streak = buildClassroomMoment("streak_7_day", { days: 7 });
  assert.equal(streak.kind, "streak_7_day");
  assert.equal(streak.allowDance, false);
  assert.ok(["energetic", "bigger", "small"].includes(streak.level));

  const complete = buildClassroomMoment("course_complete");
  assert.equal(complete.allowDance, true);
  assert.ok(complete.durationMs > 0);

  const welcome = buildClassroomMoment("dashboard_welcome");
  assert.equal(welcome.allowDance, false);
  ok("achievements / streaks / celebration dance gates");
}

{
  const host = readFileSync(join(root, "components/student/classroom-moment-host.tsx"), "utf8");
  assert.match(host, /prefers-reduced-motion/);
  assert.match(host, /allowDance/);
  const quizReveal = readFileSync(join(root, "components/student/quiz-score-reveal.tsx"), "utf8");
  assert.match(quizReveal, /prefers-reduced-motion/);
  ok("reduced-motion guards in classroom UI");
}

{
  const dash = readFileSync(join(root, "app/(student)/dashboard/page.tsx"), "utf8");
  assert.match(dash, /Continue learning/i);
  assert.match(dash, /Resume lesson|continueResumePath|preferContinue/);
  assert.match(dash, /progress|next lesson|courses/i);
  assert.ok(existsSync(join(root, "lib/recommendations.ts")));
  const recSrc = readFileSync(join(root, "lib/recommendations.ts"), "utf8");
  assert.match(recSrc, /export function recommendCourses/);
  assert.match(recSrc, /owned\.has|!owned\.has/);
  assert.match(recSrc, /filterStorefrontCourses/);
  ok("dashboard Continue Learning + recommendations ownership filter");
}

{
  const analytics = readFileSync(join(root, "app/(admin)/admin/(panel)/analytics/page.tsx"), "utf8");
  assert.match(analytics, /drop-off|completion|watch/i);
  const lessonPage = readFileSync(join(root, "app/(student)/lessons/[id]/page.tsx"), "utf8");
  assert.match(lessonPage, /companionEnabled|celebrationsEnabled|bookmarks/);
  ok("admin learning analytics + classroom lesson surface");
}

{
  const completion = readFileSync(join(root, "lib/course-completion.ts"), "utf8");
  assert.match(completion, /issueCertificate|completed_at|course_completed/);
  ok("course completion path present");
}

console.log(`\nPhase 4 classroom intelligence offline: ${passed}/6 passed`);
if (passed !== 6) process.exit(1);
