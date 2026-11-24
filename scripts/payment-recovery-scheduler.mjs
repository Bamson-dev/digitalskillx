#!/usr/bin/env node
/**
 * In-container scheduler for payment recovery.
 * A PostgreSQL session advisory lock elects one active runner across replicas.
 */

import pg from "pg";

const INTERVAL_MS = 5 * 60 * 1000;
const LOCK_CLASS = 7_265_002;
const LOCK_ID = 1;
const PORT = Number(process.env.PORT || 3000);
const CRON_SECRET = process.env.CRON_SECRET?.trim();
const DATABASE_URL = process.env.DATABASE_URL?.trim();
const stop = { requested: false };
let activeController;

function log(message) {
  console.log(\`[digitalskillx] payment-recovery scheduler: \${message}\`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

async function waitForLocalApp() {
  const url = \`http://127.0.0.1:\${PORT}/api/health\`;
  const deadline = Date.now() + 180_000;
  while (!stop.requested && Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000), cache: "no-store" });
      if (response.ok) return true;
    } catch {
      // The Next.js process may still be starting.
    }
    await sleep(2_000);
  }
  return false;
}

async function runOnce() {
  const client = new pg.Client({
    connectionString: DATABASE_URL,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
  });
  let locked = false;
  try {
    await client.connect();
    const result = await client.query(
      "select pg_try_advisory_lock($1::integer, $2::integer) as locked",
      [LOCK_CLASS, LOCK_ID],
    );
    locked = result.rows[0]?.locked === true;
    if (!locked) {
      log("another application replica owns the scheduler lock; this run was skipped");
      return;
    }

    activeController = new AbortController();
    const timeout = setTimeout(() => activeController?.abort(), 290_000);
    try {
      const response = await fetch(\`http://127.0.0.1:\${PORT}/api/cron/payment-recovery\`, {
        method: "GET",
        headers: { Authorization: \`Bearer \${CRON_SECRET}\` },
        cache: "no-store",
        signal: activeController.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.enabled !== true) {
        const status = response.status;
        throw new Error(\`recovery endpoint did not complete successfully (HTTP \${status})\`);
      }
      const registered = Number(payload.pagePull?.registered ?? 0);
      const skipped = Number(payload.pagePull?.skipped ?? 0);
      const verified = Number(payload.reconcile?.verified ?? 0);
      const sent = Number(payload.messages?.sent ?? 0);
      log(\`cycle completed; imported=\${registered}, skipped=\${skipped}, verified=\${verified}, emails_sent=\${sent}\`);
    } finally {
      clearTimeout(timeout);
      activeController = undefined;
    }
  } catch (error) {
    log(\`cycle failed: \${error instanceof Error ? error.message : "unknown error"}\`);
  } finally {
    if (locked) {
      await client.query(
        "select pg_advisory_unlock($1::integer, $2::integer)",
        [LOCK_CLASS, LOCK_ID],
      ).catch(() => undefined);
    }
    await client.end().catch(() => undefined);
  }
}

async function main() {
  if (!DATABASE_URL || !CRON_SECRET || process.env.PAYMENT_RECOVERY_ENABLED !== "true") {
    log("not started because required runtime configuration is missing");
    return;
  }

  if (!(await waitForLocalApp())) {
    log("local application health check did not pass; scheduler is stopping");
    return;
  }

  log("active; running every five minutes");
  while (!stop.requested) {
    await runOnce();
    const nextSlot = (Math.floor(Date.now() / INTERVAL_MS) + 1) * INTERVAL_MS;
    while (!stop.requested && Date.now() < nextSlot) await sleep(1_000);
  }
}

for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
  process.once(signal, () => {
    stop.requested = true;
    activeController?.abort();
  });
}

main().catch((error) => {
  log(\`stopped after an unexpected error: \${error instanceof Error ? error.message : "unknown error"}\`);
  process.exitCode = 1;
});
