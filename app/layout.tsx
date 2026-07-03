import type { Metadata } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";
import { RegisterSW } from "@/components/register-sw";
import { CurrencyProvider } from "@/components/providers/currency-provider";
import { ORG, siteUrl } from "@/lib/org";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });

const defaultDescription = `${ORG.tagline} Learn digital skills at your pace and earn verifiable certificates.`;

export const metadata: Metadata = {
  title: {
    default: "DigitalSkillX",
    template: "%s · DigitalSkillX",
  },
  description: defaultDescription,
  metadataBase: new URL(siteUrl()),
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "DigitalSkillX", statusBarStyle: "black-translucent" },
  other: { "mobile-web-app-capable": "yes" },
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

export const viewport = {
  themeColor: "#ffffff",
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
      <body className={`${inter.variable} ${display.variable} font-sans antialiased`}>
        <CurrencyProvider>{children}</CurrencyProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
