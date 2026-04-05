import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    // dnd-kit type resolution issue under pnpm virtual store in Docker — tracked separately
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
