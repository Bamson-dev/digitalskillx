import "server-only";

const SENSITIVE =
  /password|passwd|secret|token|authorization|api[_-]?key|cookie|session|refresh_token|access_token|service_role|bearer/i;

function redactValue(key: string, value: unknown): unknown {
  if (SENSITIVE.test(key)) return "[redacted]";
  if (typeof value === "string" && value.length > 8 && SENSITIVE.test(value)) return "[redacted]";
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return redactObject(value as Record<string, unknown>);
  }
  if (Array.isArray(value)) return value.map((v, i) => redactValue(String(i), v));
  return value;
}

export function redactObject(input: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    out[key] = redactValue(key, value);
  }
  return out;
}

/** Structured production log — never prints secrets/tokens/passwords. */
export function secureLog(
  level: "info" | "warn" | "error",
  scope: string,
  message: string,
  meta?: Record<string, unknown>,
) {
  const payload = {
    scope,
    message,
    ...(meta ? { meta: redactObject(meta) } : {}),
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(`[${scope}]`, line);
  else if (level === "warn") console.warn(`[${scope}]`, line);
  else console.info(`[${scope}]`, line);
}
