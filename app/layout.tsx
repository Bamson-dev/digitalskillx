import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { RegisterSW } from "@/components/register-sw";
import { ORG, siteUrl } from "@/lib/org";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const defaultDescription = `${ORG.tagline} Learn digital skills at your pace and earn verifiable certificates.`;

export const metadata: Metadata = {
  title: {
    default: "DigitalSkillX",
    template: "%s · DigitalSkillX",
  },
  description: defaultDescription,
  metadataBase: new URL(siteUrl()),
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "DigitalSkillX", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  openGraph: {
    type: "website",
    siteName: "DigitalSkillX",
    title: "DigitalSkillX",
    description: defaultDescription,
    url: siteUrl(),
  },
  twitter: {
    card: "summary_large_image",
    title: "DigitalSkillX",
    description: defaultDescription,
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
