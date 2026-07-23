import "server-only";
import { bulkImportStage } from "@/lib/bulk-import-telemetry";

const MAX_CHAIN = 250;

/** Fire-and-forget self-invoke so Hobby (daily cron only) still drains jobs. */
export function scheduleBulkWorkerContinuation(params: {
  origin: string;
  path: "/api/cron/bulk-import" | "/api/cron/email-outbox";
  depth?: number;
  reason?: string;
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

  const url = new URL(params.path, params.origin);
  url.searchParams.set("depth", String(depth + 1));

  // Small delay lets the current invocation return before the next starts.
  const delayMs = 750;
  setTimeout(() => {
    void fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "x-bulk-continue-depth": String(depth + 1),
      },
      cache: "no-store",
    })
      .then(async (res) => {
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
      });
  }, delayMs);
}

export function continuationDepthFromRequest(request: Request) {
  const header = request.headers.get("x-bulk-continue-depth");
  if (header && /^\d+$/.test(header)) return Number(header);
  const url = new URL(request.url);
  const q = url.searchParams.get("depth");
  if (q && /^\d+$/.test(q)) return Number(q);
  return 0;
}
