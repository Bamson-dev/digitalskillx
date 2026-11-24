import "server-only";
import type { DbClient } from "@/lib/db/client";
import { getPaystackSecretKey } from "@/lib/env-paystack";
import { secureLog } from "@/lib/secure-log";
import type { Db, RecoveryDeps } from "./engine";
import { registerPulledRows, type PulledRow } from "./page-pull-core";

/**
 * Paystack Payment Page buyers may never visit DigitalSkillX before checkout.
 * Poll recent failed and abandoned transactions so those attempts enter the
 * same recovery flow as native checkout. The overlap makes missed scheduler
 * runs recoverable; the reference unique index makes repeat scans idempotent.
 */
const WINDOW_HOURS = 6;
const PER_PAGE = 100;
const MAX_PAGES_PER_STATUS = 25;
const REQUEST_TIMEOUT_MS = 15_000;

type PaystackListResponse = {
  status?: boolean;
  message?: string;
  data?: PulledRow[];
  meta?: {
    pageCount?: number;
    page?: number;
    perPage?: number;
    total?: number;
    pagination?: {
      pageCount?: number;
      currentPage?: number;
      perPage?: number;
      total?: number;
    };
  };
};

async function listStatus(
  status: "failed" | "abandoned",
  secret: string,
  from: string,
  signalFactory: () => { signal: AbortSignal; done: () => void },
) {
  const rows: PulledRow[] = [];
  let pages = 0;
  let truncated = false;

  for (let page = 1; page <= MAX_PAGES_PER_STATUS; page += 1) {
    const timeout = signalFactory();
    let res: Response | null = null;
    let json: PaystackListResponse | null = null;
    try {
      const url = new URL("https://api.paystack.co/transaction");
      url.searchParams.set("status", status);
      url.searchParams.set("perPage", String(PER_PAGE));
      url.searchParams.set("page", String(page));
      url.searchParams.set("from", from);
      res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${secret}` },
        signal: timeout.signal,
        cache: "no-store",
      });
      json = (await res.json().catch(() => null)) as PaystackListResponse;
    } finally {
      timeout.done();
    }

    if (!res || !json || !res.ok || !json.status || !Array.isArray(json.data)) {
      throw new Error(`paystack_list_${status}_http_${res.status}`);
    }

    pages += 1;
    rows.push(...json.data);

    const pageCount = Number(json.meta?.pageCount ?? json.meta?.pagination?.pageCount ?? 0);
    if (pageCount > 0) {
      if (page >= pageCount) break;
      if (page === MAX_PAGES_PER_STATUS) truncated = true;
    } else if (json.data.length < PER_PAGE) {
      break;
    } else if (page === MAX_PAGES_PER_STATUS) {
      truncated = true;
    }
  }

  return { rows, pages, truncated };
}

export async function pullPaymentPageAttempts(db: Db, deps: RecoveryDeps, admin: DbClient) {
  const total = {
    listed: 0,
    registered: 0,
    skipped: 0,
    pages: 0,
    truncated: false,
    error: null as string | null,
  };

  try {
    const secret = await getPaystackSecretKey(admin);
    const from = new Date(deps.now() - WINDOW_HOURS * 3_600_000).toISOString();

    const signalFactory = () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      return { signal: controller.signal, done: () => clearTimeout(timer) };
    };

    for (const status of ["failed", "abandoned"] as const) {
      const result = await listStatus(status, secret, from, signalFactory);
      total.pages += result.pages;
      total.truncated ||= result.truncated;
      const summary = await registerPulledRows(db, deps, result.rows);
      total.listed += summary.listed;
      total.registered += summary.registered;
      total.skipped += summary.skipped;
    }

    if (total.truncated) {
      secureLog("warn", "payment-recovery", "page_pull_page_limit_reached", {
        pages: total.pages,
        windowHours: WINDOW_HOURS,
      });
    }
  } catch (err) {
    total.error = err instanceof Error ? err.message.slice(0, 120) : "error";
    secureLog("warn", "payment-recovery", "page_pull_failed", { error: total.error });
  }

  return total;
}
