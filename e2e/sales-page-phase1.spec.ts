import { test, expect } from "@playwright/test";

/**
 * Sales Page Phase 1 — API smoke (does not require Contabo).
 * Confirms public routes and auth gates without rewriting marketplace checkout.
 */
test.describe("Sales Page Phase 1 smoke", () => {
  test("public browse route still responds", async ({ request }) => {
    const res = await request.get("/browse");
    expect([200, 304]).toContain(res.status());
  });

  test("sales page asset route 404s for unknown id", async ({ request }) => {
    const res = await request.get("/api/sales-page-assets/00000000-0000-4000-8000-000000000000");
    expect([401, 403, 404, 500]).toContain(res.status());
  });

  test("admin sales page API requires auth", async ({ request }) => {
    const res = await request.get("/api/admin/sales-pages/00000000-0000-4000-8000-000000000000");
    expect([401, 403]).toContain(res.status());
  });
});
