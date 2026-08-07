/**
 * Automated accessibility audit against production critical pages.
 * Usage: PLAYWRIGHT_BASE_URL=https://www.digitalskillx.com npx playwright test e2e/a11y-audit.spec.ts
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const pages = [
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/browse",
  "/admin/login",
];

test.describe("Accessibility audit — critical public pages", () => {
  for (const path of pages) {
    test(`no serious/critical violations on ${path}`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const serious = results.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact ?? ""),
      );

      if (serious.length) {
        console.log(
          `\nA11Y FAIL ${path}:\n` +
            serious
              .map(
                (v) =>
                  `- [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)`,
              )
              .join("\n"),
        );
      }

      expect(
        serious,
        serious.map((v) => `${v.impact}:${v.id}`).join(", ") || "ok",
      ).toEqual([]);
    });
  }
});
