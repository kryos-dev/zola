import bundleAnalyzer from "@next/bundle-analyzer"
import type { NextConfig } from "next"

// Configure bundle analyzer and wrap the Next config factory
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
})

const nextConfig: NextConfig = withBundleAnalyzer({
  output: "standalone",
  devIndicators: false,
  turbopack: {},
  // instrumentation.ts runs the migrator from ./drizzle at boot, but nothing
  // imports those files, so tracing drops them and a Vercel deploy boots with
  // no migrations (new columns, e.g. 0011's projects.folder, never land).
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
  },
  // Installed-PWA deep links and old shares from the per-chat era.
  async redirects() {
    return [
      { source: "/c/:path*", destination: "/", permanent: false },
      { source: "/share/:path*", destination: "/", permanent: false },
    ]
  },
  async headers() {
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] }]
  },
  serverExternalPackages: ["shiki", "vscode-oniguruma", "postgres"],
})

export default nextConfig
