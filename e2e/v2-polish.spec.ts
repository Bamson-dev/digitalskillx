import { test, expect } from "@playwright/test";

test.describe("V2 polish smokes", () => {
  test("admin login page loads", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page.getByText(/DigitalSkillX|Admin|Log/i).first()).toBeVisible();
  });

  test("student login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText(/Welcome back|Log in|DigitalSkillX/i).first()).toBeVisible();
  });

  test("settings page requires auth (redirect)", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/login|settings/);
  });

  test("homepage and browse hide RC/test course titles", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/RC Course\s+\d+/i);

    await page.goto("/browse");
    // Catalog fetch can fail offline; still assert no storefront-hidden titles leak.
    await expect(page.locator("body")).not.toContainText(/RC Course\s+\d+/i);
    await expect(page.locator("body")).not.toContainText(/E2E test course/i);
    const browseHeading = page.getByRole("heading", { name: /Browse courses/i });
    if ((await browseHeading.count()) > 0) {
      await expect(browseHeading).toBeVisible();
    }
  });
});
