import "server-only";
import { secureLog } from "@/lib/secure-log";

function memMb() {
  try {
    return Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  } catch {
    return null;
  }
}

/** Stage-by-stage bulk import telemetry — never logs passwords/secrets. */
export function bulkImportStage(
  stage: string,
  meta: {
    jobId?: string;
    ok?: boolean;
    rowCount?: number;
    durationMs?: number;
    error?: string;
    [key: string]: unknown;
  } = {},
) {
  secureLog(meta.ok === false ? "warn" : "info", "bulk-import", stage, {
    ...meta,
    heapMb: memMb(),
    at: new Date().toISOString(),
  });
}

export function timedStage<T>(
  stage: string,
  meta: { jobId?: string; rowCount?: number },
  fn: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  return fn()
    .then((result) => {
      bulkImportStage(stage, {
        ...meta,
        ok: true,
        durationMs: Date.now() - started,
      });
      return result;
    })
    .catch((err) => {
      bulkImportStage(stage, {
        ...meta,
        ok: false,
        durationMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    });
}
