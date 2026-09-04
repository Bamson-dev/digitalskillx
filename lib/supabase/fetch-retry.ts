/**
 * Retry transient Supabase/Cloudflare failures (522, 502, 503, 504, timeouts).
 * Safe for idempotent reads and most PostgREST writes during platform blips.
 */
const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 522, 524]);

export type SupabaseFetchRetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
};

export function createSupabaseFetch(options: SupabaseFetchRetryOptions = {}): typeof fetch {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 400;
  const timeoutMs = options.timeoutMs ?? 12_000;

  return async (input, init) => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const parentSignal = init?.signal;
      const onAbort = () => controller.abort();
      parentSignal?.addEventListener("abort", onAbort, { once: true });

      try {
        const response = await fetch(input, {
          ...init,
          signal: controller.signal,
        });
        if (attempt < retries && RETRY_STATUS.has(response.status)) {
          lastError = new Error(`supabase_http_${response.status}`);
          await delay(baseDelayMs * 2 ** attempt);
          continue;
        }
        return response;
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
