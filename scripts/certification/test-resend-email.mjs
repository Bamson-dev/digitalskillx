#!/usr/bin/env node
/**
 * Offline Zoho ZeptoMail provider regression.
 * No live SMTP connections or secrets are used.
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
  const index = readFileSync(join(root, "lib/email/index.ts"), "utf8");
  assert.match(index, /sendViaZeptoMail/);
  assert.doesNotMatch(index, /sendViaResend/);
  assert.match(index, /sendMarketingEmail/);
  assert.match(index, /Marketing email is not enabled/);
  ok("transactional sender routes through Zoho; marketing mail is isolated");
}

{
  const provider = readFileSync(join(root, "lib/email/provider.ts"), "utf8");
  assert.match(provider, /EmailProviderId = "zeptomail"/);
  assert.match(provider, /resolveZeptoMailSmtpPassword/);
  assert.match(provider, /marketingEmailConfigured/);
  assert.match(provider, /return false/);
  ok("provider selection and marketing guard use ZeptoMail");
}

{
  const smtp = readFileSync(join(root, "lib/email/providers/zeptomail.ts"), "utf8");
  assert.match(smtp, /smtp\.zeptomail\.com/);
  assert.match(smtp, /ZEPTOMAIL_SMTP_HOST/);
  assert.match(smtp, /ZEPTOMAIL_SMTP_PORT/);
  assert.match(smtp, /ZEPTOMAIL_SMTP_USER/);
  assert.match(smtp, /ZEPTOMAIL_SMTP_PASSWORD/);
  assert.match(smtp, /AUTH LOGIN/);
  assert.match(smtp, /STARTTLS/);
  assert.match(smtp, /rejectUnauthorized: true/);
  assert.match(smtp, /Content-Type: /);
  assert.match(smtp, /Content-Disposition: attachment/);
  ok("SMTP transport uses authenticated TLS and MIME attachments");
}

{
  const email = readFileSync(join(root, "lib/env-email.ts"), "utf8");
  assert.match(email, /resolveZeptoMailSmtpPassword/);
  assert.doesNotMatch(email, /resolveResendApiKey/);
  ok("email readiness checks the Zoho SMTP secret");
}

{
  const start = readFileSync(join(root, "scripts/start.mjs"), "utf8");
  for (const key of [
    "ZEPTOMAIL_SMTP_HOST",
    "ZEPTOMAIL_SMTP_PORT",
    "ZEPTOMAIL_SMTP_USER",
    "ZEPTOMAIL_SMTP_PASSWORD",
    "ZEPTOMAIL_FROM_EMAIL",
    "ZEPTOMAIL_FROM_NAME",
  ]) {
    assert.match(start, new RegExp(key));
  }
  assert.match(start, /EMAIL_PROVIDER/);
  assert.match(start, /ZEPTOMAIL_SMTP_PASSWORD=\$\{secretStatus/);
  ok("Coolify start wrapper carries Zoho runtime settings without printing secrets");
}

{
  const outbox = readFileSync(join(root, "lib/bulk-import-email-outbox.ts"), "utf8");
  assert.match(outbox, /zeptoConfigured/);
  assert.doesNotMatch(outbox, /resendConfigured/);
  assert.ok(existsSync(join(root, "app/api/cron/email-outbox/route.ts")));
  ok("bulk import transactional outbox uses Zoho readiness and retains its cron route");
}

{
  const marketing = [
    readFileSync(join(root, "lib/email-campaigns/live-drain.ts"), "utf8"),
    readFileSync(join(root, "lib/webinar-followup/live-drain.ts"), "utf8"),
  ].join("\n");
  assert.doesNotMatch(marketing, /sendEmail\(/);
  assert.match(marketing, /sendMarketingEmail/);
  ok("marketing campaign workers do not send through transactional SMTP");
}

console.log(`\nZoho ZeptoMail provider regression: ${passed}/7 passed`);
if (passed !== 7) process.exit(1);
