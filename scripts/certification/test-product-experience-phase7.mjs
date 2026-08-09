#!/usr/bin/env node
/**
 * Phase 7 — Product experience / UX polish regression (offline).
 * Guards critical UX fixes without redesigning working systems.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let passed = 0;
function ok(label) {
  passed += 1;
  console.log(`PASS: ${label}`);
}

{
  const enroll = readFileSync(join(root, "components/marketplace/enroll-button.tsx"), "utf8");
  assert.match(enroll, /Continue in NGN|UsdCheckoutSwitch/);
  assert.ok(!/UsdComingSoonButton/.test(enroll) || /Continue in NGN/.test(enroll));
  ok("USD checkout offers Continue in NGN path");
}

{
  const mark = readFileSync(join(root, "components/student/mark-lesson-complete-button.tsx"), "utf8");
  assert.match(mark, /setError|catch/);
  assert.match(mark, /Could not mark|Try again|error/);
  ok("mark complete surfaces errors");
}

{
  const assign = readFileSync(join(root, "components/student/assignment-submit-form.tsx"), "utf8");
  assert.match(assign, /Link to your file|shareable link/i);
  assert.ok(!/<Label>File URL<\/Label>/.test(assign));
  ok("assignment file field uses human copy");
}

{
  const chrome = readFileSync(join(root, "components/marketplace/marketplace-chrome.tsx"), "utf8");
  assert.match(chrome, /href="\/support"[^>]*>\s*Contact/s);
  ok("footer Contact points to support");
}

{
  const ai = readFileSync(join(root, "components/student/ai-assistant.tsx"), "utf8");
  assert.match(ai, /bottom-20|bottom-24/);
  ok("AI assistant clears mobile bottom tabs");
}

{
  const browse = readFileSync(join(root, "components/marketplace/browse-catalog.tsx"), "utf8");
  assert.match(browse, /created_at/);
  ok("browse newest sort uses created_at");
}

{
  const side = readFileSync(join(root, "components/admin/admin-sidebar.tsx"), "utf8");
  assert.match(side, /label: "Customers"/);
  ok("admin nav uses Customers for CRM");
}

{
  const dash = readFileSync(join(root, "app/(admin)/admin/(panel)/dashboard/page.tsx"), "utf8");
  assert.ok(!/Profiles with student role|lesson_progress rows|Live counts from your database/.test(dash));
  assert.match(dash, /Learners|learner accounts|Course seats/);
  ok("admin dashboard copy is operator-friendly");
}

{
  const auto = readFileSync(join(root, "app/(admin)/admin/(panel)/automations/page.tsx"), "utf8");
  assert.match(auto, /ConfirmSubmitButton|TRIGGER_LABELS/);
  ok("automations use human labels + delete confirm");
}

{
  const sales = readFileSync(join(root, "app/(admin)/admin/(panel)/sales/page.tsx"), "utf8");
  assert.ok(!/\/api\/admin\/course-recommendations/.test(sales));
  assert.match(sales, /How to edit offers|guidance/);
  ok("sales admin avoids stub API exposure");
}

{
  const login = readFileSync(join(root, "components/auth/login-form.tsx"), "utf8");
  assert.match(login, /registered|Account created/);
  ok("login shows post-registration success");
}

{
  const certs = readFileSync(join(root, "app/(student)/certificates/page.tsx"), "utf8");
  assert.match(certs, /Go to my courses|\/courses/);
  ok("certificates empty state has next step");
}

{
  assert.ok(existsSync(join(root, "components/admin/confirm-submit-button.tsx")));
  ok("shared confirm submit control present");
}

console.log(`\nPhase 7 UX polish offline: ${passed}/13 passed`);
if (passed !== 13) process.exit(1);
