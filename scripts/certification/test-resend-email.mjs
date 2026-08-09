#!/usr/bin/env node
/**
 * Offline Resend-only email provider regression — no live API calls, no secrets printed.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let passed = 0;
function ok(label) {
  passed += 1;
  console.log(`PASS: ${label}`);
}

{
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.ok(pkg.dependencies?.resend, "resend dependency missing");
  ok("official resend package present");
}

{
  const index = readFileSync(join(root, "lib/email/index.ts"), "utf8");
  assert.match(index, /sendViaResend/);
  assert.ok(!/nodemailer/.test(index));
  assert.ok(!/sendViaZeptoMail|resolveSmtpConfig|createTransport/.test(index));
  ok("sendEmail is Resend-only (no Nodemailer/ZeptoMail path)");
}

{
  const provider = readFileSync(join(root, "lib/email/provider.ts"), "utf8");
  assert.match(provider, /EmailProviderId = "resend"/);
  assert.match(provider, /RESEND_API_KEY/);
  assert.match(provider, /courses@digitalskillx\.com/);
  assert.match(provider, /DigitalSkillX/);
  assert.ok(!/"zeptomail"/.test(provider));
  ok("provider module is Resend-only with courses@ defaults");
}

{
  const resend = readFileSync(join(root, "lib/email/providers/resend.ts"), "utf8");
  assert.match(resend, /from ['"]resend['"]/);
  assert.match(resend, /new Resend/);
  assert.match(resend, /resend\.emails\.send/);
  assert.ok(!/from ['"]nodemailer['"]/.test(resend));
  assert.ok(!/createTransport/.test(resend));
  assert.ok(!/NEXT_PUBLIC_RESEND/.test(resend));
  assert.match(resend, /server-only/);
  ok("Resend provider uses API SDK only (no SMTP, no NEXT_PUBLIC)");
}

{
  const envEmail = readFileSync(join(root, "lib/env-email.ts"), "utf8");
  assert.match(envEmail, /emailDeliveryConfigured/);
  assert.match(envEmail, /resolveResendApiKey/);
  assert.ok(!/smtp\.zeptomail|resolveSmtpConfig/.test(envEmail));
  ok("env-email checks Resend configuration only");
}

{
  const start = readFileSync(join(root, "scripts/start.mjs"), "utf8");
  assert.match(start, /RESEND_API_KEY/);
  assert.match(start, /EMAIL_PROVIDER/);
  assert.match(start, /RESEND_FROM_EMAIL/);
  ok("Coolify start wrapper carries Resend env keys");
}

{
  const src = [
    readFileSync(join(root, "lib/email/index.ts"), "utf8"),
    readFileSync(join(root, "lib/email/provider.ts"), "utf8"),
    readFileSync(join(root, "lib/email/providers/resend.ts"), "utf8"),
  ].join("\n");
  assert.ok(!/re_[A-Za-z0-9]{32,}/.test(src), "hardcoded Resend API key detected");
  assert.ok(!/NEXT_PUBLIC_RESEND_API_KEY\s*=/.test(src));
  ok("no hardcoded live API keys in email provider sources");
}

{
  // Outbox still funnels through sendEmail
  const outbox = readFileSync(join(root, "lib/bulk-import-email-outbox.ts"), "utf8");
  assert.match(outbox, /sendStudentWelcomeEmail|sendSystemEmail|drainBulkImportEmailOutbox/);
  assert.ok(existsSync(join(root, "app/api/cron/email-outbox/route.ts")));
  ok("bulk import outbox + email-outbox cron still present");
}

console.log(`\nResend-only email provider offline: ${passed}/8 passed`);
if (passed !== 8) process.exit(1);
