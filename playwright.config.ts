import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Prefer an explicit PLAYWRIGHT_BASE_URL (CI / intentional remote).
 * Otherwise always boot a fresh production server on a dedicated port.
 * Do NOT default-reuse :3000 — that caused stale-server false failures.
 */
const explicitBase = (process.env.PLAYWRIGHT_BASE_URL ?? "").trim();
const e2ePort = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const localBase = `http://127.0.0.1:${e2ePort}`;
const baseURL = explicitBase || localBase;
const manageWebServer = !explicitBase;

/** Load .env.local into the Playwright-managed webServer (next start alone may miss keys). */
function loadEnvLocal(): Record<string, string> {
  const file = resolve(process.cwd(), ".env.local");
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) out[key] = value;
  }
  return out;
}

const envLocal = manageWebServer ? loadEnvLocal() : {};

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  ...(manageWebServer
    ? {
        webServer: {
          // Skip rebuild when .next exists (or PLAYWRIGHT_SKIP_BUILD=1) so e2e
          // does not burn the full webServer timeout on a cold/contended build.
          command:
            process.env.PLAYWRIGHT_SKIP_BUILD === "1"
              ? `PORT=${e2ePort} npm run start`
              : `npm run build && PORT=${e2ePort} npm run start`,
          url: `${localBase}/api/health`,
          // Only reuse when explicitly requested — prevents stale :3000 ghosts.
          reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
          timeout: 180_000,
          stdout: "pipe",
          stderr: "pipe",
          env: {
            ...process.env,
            ...envLocal,
            PORT: String(e2ePort),
            NODE_ENV: "production",
          },
        },
      }
    : {}),
});
