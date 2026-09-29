/**
 * GoTrue generateLink() puts the verifyOtp hash on `properties.hashed_token`.
 * `email_otp` is a short numeric code and must not be used as token_hash.
 */
export function extractGoTrueHashedToken(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const row = data as Record<string, unknown>;
  const props =
    row.properties && typeof row.properties === "object"
      ? (row.properties as Record<string, unknown>)
      : row;

  for (const key of ["hashed_token", "token_hash"]) {
    const value = props[key];
    if (typeof value === "string" && value.trim() && !isShortEmailOtp(value)) {
      return value.trim();
    }
  }

  const actionLink = typeof props.action_link === "string" ? props.action_link : "";
  if (actionLink) {
    try {
      const url = new URL(actionLink);
      const fromQuery =
        url.searchParams.get("token_hash") ||
        url.searchParams.get("hashed_token") ||
        url.searchParams.get("token");
      if (fromQuery?.trim() && !isShortEmailOtp(fromQuery)) return fromQuery.trim();
    } catch {
      /* ignore malformed action_link */
    }
  }
  return "";
}

function isShortEmailOtp(value: string) {
  return /^\d{4,8}$/.test(value.trim());
}
