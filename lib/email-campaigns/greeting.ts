export function campaignFirstName(fullName: string | null | undefined): string | null {
  const trimmed = String(fullName ?? "").trim();
  if (!trimmed) return null;
  const first = trimmed.split(/\s+/)[0] ?? "";
  if (!first || /^(undefined|null|n\/a|na|-)$/i.test(first)) return null;
  if (!/^[\p{L}][\p{L}.'’-]*$/u.test(first)) return null;
  return first;
}

export function campaignGreeting(fullName: string | null | undefined): string {
  const first = campaignFirstName(fullName);
  return first ? `Hey ${first},` : "Hey,";
}

/** Replace a leading "Hey," / "Hey" line with a personalized greeting. Never emit empty/null names. */
export function applyCampaignGreeting(body: string, fullName: string | null | undefined): string {
  const greeting = campaignGreeting(fullName);
  const replaced = body.replace(/^(Hey,?)(\r?\n)/, `${greeting}$2`);
  if (replaced !== body) return replaced;
  return `${greeting}\n\n${body}`;
}
