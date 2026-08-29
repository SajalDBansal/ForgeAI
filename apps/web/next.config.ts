import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@forgeAI/ui", "@forgeAI/shared"],
}

export default nextConfig
