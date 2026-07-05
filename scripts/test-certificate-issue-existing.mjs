#!/usr/bin/env node
/** Test certificate issue API on production for an existing student. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.argv[2] ?? "https://www.digitalskillx.com").replace(/\/$/, "");
const studentEmail = process.argv[3] ?? "bam2online01@gmail.com";

function loadEnvFile(name) {
  const path = join(root, name);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env.test");

const adminEmail = process.env.TEST_ADMIN_EMAIL ?? "admin@digitalskillx.com";
const adminPassword = process.env.TEST_ADMIN_PASSWORD;
if (!adminPassword) {
  console.error("Set TEST_ADMIN_PASSWORD in .env.test");
  process.exit(1);
}

function curl(args) {
  return execFileSync("curl", ["-sL", ...args], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
}

console.log("Testing certificate issue API on", base, "for", studentEmail);

const adminJar = join(mkdtempSync(join(tmpdir(), "cert-api-")), "admin.txt");
curl([
  "-c", adminJar, "-b", adminJar,
  "-X", "POST", `${base}/api/auth/admin-login`,
  "-d", new URLSearchParams({ email: adminEmail, password: adminPassword }).toString(),
  "-o", "/dev/null",
]);

const studentsPage = curl(["-b", adminJar, `${base}/admin/students`]);
const studentMatch = studentsPage.match(
  new RegExp(`/admin/students/([0-9a-f-]{36})[\\s\\S]{0,400}?${studentEmail.replace(/[+]/g, "\\+")}`, "i")
);
const studentId = studentMatch?.[1];
if (!studentId) {
  console.error("FAIL: could not find student", studentEmail);
  process.exit(1);
}
console.log("Found student:", studentId);

const detailPage = curl(["-b", adminJar, `${base}/admin/students/${studentId}`]);
const courseOptions = [
  ...detailPage.matchAll(/<option value="([0-9a-f-]{36})">([^<]+)<\/option>/gi),
].filter((m) => !/Select|Issue|Grant/i.test(m[2]));

const facebookCourse = courseOptions.find((m) => /facebook/i.test(m[2]));
const courseId = facebookCourse?.[1] ?? courseOptions[0]?.[1];
if (!courseId) {
  console.error("FAIL: no courses available for certificate");
  process.exit(1);
}
console.log("Using course:", facebookCourse?.[2] ?? courseOptions[0]?.[2], courseId);

const issueRes = curl([
  "-b", adminJar,
  "-X", "POST", `${base}/api/admin/certificates`,
  "-H", "Content-Type: application/json",
  "-d", JSON.stringify({
    action: "issue",
    studentId,
    courseId,
    recipientName: "Bamidele Matthew",
  }),
]);

let issueJson;
try {
  issueJson = JSON.parse(issueRes);
} catch {
  console.error("FAIL: API did not return JSON:", issueRes.slice(0, 800));
  process.exit(1);
}

if (issueJson.error?.includes("Helvetica.afm") || issueJson.error?.includes("ENOENT")) {
  console.error("FAIL: PDF font error still present:", issueJson.error);
  process.exit(1);
}

if (!issueJson.ok) {
  // Already issued is OK for verifying PDF path on reissue
  if (/already|duplicate|exists/i.test(issueJson.error ?? "")) {
    const certIdMatch = detailPage.match(/certificates\/([0-9a-f-]{36})/i);
    const existingCert = detailPage.match(/PDG-[A-Z0-9]+/i)?.[0];
    if (existingCert) {
      console.log("Certificate already exists:", existingCert, "- trying reissue to test PDF...");
      const certRowMatch = detailPage.match(
        /data-certificate-id="([0-9a-f-]{36})"/i
      );
      const certificateId = certRowMatch?.[1];
      if (certificateId) {
        const reissueRes = curl([
          "-b", adminJar,
          "-X", "POST", `${base}/api/admin/certificates`,
          "-H", "Content-Type: application/json",
          "-d", JSON.stringify({
            action: "reissue",
            certificateId,
            recipientName: "Bamidele Matthew",
          }),
        ]);
        const reissueJson = JSON.parse(reissueRes);
        if (reissueJson.ok) {
          console.log("PASS: reissue succeeded (PDF generated + emailed)", reissueJson.certificateNumber ?? existingCert);
          process.exit(0);
        }
        console.error("FAIL: reissue failed", reissueRes.slice(0, 800));
        process.exit(1);
      }
    }
  }
  console.error("FAIL: certificate issue failed:", issueRes.slice(0, 800));
  process.exit(1);
}

console.log("PASS: certificate issued successfully");
console.log("  ID:", issueJson.certificateId);
console.log("  Number:", issueJson.certificateNumber);
console.log("  Name:", issueJson.recipientName);
console.log("=== ALL PASSED ===");
