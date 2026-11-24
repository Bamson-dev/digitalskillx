import "server-only";
import { getPool, isDatabaseConfigured } from "@/lib/db/pool";

const PROBE_TIMEOUT_MS = 3_000;

export type DatabaseProbeResult = {
  status: "unknown" | "connected" | "error";
  detail?: string;
};

/** Fast liveness probe: one trivial query with a short timeout. */
export async function probeDatabaseConnection(): Promise<"unknown" | "connected" | "error"> {
  return (await probeDatabaseConnectionDetailed()).status;
}

export async function probeDatabaseConnectionDetailed(): Promise<DatabaseProbeResult> {
  if (!isDatabaseConfigured()) return { status: "unknown", detail: "missing_database_url" };
  try {
    const res = await Promise.race([
      getPool().query("select 1 as ok from public.courses limit 1").then(() => "ok"),
      new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), PROBE_TIMEOUT_MS)),
    ]);
    if (res === "ok") return { status: "connected", detail: "query_ok" };
    return { status: "error", detail: "timeout" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "error", detail: msg.slice(0, 200) };
  }
}
