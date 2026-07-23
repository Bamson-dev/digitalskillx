/**
 * Course resolver fallback behavior for bulk CSV imports.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { buildCourseResolver } = await import(
  pathToFileURL(join(root, "lib/course-resolver.ts")).href
);

const courses = [
  { id: "11111111-1111-4111-8111-111111111111", title: "Facebook Ad Mastery" },
  { id: "22222222-2222-4222-8222-222222222222", title: "How to Attract Buyers" },
];
const resolve = buildCourseResolver(courses);
const defaultId = courses[0].id;

assert.equal(resolve("", defaultId).courseId, defaultId);
assert.equal(resolve("Beast", defaultId).courseId, defaultId);
assert.equal(resolve("Beast", defaultId).error, undefined);
assert.equal(resolve("20-03-2026", defaultId).courseId, defaultId);
assert.equal(resolve("How to Attract Buyers", defaultId).courseId, courses[1].id);
assert.match(resolve("Beast", null).error ?? "", /Unknown course/);

console.log("PASS: course resolver fallback tests");
