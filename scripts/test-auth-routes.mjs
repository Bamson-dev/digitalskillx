#!/usr/bin/env node
/**
 * Smoke-test auth route handlers (run while dev server is up).
 * Usage: node scripts/test-auth-routes.mjs [baseUrl]
 */
const base = process.argv[2] ?? "http://localhost:3000";

async function postLogin(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
    redirect: "manual",
  });
  const cookies = res.headers.getSetCookie?.() ?? [];
  return {
    status: res.status,
    location: res.headers.get("location"),
    cookieCount: cookies.length,
    cookies: cookies.map((c) => c.split(";")[0]),
  };
}

async function main() {
  console.log(`Testing auth routes at ${base}\n`);

  const studentBad = await postLogin("/api/auth/login", {
    email: "invalid@example.com",
    password: "wrong",
    next: "/dashboard",
  });
  console.log("Student bad password:", studentBad);
  const studentBadOk =
    studentBad.status === 303 &&
    studentBad.location?.includes("/login") &&
    studentBad.location?.includes("auth_error");
  console.log(studentBadOk ? "  PASS" : "  FAIL");

  const adminBad = await postLogin("/api/auth/admin-login", {
    email: "invalid@example.com",
    password: "wrong",
  });
  console.log("\nAdmin bad password:", adminBad);
  const adminBadOk =
    adminBad.status === 303 &&
    adminBad.location?.includes("/admin/login") &&
    adminBad.location?.includes("auth_error");
  console.log(adminBadOk ? "  PASS" : "  FAIL");

  const loginHtml = await fetch(`${base}/login`).then((r) => r.text());
  const studentFormOk =
    loginHtml.includes('action="/api/auth/login"') &&
    loginHtml.includes('method="POST"');
  console.log("\nStudent login form:", studentFormOk ? "  PASS (POST /api/auth/login)" : "  FAIL");

  const adminHtml = await fetch(`${base}/admin/login`).then((r) => r.text());
  const adminFormOk =
    adminHtml.includes('action="/api/auth/admin-login"') &&
    adminHtml.includes('method="POST"');
  console.log("Admin login form:", adminFormOk ? "  PASS (POST /api/auth/admin-login)" : "  FAIL");

  const allOk = studentBadOk && adminBadOk && studentFormOk && adminFormOk;
  console.log(allOk ? "\nAll smoke tests passed." : "\nSome tests FAILED.");
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
