import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const dockerBuild = process.env.DOCKER_BUILD === "1";

const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  // Coolify builds already lint in CI / locally; skipping saves peak RAM on small VPS.
  ...(dockerBuild ? { eslint: { ignoreDuringBuilds: true } } : {}),
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
    // Worker can raise total RSS on tiny hosts and get the build SIGKILL'd (exit 255).
    webpackBuildWorker: !dockerBuild,
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
      { protocol: "https", hostname: "supabase.digitalskillx.com" },
      { protocol: "https", hostname: "www.digitalskillx.com" },
    ],
  },
};

const sentryUploadEnabled =
  !dockerBuild &&
  Boolean(
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
