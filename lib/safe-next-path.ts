/**
 * Allow only same-origin relative paths. Blocks open redirects like `//evil.com`.
 * Also accepts absolute DigitalSkillX URLs (from older enrollment emails) and
 * converts them to a safe path + query.
 */
const ALLOWED_HOSTS = new Set([
  "digitalskillx.com",
  "www.digitalskillx.com",
  "api.digitalskillx.com",
  "staging.digitalskillx.com",
  "api.staging.digitalskillx.com",
  "localhost",
  "127.0.0.1",
]);

export function safeNextPath(raw: string | null | undefined, fallback = "/dashboard") {
  const value = String(raw ?? "").trim();
  if (!value) return fallback;

  if (/^https?:\/\//i.test(value)) {
    try {
      const u = new URL(value);
      if (!ALLOWED_HOSTS.has(u.hostname.toLowerCase())) return fallback;
      const path = `${u.pathname}${u.search}` || "/";
      return safeNextPath(path, fallback);
    } catch {
      return fallback;
    }
  }

  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;
  if (!/^\/[A-Za-z0-9/_?&=%#.-]*$/.test(value)) return fallback;
  return value;
}
