import { test, expect } from "@playwright/test";

test.describe("Phase 7 product experience smoke", () => {
  test("login shows registered success banner", async ({ page }) => {
    await page.goto("/login?registered=1");
    await expect(page.getByText(/Account created/i)).toBeVisible();
  });

  test("browse page loads without horizontal overflow at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/browse");
    await expect(page.locator("body")).toBeVisible();
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 2;
    });
    expect(overflow).toBe(false);
  });

  test("admin customers route still gated", async ({ page }) => {
    await page.goto("/admin/students");
    await expect(page).toHaveURL(/admin\/login/);
  });
});
