import "server-only";
/**
 * Contabo Coolify: public supabase.*.digitalskillx.com hairpins fail from app
 * containers. Resolve that hostname to coolify-proxy over Docker DNS, keep SNI/Host
 * as the public name so Traefik routes to Kong.
 */
import dns from "dns";
import { Agent, fetch as undiciFetch } from "undici";
import {
  createSupabaseFetch,
  type SupabaseFetchRetryOptions,
} from "@/lib/supabase/fetch-retry";

let sharedDispatcher: Agent | undefined;
let dispatcherReady = false;

type UndiciResponse = Awaited<ReturnType<typeof undiciFetch>>;

/** Statuses that must be constructed with a null body. */
const NULL_BODY_STATUSES = new Set([204, 205, 304]);

/**
 * undici's Response is a different class from the global Response. supabase-js
 * auth (GoTrue) checks instanceof Response when a request fails, so an
 * undici response made every auth error read as "{}" instead of
 * "Invalid login credentials". Re-wrap it as a native Response.
 */
async function toNativeResponse(res: UndiciResponse): Promise<Response> {
  const headers = new Headers();
  res.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    // Body is already decoded by undici, so these would no longer match it.
    if (lower === "content-encoding" || lower === "content-length") return;
    headers.append(key, value);
  });
  const body = NULL_BODY_STATUSES.has(res.status) ? null : await res.arrayBuffer();
  return new Response(body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

function getSupabaseDispatcher(): Agent | undefined {
  if (dispatcherReady) return sharedDispatcher;
  dispatcherReady = true;

  const env = process.env as Record<string, string | undefined>;
  const bridgeHost = env.SUPABASE_DOCKER_DNS?.trim() || "coolify-proxy";
  const publicHost = (() => {
    try {
      // Prefer Kong/upstream hostname for SNI + Docker DNS remap.
      // Never use NEXT_PUBLIC (/api/sb on www) here — that would remap www to
      // coolify-proxy and break same-origin fetches.
      return new URL(
        env.SUPABASE_URL ||
          env.SUPABASE_UPSTREAM_URL ||
          "https://supabase.digitalskillx.com",
      ).hostname;
    } catch {
      return "supabase.digitalskillx.com";
    }
  })();

  const rejectUnauthorized = env.NODE_TLS_REJECT_UNAUTHORIZED !== "0";

  sharedDispatcher = new Agent({
    connect: {
      rejectUnauthorized: rejectUnauthorized ? undefined : false,
      servername: publicHost,
      lookup(hostname, options, callback) {
        const target =
          hostname === publicHost || hostname === "supabase.digitalskillx.com"
            ? bridgeHost
            : hostname;
        dns.lookup(target, options as dns.LookupOneOptions, callback);
      },
    },
  });
  return sharedDispatcher;
}

/** Node/server fetch with Coolify DNS bridge + retries. */
export function createServerSupabaseFetch(
  options: SupabaseFetchRetryOptions = {},
): typeof fetch {
  const env = process.env as Record<string, string | undefined>;
  const isBuild =
    env.NEXT_PHASE === "phase-production-build" ||
    env.npm_lifecycle_event === "build";
  if (isBuild) {
    // Build containers cannot resolve coolify-proxy / Kong — keep SSG fast.
    return createSupabaseFetch({
      ...options,
      retries: options.retries ?? 0,
      timeoutMs: options.timeoutMs ?? 2_500,
    });
  }

  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 400;
  const timeoutMs = options.timeoutMs ?? 12_000;
  const fallback = createSupabaseFetch(options);

  return async (input, init) => {
    const dispatcher = getSupabaseDispatcher();
    if (!dispatcher) return fallback(input, init);

    let lastError: unknown;
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
        return await toNativeResponse(response);
      } catch (err) {
        lastError = err;
        if (attempt >= retries) break;
        await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** attempt));
      } finally {
        clearTimeout(timeout);
        parentSignal?.removeEventListener("abort", onAbort);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  };
}
