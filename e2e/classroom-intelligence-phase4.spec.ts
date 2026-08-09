import { test, expect } from "@playwright/test";

/**
 * Phase 4 classroom intelligence smoke — auth-gated surfaces + public mobile classroom shell.
 */
test.describe("Phase 4 classroom intelligence smoke", () => {
  test("student dashboard requires auth", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/login/);
  });

  test("admin analytics requires auth", async ({ page }) => {
    await page.goto("/admin/analytics");
    await expect(page).toHaveURL(/admin\/login/);
  });

  test("browse remains usable at 375px (classroom entry path)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/browse");
    await expect(page.locator("body")).toBeVisible();
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 2;
    });
    expect(overflow).toBe(false);
  });

  test("login usable at 390px (mobile classroom gate)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");
    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
  });
});
