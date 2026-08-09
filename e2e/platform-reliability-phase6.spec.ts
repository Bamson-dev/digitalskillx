import { test, expect } from "@playwright/test";

/**
 * Phase 6 smoke: public health liveness + admin system health route shape.
 * Does not require Contabo / Paystack live credentials.
 */
test.describe("Phase 6 platform reliability", () => {
  test("public /api/health returns liveness without secrets", async ({ request }) => {
    const res = await request.get("/api/health");
    expect([200, 503]).toContain(res.status());
    const body = await res.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("database");
    expect(body).toHaveProperty("timestamp");
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/service_role|CONTABO_S3_SECRET|password\s*[:=]/i);
  });

  test("admin system-health redirects unauthenticated users", async ({ page }) => {
    await page.goto("/admin/system-health");
    await expect(page).toHaveURL(/admin\/login/);
  });
});
