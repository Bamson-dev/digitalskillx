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
  return (
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://digitalskillx.com"
  ).replace(/\/$/, "");
}
