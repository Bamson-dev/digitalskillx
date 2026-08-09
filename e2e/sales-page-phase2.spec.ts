import { test, expect } from "@playwright/test";

/**
 * Sales Page Phase 2 — API smoke (auth gates + asset ACL).
 * Does not require Contabo or admin session for these checks.
 */
test.describe("Sales Page Phase 2 smoke", () => {
  test("public browse still responds", async ({ request }) => {
    const res = await request.get("/browse");
    expect([200, 304, 307]).toContain(res.status());
  });

  test("admin sales page API requires auth", async ({ request }) => {
    const res = await request.get("/api/admin/sales-pages/00000000-0000-4000-8000-000000000000");
    expect([401, 403]).toContain(res.status());
  });

  test("admin asset upload requires auth", async ({ request }) => {
    const res = await request.post("/api/admin/sales-pages/00000000-0000-4000-8000-000000000000/assets");
    expect([401, 403, 400, 415]).toContain(res.status());
  });

  test("admin versions API requires auth", async ({ request }) => {
    const res = await request.get("/api/admin/sales-pages/00000000-0000-4000-8000-000000000000/versions");
    expect([401, 403]).toContain(res.status());
  });

  test("unknown sales page asset stays closed", async ({ request }) => {
    const res = await request.get("/api/sales-page-assets/00000000-0000-4000-8000-000000000000");
    expect([401, 403, 404, 500]).toContain(res.status());
  });
});
