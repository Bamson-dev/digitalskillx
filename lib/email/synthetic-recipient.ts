/** Fake inboxes created by production certification/stress CSVs — they always bounce. */
export function isSyntheticTestRecipient(email: string) {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at < 0) return false;
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (domain !== "digitalskillx.com") return false;
  return /^(cert|csv-cert|stress|paystack-cert|rc-|accept|csv-accept|gate-|mark-complete|course-access)\+/.test(
    local,
  );
}
