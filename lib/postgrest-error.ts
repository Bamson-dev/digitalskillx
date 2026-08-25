/** Format PostgREST / Supabase errors with useful detail instead of bare "Bad Request". */
export function formatPostgrestError(error: {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
} | null | undefined) {
  if (!error) return "Unknown database error";
  const parts = [error.message, error.details, error.hint, error.code].filter(Boolean);
  return parts.join(" — ") || "Unknown database error";
}

export function isBadRequestError(message: string | null | undefined) {
  if (!message) return false;
  return message.toLowerCase().includes("bad request");
}
