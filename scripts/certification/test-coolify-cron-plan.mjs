import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const vercel = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8")).crons;
const plan = JSON.parse(readFileSync(resolve(root, "ops/coolify-cron-tasks.json"), "utf8"));

const key = (c) => c.path + " @ " + c.schedule;
assert.deepEqual(plan.tasks.map(key).sort(), vercel.map(key).sort(), "plan must cover every vercel.json cron exactly once");
assert.equal(new Set(plan.tasks.map((t) => t.name)).size, plan.tasks.length, "task names must be unique");
for (const t of plan.tasks) {
  assert.match(t.schedule, /^\S+ \S+ \S+ \S+ \S+$/, "five-field cron for " + t.name);
  assert.ok(t.path.startsWith("/api/cron/"), "cron path for " + t.name);
  assert.ok(["existing_in_coolify", "missing_in_coolify_do_not_enable_until_vercel_crons_are_off"].includes(t.status), "status for " + t.name);
}
const missing = plan.tasks.filter((t) => t.status.startsWith("missing"));
assert.equal(missing.length, 14, "14 runs are missing in Coolify");
assert.equal(missing.filter((t) => t.path.endsWith("webinar-follow-up")).length, 10);
assert.equal(missing.filter((t) => t.path.endsWith("content-factory")).length, 4);
assert.ok(plan.command_template.includes("$CRON_SECRET") && !/Bearer [A-Za-z0-9]{16,}/.test(plan.command_template), "no literal secret");
console.log("coolify cron plan checks passed");
