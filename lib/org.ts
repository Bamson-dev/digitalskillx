import { normalizePublicOrigin } from "@/lib/public-site-origin";

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
  // Never emit localhost/private origins in production — Coolify often has
  // NEXT_PUBLIC_SITE_URL left at http://localhost:3000 from .env.example.
  return normalizePublicOrigin(process.env.NEXT_PUBLIC_SITE_URL);
}
