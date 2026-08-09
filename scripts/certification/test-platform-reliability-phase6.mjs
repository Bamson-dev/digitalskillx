#!/usr/bin/env node
/**
 * Phase 6 offline checks — reliability helpers, error codes, health taxonomy.
 */
import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { readFileSync, existsSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let passed = 0;

function ok(label) {
  passed += 1;
  console.log(`PASS: ${label}`);
}

{
  const { ErrorCode, userFacingError } = await import(
    pathToFileURL(join(root, "lib/error-codes.ts")).href
  );
  assert.equal(ErrorCode.PAYMENT_VERIFICATION_FAILED, "PAYMENT_VERIFICATION_FAILED");
  assert.equal(ErrorCode.ENROLLMENT_FAILED, "ENROLLMENT_FAILED");
  assert.equal(ErrorCode.STORAGE_UPLOAD_FAILED, "STORAGE_UPLOAD_FAILED");
  assert.equal(ErrorCode.EMAIL_DELIVERY_FAILED, "EMAIL_DELIVERY_FAILED");
  assert.equal(ErrorCode.SALES_PAGE_IMPORT_FAILED, "SALES_PAGE_IMPORT_FAILED");
  assert.equal(ErrorCode.DATABASE_QUERY_FAILED, "DATABASE_QUERY_FAILED");
  const msg = userFacingError(ErrorCode.PAYMENT_VERIFICATION_FAILED);
  assert.ok(!/secret|token|key|password/i.test(msg));
  assert.ok(msg.length > 10);
  ok("error codes + safe user-facing messages");
}

{
  const src = readFileSync(join(root, "lib/secure-log.ts"), "utf8");
  assert.match(src, /function redactObject/);
  assert.match(src, /secureLogError/);
  assert.match(src, /\[redacted\]/);
  assert.match(src, /password\|passwd\|secret\|token/i);
  ok("secure-log redaction helpers present");
}

{
  const mig = join(root, "supabase/migrations/0040_platform_reliability.sql");
  assert.ok(existsSync(mig), "0040 migration missing");
  const sql = readFileSync(mig, "utf8");
  assert.match(sql, /product_events_student_created_idx/);
  assert.match(sql, /enrollments_idle_reminder_pending_idx/);
  assert.match(sql, /reclaim_stale_bulk_import_email_outbox/);
  assert.ok(!/drop table/i.test(sql));
  ok("0040 migration additive indexes + reclaim");
}

{
  const healthPage = join(root, "app/(admin)/admin/(panel)/system-health/page.tsx");
  assert.ok(existsSync(healthPage));
  const src = readFileSync(healthPage, "utf8");
  assert.match(src, /getSystemHealthSnapshot/);
  assert.match(src, /requireAdmin/);
  assert.ok(!/SERVICE_ROLE|CONTABO_S3_SECRET|password/i.test(src));
  ok("admin system health page exists and avoids secrets");
}

{
  const dr = readFileSync(join(root, "docs/DISASTER_RECOVERY.md"), "utf8");
  assert.match(dr, /Database failure/);
  assert.match(dr, /Contabo failure/);
  assert.match(dr, /Paystack/);
  assert.match(dr, /Broken migration/);
  ok("disaster recovery documentation present");
}

{
  const idle = readFileSync(join(root, "lib/system-email-triggers.ts"), "utf8");
  assert.match(idle, /IDLE_REMINDER_BATCH/);
  assert.match(idle, /\.limit\(IDLE_REMINDER_BATCH\)/);
  const integrity = readFileSync(join(root, "app/api/cron/integrity/route.ts"), "utf8");
  assert.match(integrity, /ENROLLMENT_SCAN_LIMIT/);
  assert.match(integrity, /SUCCESS_TX_SCAN_LIMIT/);
  const analytics = readFileSync(join(root, "app/api/analytics/event/route.ts"), "utf8");
  assert.match(analytics, /rateLimitedResponse/);
  const login = readFileSync(join(root, "app/api/auth/login/route.ts"), "utf8");
  assert.match(login, /enforceRateLimit/);
  const adminApi = readFileSync(join(root, "lib/admin-api-auth.ts"), "utf8");
  assert.match(adminApi, /isAdminMfaRequired/);
  const certs = readFileSync(join(root, "lib/certificates.ts"), "utf8");
  assert.match(certs, /resendEmail/);
  ok("idle/integrity bounds + rate limits + MFA API + cert idempotency");
}

console.log(`\nPhase 6 offline: ${passed}/6 passed`);
if (passed !== 6) process.exit(1);
