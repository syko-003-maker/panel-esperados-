import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import { resolve } from "path";

// ✅ Load .env.prod in production if it exists and NODE_ENV is production
if (process.env.NODE_ENV === "production") {
  try {
    loadEnv({ path: resolve(".env.prod"), override: true });
  } catch (e) {
    // .env.prod doesn't exist or is invalid, but that's ok
    // Next.js will use environment variables from the system
  }
}

const nextConfig: NextConfig = {
  experimental: { authInterrupts: true },
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 5,
  },
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "91.86.166.95",
    "100.98.116.138",
  ],
  images: {
    unoptimized: false,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.discordapp.com",
      },
      {
        protocol: "https",
        hostname: "losesperados.fr",
      },
    ],
  },
  async redirects() {
    return [
      { source: "/staff/stat", destination: "/staff/stats", permanent: true },
      { source: "/staff/discor", destination: "/staff/discord", permanent: true },
    ];
  },
};

// Wrap with Sentry if DSN is configured
const sentryEnabled = !!process.env.SENTRY_DSN || !!process.env.NEXT_PUBLIC_SENTRY_DSN;

export default sentryEnabled
  ? withSentryConfig(nextConfig, {
      // For all available options, see:
      // https://github.com/getsentry/sentry-webpack-plugin#options

      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,

      // Only print logs for uploading source maps in CI
      silent: !process.env.CI,

      // Upload a larger set of source maps for prettier stack traces
      widenClientFileUpload: true,

      // Route browser requests to Sentry through a Next.js rewrite
      tunnelRoute: "/monitoring",

      // Sourcemaps configuration
      sourcemaps: {
        disable: false,
      },

      // Automatically tree-shake Sentry logger statements
      disableLogger: true,
    })
  : nextConfig;
