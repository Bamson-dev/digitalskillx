#!/usr/bin/env node
/** Smoke test: generate certificate PDF buffer without external font files. */
import { writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

// Load compiled output after build, or use tsx - for simplicity use dynamic import via next's transpilation
// Run with: node --experimental-vm-modules after building, or use a minimal inline test

async function main() {
  const { generateCertificatePdfBuffer } = await import(
    join(root, "lib/certificate-pdf.ts").replace(/\\/g, "/")
  ).catch(async () => {
    // Fallback: register ts-node not available — use built artifact path
    throw new Error("Run via: npx tsx scripts/test-certificate-pdf.mjs");
  });

  const pdf = await generateCertificatePdfBuffer({
    recipientName: "Bamidele Matthew",
    courseTitle: "Facebook Ad Mastery For Affiliate Marketing",
    certificateNumber: "PDG-TEST-001",
    issuedAt: new Date().toISOString(),
    verifyUrl: "https://www.digitalskillx.com/verify/PDG-TEST-001",
  });

  if (!pdf || pdf.length < 1000) {
    console.error("FAIL: PDF buffer too small", pdf?.length);
    process.exit(1);
  }
  if (pdf.slice(0, 4).toString() !== "%PDF") {
    console.error("FAIL: invalid PDF header");
    process.exit(1);
  }

  const out = join(root, ".tmp-certificate-test.pdf");
  writeFileSync(out, pdf);
  console.log("PASS: generated PDF", pdf.length, "bytes ->", out);
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
