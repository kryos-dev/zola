import type { MetadataRoute } from "next"
import { APP_NAME } from "@/lib/config"

// Colours are the light --background in globals.css; dark is handled by
// viewport.themeColor. Screenshots are skipped (optional richer install UI).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    id: "/",
    scope: "/",
    description: "Chat with your Hermes agent",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    shortcuts: [{ name: "Voice", short_name: "Voice", url: "/?voice=1" }],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  }
}
