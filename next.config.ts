import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

/**
 * Base path for deployment.
 * - GitHub Pages: "/rdat-pwa" (set via BASE_PATH env in CI)
 * - Vercel / root domain: "" (default)
 */
const basePath = process.env.BASE_PATH || "";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,
  swcMinify: true,
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "google-fonts-cache",
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
          },
        },
      },
      {
        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "gstatic-fonts-cache",
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 60 * 60 * 24 * 365,
          },
        },
      },
    ],
  },
});

const nextConfig: NextConfig = {
  // Static HTML export — no Node.js server required
  output: "export",

  // Base path for sub-path deployments (GitHub Pages, etc.)
  basePath,

  // Asset prefix matches basePath for correct CDN resolution
  assetPrefix: basePath || undefined,

  // Images: disable optimization since there's no server
  images: {
    unoptimized: true,
  },

  // TypeScript strictness
  typescript: {
    ignoreBuildErrors: true,
  },

  // Disable React strict mode to avoid double-mount in development
  reactStrictMode: false,

  // Allow all cross-origin preview requests (sandbox environment)
  allowedDevOrigins: ["*"],

  // Silence Turbopack/webpack conflict warning from @ducanh2912/next-pwa
  turbopack: {},
};

export default withPWA(nextConfig);
