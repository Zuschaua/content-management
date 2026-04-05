import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Required for pnpm monorepo: traces files from repo root so standalone
  // includes all node_modules from the pnpm virtual store
  outputFileTracingRoot: path.join(__dirname, "../../"),
  typescript: {
    // dnd-kit type resolution issue under pnpm virtual store in Docker — tracked separately
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
