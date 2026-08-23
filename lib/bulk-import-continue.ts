import "server-only";
import { waitUntil } from "@vercel/functions";
import { bulkImportStage } from "@/lib/bulk-import-telemetry";

const MAX_CHAIN = 250;

/**
 * Always call the public www host. Apex 308s and drops Authorization.
 * *.vercel.app is often behind Deployment Protection, which also 401s the cron token.
 */
export function resolveCronContinuationOrigin(passedOrigin: string): string {
  let raw = passedOrigin.trim() || "https://www.digitalskillx.com";
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  try {
    const url = new URL(raw);
    if (url.hostname === "digitalskillx.com" || url.hostname.endsWith(".vercel.app")) {
      return "https://www.digitalskillx.com";
    }
    return url.origin;
  } catch {
    return "https://www.digitalskillx.com";
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fire-and-forget self-invoke so Hobby (daily cron only) still drains jobs. */
export function scheduleBulkWorkerContinuation(params: {
  origin: string;
  path:
    | "/api/cron/bulk-import"
    | "/api/cron/email-outbox"
    | "/api/cron/email-campaigns"
    | "/api/cron/webinar-follow-up";
  depth?: number;
  reason?: string;
  jobId?: string;
  delayMs?: number;
}) {
  const secret = process.env.CRON_SECRET?.trim();
  const depth = params.depth ?? 0;
  if (!secret) {
    bulkImportStage("continuation_skipped_no_secret", {
      ok: false,
      path: params.path,
      reason: params.reason,
    });
    return;
  }
  if (depth >= MAX_CHAIN) {
    bulkImportStage("continuation_chain_cap", {
      ok: false,
      path: params.path,
      depth,
    });
    if (params.path === "/api/cron/webinar-follow-up") {
      scheduleBulkWorkerContinuation({
        origin: params.origin,
        path: params.path,
        depth: 0,
        reason: "wfu_chain_reset",
        delayMs: 8_000,
      });
    }
    return;
  }

  const url = new URL(params.path, resolveCronContinuationOrigin(params.origin));
  url.searchParams.set("depth", String(depth + 1));
  if (params.jobId) url.searchParams.set("jobId", params.jobId);

  const nextDepth = depth + 1;
  const fire = () =>
    fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "x-bulk-continue-depth": String(nextDepth),
      },
      cache: "no-store",
      redirect: "error",
    })
      .then((res) => {
        bulkImportStage("continuation_fired", {
          ok: res.ok,
          path: params.path,
          depth: nextDepth,
          status: res.status,
          reason: params.reason,
        });
      })
      .catch((err) => {
        bulkImportStage("continuation_failed", {
          ok: false,
          path: params.path,
          depth: nextDepth,
          error: err instanceof Error ? err.message : String(err),
        });
      });

  const delayMs = Math.max(0, params.delayMs ?? 0);
  // Keep the isolate alive until this request is in flight. Otherwise Vercel
  // freezes the function after the HTTP response and the next chunk never starts.
  waitUntil(delayMs > 0 ? sleep(delayMs).then(fire) : fire());
}

/** Keep draining webinar follow-up even if one continuation request fails. */
export function keepWebinarFollowupSending(params: {
  moreDue: boolean;
  depth?: number;
  reason: string;
}) {
  if (!params.moreDue) return;
  const origin = "https://www.digitalskillx.com";
  const depth = params.depth ?? 0;
  scheduleBulkWorkerContinuation({
    origin,
    path: "/api/cron/webinar-follow-up",
    depth,
    reason: params.reason,
  });
  scheduleBulkWorkerContinuation({
    origin,
    path: "/api/cron/webinar-follow-up",
    depth,
    reason: `${params.reason}_retry_8s`,
    delayMs: 8_000,
  });
  scheduleBulkWorkerContinuation({
    origin,
    path: "/api/cron/webinar-follow-up",
    depth,
    reason: `${params.reason}_retry_45s`,
    delayMs: 45_000,
  });
}

export function continuationDepthFromRequest(request: Request) {
  const header = request.headers.get("x-bulk-continue-depth");
  if (header && /^\d+$/.test(header)) return Number(header);
  const url = new URL(request.url);
  const q = url.searchParams.get("depth");
  if (q && /^\d+$/.test(q)) return Number(q);
  return 0;
}
