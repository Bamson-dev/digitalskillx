#!/usr/bin/env node
/**
 * End-to-end login success test (requires real credentials via env).
 * STUDENT: TEST_STUDENT_EMAIL, TEST_STUDENT_PASSWORD
 * ADMIN:   TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD
 */
const base = process.argv[2] ?? "https://www.digitalskillx.com";

async function loginFlow(label, path, body, expectPath) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
    redirect: "manual",
  });

  const cookies = res.headers.getSetCookie?.() ?? [];
  const location = res.headers.get("location") ?? "";

  console.log(`\n${label}`);
  console.log("  POST status:", res.status);
  console.log("  redirect:", location);
  console.log("  set-cookie count:", cookies.length);

  if (res.status !== 303) {
    console.log("  FAIL: expected 303 redirect");
    return false;
  }

  if (!location.includes(expectPath)) {
    console.log(`  FAIL: expected redirect to ${expectPath}, got ${location}`);
    return false;
  }

  if (cookies.length === 0) {
    console.log("  FAIL: no session cookies set");
    return false;
  }

  console.log("  cookie names:", cookies.map((c) => c.split("=")[0]).join(", "));

  const cookieHeader = cookies.map((c) => c.split(";")[0]).join("; ");
  const dash = await fetch(`${base}${expectPath}`, {
    headers: { Cookie: cookieHeader },
    redirect: "manual",
  });

  console.log("  dashboard status:", dash.status);
  console.log("  dashboard location:", dash.headers.get("location"));

  const ok = dash.status === 200 || (dash.status === 307 && !dash.headers.get("location")?.includes("/login"));
  console.log(ok ? "  PASS" : "  FAIL");
  return ok;
}

async function main() {
  console.log(`Success login test at ${base}`);
  let allOk = true;

  const studentEmail = process.env.TEST_STUDENT_EMAIL;
  const studentPassword = process.env.TEST_STUDENT_PASSWORD;
  if (studentEmail && studentPassword) {
    const ok = await loginFlow(
      "Student login",
      "/api/auth/login",
      { email: studentEmail, password: studentPassword, next: "/dashboard" },
      "/dashboard",
    );
    allOk = allOk && ok;
  } else {
    console.log("\nStudent login: SKIP (set TEST_STUDENT_EMAIL + TEST_STUDENT_PASSWORD)");
  }

  const adminEmail = process.env.TEST_ADMIN_EMAIL;
  const adminPassword = process.env.TEST_ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const ok = await loginFlow(
      "Admin login",
      "/api/auth/admin-login",
      { email: adminEmail, password: adminPassword },
      "/admin/dashboard",
    );
    allOk = allOk && ok;
  } else {
    console.log("\nAdmin login: SKIP (set TEST_ADMIN_EMAIL + TEST_ADMIN_PASSWORD)");
  }

  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
