import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

/**
 * RDAT Copilot — Next.js Configuration
 *
 * Optimized for Vercel deployment with WebGPU/WASM support.
 * Cross-Origin Isolation headers (COOP/COEP) enable SharedArrayBuffer,
 * which is required by WebLLM for fast weight transfer to the GPU and by
 * Transformers.js for multi-threaded WASM inference.
 *
 * For GitHub Pages static export: use `OUTPUT=export BASE_PATH=/rdat-pwa npm run build`
 *   → The `OUTPUT` env var enables static export mode conditionally.
 */

/* ─── PWA Plugin ─────────────────────────────────────────────────────── */

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,
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

/* ─── Base Path ──────────────────────────────────────────────────────── */

const basePath = process.env.BASE_PATH || "";

/* ─── Core Config ────────────────────────────────────────────────────── */

const nextConfig: NextConfig = {
  // --- Conditional static export (only for GitHub Pages CI) ---
  // Vercel builds natively — do NOT set output:'export' for Vercel.
  ...(process.env.OUTPUT === "export" ? { output: "export" as const } : {}),

  // --- Base path for sub-path deployments (GitHub Pages, etc.) ---
  basePath: basePath || undefined,

  // --- Asset prefix matches basePath for correct CDN resolution ---
  assetPrefix: basePath || undefined,

  // --- Image optimization ---
  // Unoptimized when doing static export; Vercel handles this natively.
  images: process.env.OUTPUT === "export"
    ? { unoptimized: true }
    : {},

  // --- SWC minification is enabled by default in Next.js 16+ ---

  // --- TypeScript: don't fail the build on type errors ---
  typescript: {
    ignoreBuildErrors: true,
  },

  // --- Disable React strict mode to avoid double-mount in development ---
  reactStrictMode: false,

  // --- Allow all cross-origin preview requests (sandbox environment) ---
  allowedDevOrigins: ["*"],

  // --- Silence Turbopack/webpack conflict warning from @ducanh2912/next-pwa ---
  turbopack: {},

  // --- Security Headers (Cross-Origin Isolation for WebGPU/WASM) ---
  // SharedArrayBuffer is required by:
  //   • WebLLM — fast weight transfer to GPU
  //   • Transformers.js — multi-threaded WASM inference
  // Browsers only expose SharedArrayBuffer when COEP+COOP headers are set.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },

  // --- Webpack Configuration (WASM support) ---
  // Transformers.js and Orama require proper WASM loading.
  // asyncWebAssembly enables top-level await for WASM modules.
  webpack: (config, { isServer }) => {
    // Enable async WASM loading
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    // Ensure .wasm files are handled correctly
    config.module.rules.push({
      test: /\.wasm$/,
      type: "asset/resource",
    });

    return config;
  },
};

export default withPWA(nextConfig);
