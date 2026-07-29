import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Next 16 blocks /_next/* (incl. HMR) from non-origin hosts by default.
  // Opening http://127.0.0.1 while the server advertises localhost leaves the
  // login page as inert SSR HTML — tabs/buttons appear but never hydrate.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  turbopack: {
    root: path.join(__dirname),
  },
  async rewrites() {
    const apiBase = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/+$/, "");
    if (!apiBase) return [];
    return [
      {
        source: "/api/plugin/:path*",
        destination: `${apiBase}/api/plugin/:path*`,
      },
    ];
  },
  /**
   * Allow Shopify Admin to embed this app (App Store embedded mode).
   * frame-ancestors replaces X-Frame-Options for modern browsers.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors https://admin.shopify.com https://*.myshopify.com https://*.shopify.com;",
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "**.alicdn.com",
      },
      {
        protocol: "https",
        hostname: "**.1688.com",
      },
      {
        protocol: "https",
        hostname: "cdn.shopify.com",
      },
      {
        protocol: "https",
        hostname: "**.shopifycdn.com",
      },
      {
        protocol: "https",
        hostname: "**.myshopify.com",
      },
    ],
  },
};

export default nextConfig;
