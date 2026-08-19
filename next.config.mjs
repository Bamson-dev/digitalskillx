import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
    // Lowers peak memory during `next build` on small Docker hosts (Coolify).
    webpackBuildWorker: true,
    outputFileTracingIncludes: {
      "/admin/email-campaigns": ["./content/aimoneycode-30-day-email-sequence.md"],
      "/api/cron/email-campaigns": ["./content/aimoneycode-30-day-email-sequence.md"],
      "/api/admin/email-campaigns/drain": ["./content/aimoneycode-30-day-email-sequence.md"],
    },
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /\.md$/,
      type: "asset/source",
    });
    return config;
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "img.youtube.com" },
      { protocol: "https", hostname: "**.supabase.co" },
    ],
  },
};

const sentryUploadEnabled = Boolean(
  process.env.SENTRY_AUTH_TOKEN &&
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT,
);

/** Skip Sentry webpack plugin when no upload token — saves memory on small Docker hosts. */
export default sentryUploadEnabled
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      disableLogger: true,
    })
  : nextConfig;
