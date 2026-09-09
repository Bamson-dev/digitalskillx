import "server-only";
import { getServiceRoleKeySync } from "@/lib/env-service-role";
import { preloadRuntimeEnvIntoProcessEnv } from "@/lib/runtime-env";
import { createServerSupabaseFetch } from "@/lib/supabase/fetch-bridge";
import { getServerSupabaseUrl } from "@/lib/supabase/url";

const PROBE_TIMEOUT_MS = 3_000;

export type DatabaseProbeResult = {
  status: "unknown" | "connected" | "error";
  detail?: string;
};

async function restProbe(
  supabaseUrl: string,
  apiKey: string,
): Promise<{ ok: boolean; detail: string }> {
  try {
    const fetchWithRetry = createServerSupabaseFetch({
      retries: 0,
      baseDelayMs: 100,
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    const res = await fetchWithRetry(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/courses?select=id&limit=1`,
      {
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${apiKey}`,
        },
        cache: "no-store",
      },
    );
    if (res.ok) return { ok: true, detail: `http_${res.status}` };
    const body = (await res.text().catch(() => "")).slice(0, 160);
    return { ok: false, detail: `http_${res.status}:${body}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, detail: msg.slice(0, 200) };
  }
}

/** Fast DB liveness probe — avoids secret bootstrap and supabase-js client setup. */
export async function probeDatabaseConnection(): Promise<
  "unknown" | "connected" | "error"
> {
  return (await probeDatabaseConnectionDetailed()).status;
}

export async function probeDatabaseConnectionDetailed(): Promise<DatabaseProbeResult> {
  preloadRuntimeEnvIntoProcessEnv();

  const supabaseUrl = getServerSupabaseUrl();
  if (!supabaseUrl) return { status: "unknown", detail: "missing_supabase_url" };

  const serviceRole = getServiceRoleKeySync();
  if (serviceRole) {
    const result = await restProbe(supabaseUrl, serviceRole);
    if (result.ok) return { status: "connected", detail: result.detail };
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (anonKey) {
      const anon = await restProbe(supabaseUrl, anonKey);
      if (anon.ok) return { status: "connected", detail: `anon:${anon.detail}` };
      return {
        status: "error",
        detail: `service:${result.detail}|anon:${anon.detail}`,
      };
    }
    return { status: "error", detail: `service:${result.detail}` };
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (anonKey) {
    const anon = await restProbe(supabaseUrl, anonKey);
    if (anon.ok) return { status: "connected", detail: anon.detail };
    return { status: "error", detail: `anon:${anon.detail}` };
  }

  return { status: "unknown", detail: "missing_api_keys" };
}
