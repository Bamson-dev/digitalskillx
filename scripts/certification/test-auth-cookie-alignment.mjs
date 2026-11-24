#!/usr/bin/env node
/**
 * Regression guard for the session cookie and the sign-in paths.
 * Session cookie is a signed JWT named dsx-session; old sb-* cookies must be cleared.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (rel) => readFileSync(join(root, rel), "utf8");

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
}

const jwt = read("lib/db/jwt.ts");
assert(jwt.includes('SESSION_COOKIE_NAME = "dsx-session"'), "session cookie is pinned to dsx-session");
assert(jwt.includes("httpOnly: true") && jwt.includes('sameSite: "lax"'), "session cookie is httpOnly and SameSite=Lax");

const authCookie = read("lib/supabase/auth-cookie.ts");
assert(authCookie.includes("AUTH_STORAGE_KEY = SESSION_COOKIE_NAME"), "auth cookie key follows the session cookie name");
assert(authCookie.includes("sb-www-auth-token"), "legacy sb-www cookie from the old host is cleared");

for (const f of ["lib/supabase/server.ts", "lib/supabase/route-handler.ts"]) {
  assert(read(f).includes("createRequestClient"), `${f} builds a cookie-bound request client`);
}
const mw = read("lib/supabase/middleware.ts");
assert(mw.includes("verifyAccessToken"), "middleware verifies the session token statelessly");
assert(mw.includes("allowContinuity"), "middleware keeps course-continuity access during outages");

const login = read("app/api/auth/login/route.ts");
assert(!login.includes("failClosed: true"), "student login does not fail-closed on rate-limit store outages");

const studentLogin = read("lib/auth/run-student-login.ts");
assert(studentLogin.includes("studentFacingLoginError"), "student login maps auth errors to recovery guidance");
assert(
  (studentLogin.match(/course access reconciliation failed/g) ?? []).length === 1 &&
    (studentLogin.match(/certificate reconciliation failed/g) ?? []).length === 1,
  "course and certificate repair failures are isolated from valid password login",
);
assert(
  read("app/(auth)/actions.ts").includes("supabase.auth.setSession(result.session)") &&
    read("app/(auth)/login-actions.ts").includes("supabase.auth.setSession(result.session)"),
  "server-action login paths persist the verified session before redirecting",
);

if (process.exitCode) {
  console.error("\nAuth cookie alignment regressions found.");
  process.exit(1);
}
console.log("\nPASS: auth cookie alignment guards OK");
