import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle (only what's needed at runtime, deps
  // included) -- lets the production image skip shipping node_modules.
  output: "standalone",
};

export default nextConfig;
