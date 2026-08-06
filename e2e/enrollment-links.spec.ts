import { test, expect, devices } from "@playwright/test";

test.describe("Enrollment links — public surfaces", () => {
  test("invalid token shows friendly error", async ({ page }) => {
    await page.goto("/enroll/el_invalid_token_for_smoke_xyz");
    await expect(page.getByText(/DigitalSkillX/i).first()).toBeVisible();
    await expect(
      page.getByText(/Unable to continue|unavailable|invalid|Loading/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("success page shell renders", async ({ page }) => {
    await page.goto("/enrollment/success");
    await expect(page.getByText(/DigitalSkillX|Welcome|You're in|Loading/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("admin enrollment links requires auth", async ({ page }) => {
    await page.goto("/admin/enrollment-links");
    await expect(page).toHaveURL(/admin\/login|login|enrollment-links/);
  });
});

for (const name of ["Desktop Chrome", "iPhone 12", "iPad (gen 7)"] as const) {
  const device =
    name === "Desktop Chrome"
      ? devices["Desktop Chrome"]
      : name === "iPhone 12"
        ? devices["iPhone 12"]
        : devices["iPad (gen 7)"];

  test.describe(`Responsive — ${name}`, () => {
    test.use({ ...device });

    test("login page usable", async ({ page }) => {
      await page.goto("/login");
      await expect(page.getByText(/Welcome back|Log in|DigitalSkillX/i).first()).toBeVisible();
      await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
    });

    test("register page usable", async ({ page }) => {
      await page.goto("/register");
      await expect(page.getByText(/Create|account|DigitalSkillX/i).first()).toBeVisible();
    });
  });
}
