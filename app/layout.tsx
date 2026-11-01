import type { Metadata, Viewport } from "next"
import { Geist_Mono, Inter } from "next/font/google"
import "./globals.css"
import { SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { APP_DOMAIN, APP_NAME } from "@/lib/config"
import { ModelProvider } from "@/lib/model-store/provider"
import { TanstackQueryProvider } from "@/lib/tanstack-query/tanstack-query-provider"
import { UserPreferencesProvider } from "@/lib/user-preference-store/provider"
import { UserProvider } from "@/lib/user-store/provider"
import { getUserProfile } from "@/lib/user/api"
import { ThemeProvider } from "next-themes"
import { PwaRegister } from "./components/pwa-register"
import { LayoutClient } from "./layout-client"

// Inter, as Linear uses. The CSS variable keeps its old name so nothing that
// reads --font-geist-sans has to change.
const geistSans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  // Base for relative openGraph/twitter URLs; without it `next build` warns
  // and falls back to http://localhost:3000.
  metadataBase: new URL(APP_DOMAIN),
  title: APP_NAME,
  description: `${APP_NAME} is the web interface for the Hermes agent.`,
  manifest: "/manifest.webmanifest",
  // Caddyfile serves /manifest.webmanifest and /icons/* without auth, so no crossOrigin is needed.
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#08090a" },
  ],
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const userProfile = await getUserProfile()

  return (
    // The font variables go on <html>, not <body>: Tailwind resolves
    // --font-sans for the root element, and with the variables on body it
    // resolved to nothing there, so the whole app silently rendered in the
    // system font instead of Inter.
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <TanstackQueryProvider>
          <LayoutClient />
          <PwaRegister />
          <UserProvider initialUser={userProfile}>
            <ModelProvider>
              <UserPreferencesProvider
                userId={userProfile?.id}
                initialPreferences={userProfile?.preferences}
              >
                <TooltipProvider delayDuration={200} skipDelayDuration={500}>
                  <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem
                    disableTransitionOnChange
                  >
                    <SidebarProvider defaultOpen>
                      <Toaster position="top-center" />
                      {children}
                    </SidebarProvider>
                  </ThemeProvider>
                </TooltipProvider>
              </UserPreferencesProvider>
            </ModelProvider>
          </UserProvider>
        </TanstackQueryProvider>
      </body>
    </html>
  )
}
