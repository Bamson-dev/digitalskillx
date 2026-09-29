#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const route = read("app/api/auth/forgot-password/route.ts");
assert.match(route, /sendStudentPasswordReset/);
assert.match(route, /export async function POST/);

const recovery = read("lib/auth/password-recovery.ts");
assert.match(recovery, /generateLink/);
assert.match(recovery, /createUser/);
assert.match(recovery, /type: "recovery"/);

const login = read("components/auth/login-form.tsx");
assert.match(login, /Forgot password — reset it here/);
assert.match(login, /href="\/forgot-password"/);

const studentForm = read("components/auth/student-password-login-form.tsx");
assert.match(studentForm, /Forgot password\? Get a reset link/);

const forgotForm = read("components/auth/forgot-password-form.tsx");
assert.match(forgotForm, /action="\/api\/auth\/forgot-password"/);

const callback = read("app/auth/callback/route.ts");
assert.match(callback, /skipDeviceLimit/);
assert.match(callback, /type === "recovery"/);

console.log("PASS — student login + forgot-password recovery guards");
