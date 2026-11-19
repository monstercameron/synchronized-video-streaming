import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  // Behind Nginx, which already compresses, compressing again in Node only costs CPU. Set COMPRESS=off in /etc/screening.env
  // there. Without a proxy (a laptop on the same Wi-Fi) Node keeps compressing, which is what you want.
  compress: process.env.COMPRESS !== "off",
  // Do not hash every page to make an ETag; the pages are small and different for each visitor.
  generateEtags: false,
  // Optional self-contained build (server.js plus only the files it needs), written to its own folder so the normal build is
  // untouched: NEXT_STANDALONE=1 NEXT_DIST_DIR=.next-standalone npm run build. Used for the Bun experiments in deploy/README.md.
  ...(process.env.NEXT_STANDALONE ? { output: "standalone" as const } : {}),
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

export default nextConfig;
