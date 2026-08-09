import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadTestEnv() {
  const path = resolve(process.cwd(), ".env.test");
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

const env = loadTestEnv();
const adminEmail = env.TEST_ADMIN_EMAIL ?? process.env.TEST_ADMIN_EMAIL ?? "admin@digitalskillx.com";
const adminPassword = env.TEST_ADMIN_PASSWORD ?? process.env.TEST_ADMIN_PASSWORD ?? "";
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  env.NEXT_PUBLIC_SUPABASE_URL ??
  "";
const supabaseLooksLive =
  Boolean(supabaseUrl) &&
  !/your-project|example\.supabase|localhost|127\.0\.0\.1/i.test(supabaseUrl);

test.describe("RC — admin course lifecycle", () => {
  test.skip(!adminPassword, "TEST_ADMIN_PASSWORD required");
  test.skip(
    !supabaseLooksLive,
    "NEXT_PUBLIC_SUPABASE_URL must point at a real project (not a placeholder)",
  );

  test("create course → publish visibility → delete course", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));

    await page.goto("/admin/login");
    await page.locator('input[name="email"], input[type="email"]').first().fill(adminEmail);
    await page.locator('input[name="password"], input[type="password"]').first().fill(adminPassword);
    await page.locator('button[type="submit"]').first().click();
    await expect(page).toHaveURL(/\/admin/, { timeout: 30_000 });

    await page.goto("/admin/courses");
    const title = `RC Course ${Date.now()}`;
    await page.locator('input[name="title"]').first().fill(title);
    await page.getByRole("button", { name: /Create|Add course/i }).first().click();
    await expect(page).toHaveURL(/\/admin\/courses\/[0-9a-f-]{36}/, { timeout: 45_000 });

    const courseUrl = page.url();
    await expect(page.getByText(/Curriculum|Course settings|Save/i).first()).toBeVisible({
      timeout: 20_000,
    });

    const visibility = page.locator('select[name="visibility"]');
    if (await visibility.count()) {
      await visibility.selectOption("published");
      await page.getByRole("button", { name: /Save Changes|Saved|Saving/i }).first().click();
      await expect(page.getByText(/Saved|saved successfully/i).first()).toBeVisible({
        timeout: 20_000,
      });
    }

    // Delete via danger zone
    const danger = page.getByText(/Danger zone/i).first();
    if (await danger.count()) {
      await danger.click();
    }
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /Delete course/i }).click();
    await expect(page).toHaveURL(/\/admin\/courses/, { timeout: 45_000 });
    await page.reload();
    await expect(page.getByText(title)).toHaveCount(0, { timeout: 20_000 });

    const critical = consoleErrors.filter(
      (e) =>
        !/favicon|hydration|Download the React DevTools|Failed to fetch RSC payload|Falling back to browser navigation/i.test(
          e,
        ),
    );
    expect(critical, critical.join("\n")).toHaveLength(0);
  });
});

test.describe("RC — student forgot password + a11y smoke", () => {
  test("forgot password form submits without page crash", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/forgot-password");
    await expect(page.getByText(/Forgot your password/i)).toBeVisible();
    await page.locator('input[name="email"], input[type="email"]').fill(`rc-reset+${Date.now()}@digitalskillx.com`);
    await page.getByRole("button", { name: /Send reset link/i }).click();
    await expect(
      page.getByText(/reset link|on its way|Could not|service role|email/i).first(),
    ).toBeVisible({ timeout: 30_000 });

    // Basic a11y: form labels / button name
    await page.goto("/login");
    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Log in|Sign in/i }).first()).toBeVisible();

    const critical = consoleErrors.filter(
      (e) =>
        !/favicon|hydration|Download the React DevTools|Failed to fetch RSC payload|Falling back to browser navigation/i.test(
          e,
        ),
    );
    expect(critical, critical.join("\n")).toHaveLength(0);
  });
});
