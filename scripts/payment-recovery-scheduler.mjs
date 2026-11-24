#!/usr/bin/env node
/**
 * In-container scheduler for payment recovery.
 * PostgreSQL advisory locks prevent duplicate slot execution across replicas
 * and prevent overlapping cycles when a previous run is slow.
 */

import pg from "pg";

const INTERVAL_MS = 5 * 60 * 1000;
const SLOT_LOCK_CLASS = 7_265_002;
const RUN_LOCK_CLASS = 7_265_003;
const LOCK_ID = 1;
const PORT = Number(process.env.PORT || 3000);
const CRON_SECRET = process.env.CRON_SECRET?.trim();
const DATABASE_URL = process.env.DATABASE_URL?.trim();
const stop = { requested: false };
let activeController;

function log(message) {
  console.log("[digitalskillx] payment-recovery scheduler: " + message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

async function waitForLocalApp() {
  const url = "http://127.0.0.1:" + PORT + "/api/health";
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

async function waitUntilNextSlot() {
  const nextSlot = (Math.floor(Date.now() / INTERVAL_MS) + 1) * INTERVAL_MS;
  while (!stop.requested && Date.now() < nextSlot) await sleep(500);
}

async function runSlot(slot) {
  const client = new pg.Client({
    connectionString: DATABASE_URL,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
  });
  let slotLocked = false;
  let runLocked = false;
  try {
    await client.connect();
    const slotResult = await client.query(
      "select pg_try_advisory_lock($1::integer, $2::integer) as locked",
      [SLOT_LOCK_CLASS, slot],
    );
    slotLocked = slotResult.rows[0]?.locked === true;
    if (!slotLocked) {
      log("this five-minute slot was already claimed by another application replica");
      return;
    }

    const runResult = await client.query(
      "select pg_try_advisory_lock($1::integer, $2::integer) as locked",
      [RUN_LOCK_CLASS, LOCK_ID],
    );
    runLocked = runResult.rows[0]?.locked === true;
    if (!runLocked) {
      log("a previous recovery cycle is still running; this slot was skipped");
      return;
    }

    activeController = new AbortController();
    const timeout = setTimeout(() => activeController?.abort(), 290_000);
    try {
      const response = await fetch("http://127.0.0.1:" + PORT + "/api/cron/payment-recovery", {
        method: "GET",
        headers: { Authorization: "Bearer " + CRON_SECRET },
        cache: "no-store",
        signal: activeController.signal,
      });
      const payload = await response.json().catch(() => null);
      if (
        !response.ok ||
        payload?.enabled !== true ||
        payload?.reconcile?.ok === false ||
        payload?.messages?.ok === false
      ) {
        throw new Error("recovery endpoint did not complete successfully (HTTP " + response.status + ")");
      }
      const registered = Number(payload.pagePull?.registered ?? 0);
      const skipped = Number(payload.pagePull?.skipped ?? 0);
      const verified = Number(payload.reconcile?.checked ?? 0);
      const sent = Number(payload.messages?.sent ?? 0);
      log("cycle completed; imported=" + registered + ", skipped=" + skipped +
        ", verified=" + verified + ", emails_sent=" + sent +
        ", page_pull_error=" + (payload.pagePull?.error ? "yes" : "no"));
    } finally {
      clearTimeout(timeout);
      activeController = undefined;
    }
  } catch (error) {
    log("cycle failed: " + (error instanceof Error ? error.message : "unknown error"));
  } finally {
    // Keep the slot lock until the interval ends. This stops a second replica
    // from taking the same slot after the first replica has already finished.
    const releaseAt = (slot + 1) * INTERVAL_MS + 1_000;
    while (slotLocked && !stop.requested && Date.now() < releaseAt) await sleep(500);

    if (runLocked) {
      await client.query(
        "select pg_advisory_unlock($1::integer, $2::integer)",
        [RUN_LOCK_CLASS, LOCK_ID],
      ).catch(() => undefined);
    }
    if (slotLocked) {
      await client.query(
        "select pg_advisory_unlock($1::integer, $2::integer)",
        [SLOT_LOCK_CLASS, slot],
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
    await waitUntilNextSlot();
    if (stop.requested) break;
    const slot = Math.floor(Date.now() / INTERVAL_MS);
    await runSlot(slot);
  }
}

for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
  process.once(signal, () => {
    stop.requested = true;
    activeController?.abort();
  });
}

main().catch((error) => {
  log("stopped after an unexpected error: " + (error instanceof Error ? error.message : "unknown error"));
  process.exitCode = 1;
});
