"use strict";

/**
 * Loaded with `node -r ./scripts/runtime-env-preload.cjs` before Next.js starts.
 * Injects Coolify runtime secrets into process.env before any app code runs.
 */
const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");

const candidatePaths = [
  process.env.DIGITALSKILLX_RUNTIME_ENV_FILE,
  "/tmp/digitalskillx-runtime-env.json",
  join(process.cwd(), "runtime-env.json"),
  join(process.cwd(), ".next", "runtime-env.json"),
  "/app/runtime-env.json",
  "/app/.next/runtime-env.json",
].filter(Boolean);

function loadRuntimeEnv() {
  for (const path of candidatePaths) {
    if (!existsSync(path)) continue;
    try {
      const data = JSON.parse(readFileSync(path, "utf8"));
      if (!data || typeof data !== "object") continue;

      let count = 0;
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === "string" && value.trim()) {
          process.env[key] = value.trim();
          count++;
        }
      }

      console.log(`[digitalskillx] Preload loaded ${count} runtime secret(s) from ${path}`);
      return path;
    } catch (err) {
      console.warn(
        `[digitalskillx] Preload could not read ${path}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  console.warn("[digitalskillx] Preload found no runtime-env.json file");
  return null;
}

loadRuntimeEnv();
