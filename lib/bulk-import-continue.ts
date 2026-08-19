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

/** Fire-and-forget self-invoke so Hobby (daily cron only) still drains jobs. */
export function scheduleBulkWorkerContinuation(params: {
  origin: string;
  path: "/api/cron/bulk-import" | "/api/cron/email-outbox" | "/api/cron/email-campaigns";
  depth?: number;
  reason?: string;
  jobId?: string;
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
    return;
  }

  const url = new URL(params.path, resolveCronContinuationOrigin(params.origin));
  url.searchParams.set("depth", String(depth + 1));
  if (params.jobId) url.searchParams.set("jobId", params.jobId);

  // Keep the isolate alive until this request is in flight. Otherwise Vercel
  // freezes the function after the HTTP response and the next chunk never starts.
  waitUntil(
    fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "x-bulk-continue-depth": String(depth + 1),
      },
      cache: "no-store",
      redirect: "error",
    })
      .then((res) => {
        bulkImportStage("continuation_fired", {
          ok: res.ok,
          path: params.path,
          depth: depth + 1,
          status: res.status,
          reason: params.reason,
        });
      })
      .catch((err) => {
        bulkImportStage("continuation_failed", {
          ok: false,
          path: params.path,
          depth: depth + 1,
          error: err instanceof Error ? err.message : String(err),
        });
      }),
  );
}

export function continuationDepthFromRequest(request: Request) {
  const header = request.headers.get("x-bulk-continue-depth");
  if (header && /^\d+$/.test(header)) return Number(header);
  const url = new URL(request.url);
  const q = url.searchParams.get("depth");
  if (q && /^\d+$/.test(q)) return Number(q);
  return 0;
}
