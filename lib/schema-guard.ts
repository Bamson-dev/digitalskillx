/**
 * Detect PostgREST / Postgres "column does not exist" errors so callers can degrade
 * instead of crashing the whole page with a global unexpected error.
 */
export function isMissingColumnError(message: string | null | undefined) {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("does not exist") &&
    (lower.includes("column") || lower.includes("could not find"))
  );
}
