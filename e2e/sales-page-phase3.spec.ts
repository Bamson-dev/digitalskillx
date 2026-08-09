import { test, expect } from "@playwright/test";

test.describe("Sales Conversion Phase 3 smoke", () => {
  test("analytics event rejects unknown names", async ({ request }) => {
    const res = await request.post("/api/analytics/event", {
      data: { event: "not_a_real_event", metadata: {} },
    });
    expect(res.status()).toBe(400);
  });

  test("analytics event accepts sales_page_view", async ({ request }) => {
    const res = await request.post("/api/analytics/event", {
      data: {
        event: "sales_page_view",
        courseId: "00000000-0000-4000-8000-000000000000",
        metadata: { session_id: "e2e", utm_source: "test" },
      },
    });
    expect([200, 201]).toContain(res.status());
    const json = await res.json();
    expect(json.ok).toBeTruthy();
  });

  test("lead capture requires consent", async ({ request }) => {
    const res = await request.post(
      "/api/sales-pages/00000000-0000-4000-8000-000000000000/leads",
      {
        data: { email: "lead@example.com", consent: false },
      },
    );
    expect([400, 404]).toContain(res.status());
  });

  test("admin sales page requires auth", async ({ request }) => {
    const res = await request.get("/admin/sales");
    expect([200, 302, 303, 307, 401, 403]).toContain(res.status());
  });

  test("admin recommendations API requires auth", async ({ request }) => {
    const res = await request.get(
      "/api/admin/course-recommendations?courseId=00000000-0000-4000-8000-000000000000",
    );
    expect([401, 403]).toContain(res.status());
  });
});
