/**
 * Allow only same-origin relative paths. Blocks open redirects like `//evil.com`.
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/dashboard") {
  const value = String(raw ?? "").trim();
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;
  if (!/^\/[A-Za-z0-9/_?&=%#.-]*$/.test(value)) return fallback;
  return value;
}
