#!/usr/bin/env node
/**
 * Deploy committed code only to Vercel production.
 * Avoids uploading local WIP files that can break `next build`.
 *
 * Usage: npm run deploy:prod
 */
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = mkdtempSync(join(tmpdir(), "digitalskillx-deploy-"));

console.log(`\nDigitalSkillX — production deploy from git HEAD\n`);
console.log(`Temp dir: ${tmp}\n`);

execSync(`git archive HEAD | tar -x -C "${tmp}"`, { cwd: root, stdio: "inherit", shell: true });

const vercelDir = join(root, ".vercel");
if (existsSync(vercelDir)) {
  cpSync(vercelDir, join(tmp, ".vercel"), { recursive: true });
} else {
  console.error("Missing .vercel/project.json — run `npx vercel link` once from the repo root.");
  process.exit(1);
}

execSync("npx vercel deploy --prod --yes", { cwd: tmp, stdio: "inherit" });
