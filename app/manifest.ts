import type { MetadataRoute } from "next";
import { ORG } from "@/lib/org";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DigitalSkillX",
    short_name: "DigitalSkillX",
    description: `${ORG.tagline} Learn digital skills and earn verifiable certificates.`,
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#dc2626",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
