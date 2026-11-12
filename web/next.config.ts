import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// Lets a phone on the same Wi-Fi load the dev site at this computer's address.
const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((n) => n && n.family === "IPv4" && !n.internal)
  .map((n) => n!.address);

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: lanAddresses,
  // The service worker must never be cached, or phones keep an old one.
  async headers() {
    return [
      {
        // Apple fetches this to link the domain to the App Clip; it must be JSON.
        source: "/.well-known/apple-app-site-association",
        headers: [{ key: "Content-Type", value: "application/json" }],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
