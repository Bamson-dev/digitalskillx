/**
 * Experience 2.0 Phase J — responsive + classroom smoke (no auth required for public pages).
 */
import { test, expect } from "@playwright/test";

const viewports = [
  { name: "mobile", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 800 },
] as const;

test.describe("Experience 2.0 G–J responsive smoke", () => {
  for (const vp of viewports) {
    test(`homepage has no horizontal overflow @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });

      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth > doc.clientWidth + 1;
      });
      expect(overflow).toBe(false);
      await expect(page.locator("body")).not.toContainText(/RC Course\s+\d+/i);
    });
  }

  test("browse remains usable at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/browse", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).not.toContainText(/RC Course\s+\d+/i);
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 1;
    });
    expect(overflow).toBe(false);
  });

  test("login loads at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/login");
    await expect(page.getByText(/Welcome back|Log in|DigitalSkillX/i).first()).toBeVisible();
  });
});
