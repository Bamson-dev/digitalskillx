#!/usr/bin/env node
/**
 * Regression guard: auth cookie hostname must never drift again.
 * Fails if session clients omit the pinned cookie name or prefer Kong for cookies.
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

const authCookie = read("lib/supabase/auth-cookie.ts");
assert(
  authCookie.includes('AUTH_STORAGE_KEY = "sb-www-auth-token"'),
  "AUTH_STORAGE_KEY pinned to sb-www-auth-token (matches live sessions)",
);
assert(
  authCookie.includes("sb-supabase-auth-token"),
  "legacy Kong cookie key is explicitly cleared",
);

const files = [
  "lib/supabase/client.ts",
  "lib/supabase/server.ts",
  "lib/supabase/middleware.ts",
  "lib/supabase/route-handler.ts",
];
for (const f of files) {
  const src = read(f);
  assert(src.includes("authCookieOptions"), `${f} sets authCookieOptions`);
  assert(src.includes("cookieOptions"), `${f} passes cookieOptions to create*Client`);
}

const url = read("lib/supabase/url.ts");
assert(url.includes("getMiddlewareSupabaseUrl"), "middleware has loopback-preferring URL helper");
assert(
  url.includes("getAuthSupabaseUrl"),
  "getAuthSupabaseUrl still exists for browser/public gateway",
);

const login = read("app/api/auth/login/route.ts");
assert(
  !login.includes("failClosed: true"),
  "student login does not fail-closed on rate-limit store outages",
);

const bridge = read("lib/supabase/fetch-bridge.ts");
assert(
  bridge.includes("Never use NEXT_PUBLIC") ||
    !/new URL\(\s*env\.NEXT_PUBLIC_SUPABASE_URL/.test(bridge),
  "DNS bridge must not remap www from NEXT_PUBLIC_SUPABASE_URL",
);
assert(bridge.includes("SUPABASE_URL"), "DNS bridge keys off SUPABASE_URL/Kong host");

const mw = read("lib/supabase/middleware.ts");
assert(mw.includes("softOpenStudentPath"), "middleware soft-opens cookied student paths");
assert(mw.includes("getMiddlewareSupabaseUrl"), "middleware uses loopback-capable URL");

if (process.exitCode) {
  console.error("\nAuth cookie alignment regressions found.");
  process.exit(1);
}
console.log("\nPASS — auth cookie alignment guards OK");
