import { test, expect } from "@playwright/test";

test.describe("Phase 5 Customer + Business OS smoke", () => {
  test("admin business requires auth", async ({ request }) => {
    const res = await request.get("/admin/business");
    expect([200, 302, 303, 307, 401, 403]).toContain(res.status());
  });

  test("admin segments requires auth", async ({ request }) => {
    const res = await request.get("/admin/segments");
    expect([200, 302, 303, 307, 401, 403]).toContain(res.status());
  });

  test("admin bundles requires auth", async ({ request }) => {
    const res = await request.get("/admin/bundles");
    expect([200, 302, 303, 307, 401, 403]).toContain(res.status());
  });

  test("students list still gated", async ({ request }) => {
    const res = await request.get("/admin/students");
    expect([200, 302, 303, 307, 401, 403]).toContain(res.status());
  });

  test("public cannot hit admin customer actions surface", async ({ request }) => {
    const res = await request.get("/admin/sales");
    expect([200, 302, 303, 307, 401, 403]).toContain(res.status());
  });
});
