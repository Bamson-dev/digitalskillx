import "server-only";
import { getServiceRoleKeySync } from "@/lib/env-service-role";
import { preloadRuntimeEnvIntoProcessEnv } from "@/lib/runtime-env";
import { createSupabaseFetch } from "@/lib/supabase/fetch-retry";
import { getServerSupabaseUrl } from "@/lib/supabase/url";

const PROBE_TIMEOUT_MS = 2_000;

export type DatabaseProbeResult = {
  status: "unknown" | "connected" | "error";
  detail?: string;
};

async function restProbe(
  supabaseUrl: string,
  apiKey: string,
  init?: RequestInit,
): Promise<{ ok: boolean; detail: string }> {
  try {
    const fetchWithRetry = createSupabaseFetch({
      retries: 0,
      baseDelayMs: 100,
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    const res = await fetchWithRetry(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/courses?select=id&limit=1`,
      {
        ...init,
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${apiKey}`,
          ...(init?.headers ?? {}),
        },
        cache: "no-store",
      },
    );
    if (res.ok) return { ok: true, detail: `http_${res.status}` };
    const body = (await res.text().catch(() => "")).slice(0, 120);
    return { ok: false, detail: `http_${res.status}:${body}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, detail: msg.slice(0, 120) };
  }
}

function candidateUrls(primary: string): string[] {
  const env = process.env as Record<string, string | undefined>;
  const extras = (env.SUPABASE_URL_CANDIDATES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const defaults = [
    primary,
    "http://l1jjutvoumbd6ulav7qcmmoz:8000",
    "http://lacy7js1uuvik6c2owzr4n4j-supabase-kong:8000",
    "http://supabase-kong:8000",
    "http://coolify-proxy:80",
    "http://coolify-proxy:443",
    "https://supabase.digitalskillx.com",
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of [...extras, ...defaults]) {
    const normalized = url.replace(/\/$/, "");
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

/** Fast DB liveness probe — avoids secret bootstrap and supabase-js client setup. */
export async function probeDatabaseConnection(): Promise<
  "unknown" | "connected" | "error"
> {
  return (await probeDatabaseConnectionDetailed()).status;
}

export async function probeDatabaseConnectionDetailed(): Promise<DatabaseProbeResult> {
  preloadRuntimeEnvIntoProcessEnv();

  const primary = getServerSupabaseUrl();
  if (!primary) return { status: "unknown", detail: "missing_supabase_url" };

  const serviceRole = getServiceRoleKeySync();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const key = serviceRole || anonKey;
  if (!key) return { status: "unknown", detail: "missing_api_keys" };

  const attempts: string[] = [];
  for (const url of candidateUrls(primary)) {
    const headers: Record<string, string> = {};
    if (url.includes("coolify-proxy")) {
      headers.Host = "supabase.digitalskillx.com";
    }
    const result = await restProbe(url, key, { headers });
    attempts.push(`${url}=>${result.detail}`);
    if (result.ok) {
      return {
        status: "connected",
        detail: `via:${url}|${result.detail}`,
      };
    }
  }

  return {
    status: "error",
    detail: attempts.join(";").slice(0, 500),
  };
}
