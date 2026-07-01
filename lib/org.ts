/** Organisation and platform branding constants. Move to a settings table later. */
export const ORG = {
  platformName: "DigitalSkillX",
  tagline: "Where Profitable Digital Skills Are Sold",
  name: "Pdigital MarketStore Ltd",
  shortName: "DigitalSkillX",
  certificateOrg: "DigitalSkillX | Pdigital MarketStore Ltd",
  footer: "DigitalSkillX by Pdigital MarketStore Ltd",
  instructor: "Bamidele",
  rc: "RC 8015428",
  location: "Lagos, Nigeria",
  domain: "digitalskillx.com",
};

export function siteUrl() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return "https://digitalskillx.com";
  const normalized = raw.replace(/\/$/, "");
  try {
    new URL(normalized);
    return normalized;
  } catch {
    return "https://digitalskillx.com";
  }
}
