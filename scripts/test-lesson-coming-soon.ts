import assert from "node:assert/strict";
import {
  formatComingSoonAvailableAt,
  isLessonComingSoon,
  parseComingSoonAvailableAt,
} from "../lib/lesson-coming-soon";

assert.equal(isLessonComingSoon({ is_coming_soon: true }), true);
assert.equal(isLessonComingSoon({ is_coming_soon: false }), false);

const iso = parseComingSoonAvailableAt("2026-08-15T14:30");
assert.ok(iso);
assert.match(formatComingSoonAvailableAt(iso)!, /2026/);

console.log("PASS: lesson coming soon helpers");
