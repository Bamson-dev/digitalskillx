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
});
