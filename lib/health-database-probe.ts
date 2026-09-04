import "server-only";
import { getServiceRoleKeySync } from "@/lib/env-service-role";
import { preloadRuntimeEnvIntoProcessEnv } from "@/lib/runtime-env";
import { createSupabaseFetch } from "@/lib/supabase/fetch-retry";

const PROBE_TIMEOUT_MS = 5_000;

async function restProbe(
  supabaseUrl: string,
  apiKey: string,
): Promise<boolean> {
  try {
    const fetchWithRetry = createSupabaseFetch({
      retries: 2,
      baseDelayMs: 250,
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
    return res.ok;
  } catch {
    return false;
  }
}

/** Fast DB liveness probe — avoids secret bootstrap and supabase-js client setup. */
export async function probeDatabaseConnection(): Promise<
  "unknown" | "connected" | "error"
> {
  preloadRuntimeEnvIntoProcessEnv();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl) return "unknown";

  const serviceRole = getServiceRoleKeySync();
  if (serviceRole && (await restProbe(supabaseUrl, serviceRole))) {
    return "connected";
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (anonKey && (await restProbe(supabaseUrl, anonKey))) {
    return "connected";
  }

  return "error";
}
