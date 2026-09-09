/**
 * Retry transient Supabase/Cloudflare failures (522, 502, 503, 504, timeouts).
 * Safe for idempotent reads and most PostgREST writes during platform blips.
 */
import { Agent, fetch as undiciFetch } from "undici";
import dns from "node:dns";

const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 522, 524]);

export type SupabaseFetchRetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
};

let sharedDispatcher: Agent | undefined;
let dispatcherReady = false;

/**
 * Contabo Coolify: public *.digitalskillx.com hairpins fail from app containers.
 * Resolve Supabase host via Docker DNS to coolify-proxy / Kong instead.
 */
function getSupabaseDispatcher(): Agent | undefined {
  if (dispatcherReady) return sharedDispatcher;
  dispatcherReady = true;

  const env = process.env as Record<string, string | undefined>;
  const bridgeHost =
    env.SUPABASE_DOCKER_DNS?.trim() ||
    (env.SUPABASE_URL?.includes("coolify-proxy") ? undefined : "coolify-proxy");
  const publicHost = (() => {
    try {
      return new URL(
        env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "https://supabase.digitalskillx.com",
      ).hostname;
    } catch {
      return "supabase.digitalskillx.com";
    }
  })();

  const rejectUnauthorized = env.NODE_TLS_REJECT_UNAUTHORIZED !== "0";

  if (!bridgeHost && rejectUnauthorized) {
    sharedDispatcher = undefined;
    return sharedDispatcher;
  }

  sharedDispatcher = new Agent({
    connect: {
      rejectUnauthorized: rejectUnauthorized ? undefined : false,
      servername: publicHost,
      lookup(hostname, options, callback) {
        const target =
          bridgeHost && (hostname === publicHost || hostname === "supabase.digitalskillx.com")
            ? bridgeHost
            : hostname;
        dns.lookup(target, options, callback);
      },
    },
  });
  return sharedDispatcher;
}

export function createSupabaseFetch(options: SupabaseFetchRetryOptions = {}): typeof fetch {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 400;
  const timeoutMs = options.timeoutMs ?? 12_000;

  return async (input, init) => {
    let lastError: unknown;
    const dispatcher = getSupabaseDispatcher();

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const parentSignal = init?.signal;
      const onAbort = () => controller.abort();
      parentSignal?.addEventListener("abort", onAbort, { once: true });

      try {
        const response = await undiciFetch(input as string | URL, {
          ...init,
          signal: controller.signal,
          dispatcher,
        } as Parameters<typeof undiciFetch>[1]);
        if (attempt < retries && RETRY_STATUS.has(response.status)) {
          lastError = new Error(`supabase_http_${response.status}`);
          await delay(baseDelayMs * 2 ** attempt);
          continue;
        }
        return response as unknown as Response;
      } catch (err) {
        lastError = err;
        if (attempt >= retries) break;
        await delay(baseDelayMs * 2 ** attempt);
      } finally {
        clearTimeout(timeout);
        parentSignal?.removeEventListener("abort", onAbort);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
