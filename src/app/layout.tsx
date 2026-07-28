import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { OnboardingProvider } from "@/context/onboarding-context";
import { UserProvider } from "@/context/user-context";
import { HostModeProvider } from "@/host/host-mode-provider";
import { EmbeddedAppBridgeBootstrap } from "@/host/embedded/embedded-app-bridge-bootstrap";
import { EmbeddedHostChrome } from "@/host/embedded/embedded-host-chrome";
import { ToastHost } from "@/components/layout/toast-host";
import { ChatwootWidget } from "@/components/chatwoot/chatwoot-widget";
import { APP_DESCRIPTION, APP_FULL_NAME, BRAND_FAVICON } from "@/lib/brand";
import "./globals.css";
import "./landing.css";

const displayFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-brand",
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: APP_FULL_NAME,
  description: APP_DESCRIPTION,
  // Safari ignores SVG for favicon / apple-touch; keep PNG + ICO as primary.
  icons: {
    icon: [
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: BRAND_FAVICON, type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: [
      {
        url: "/brand/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

/**
 * Root layout: global providers that must survive locale changes (onboarding).
 * Locale + messages live under app/[locale]/layout.tsx so client language switches
 * remount translations from the URL segment.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-read so a missing build-time NEXT_PUBLIC_ value cannot silently disable
  // App Bridge in Admin. The client id is public (it appears in the OAuth URL).
  const shopifyApiKey = (
    process.env.SHOPIFY_API_KEY ??
    process.env.NEXT_PUBLIC_SHOPIFY_API_KEY ??
    ""
  ).trim();

  return (
    <html
      lang="en"
      color-scheme="light"
      translate="no"
      // 容忍浏览器翻译扩展（如 Google Translate / 沉浸式翻译）在 hydration 前改写
      // <html lang> 与注入的 class（如 `translated`），避免开发期 hydration mismatch 告警。
      // 真正的 lang 由 src/components/i18n/sync-html-lang.tsx 的 effect 在 hydration 后同步。
      suppressHydrationWarning
      className={`${displayFont.variable} h-full antialiased`}
    >
      <head>
        {shopifyApiKey ? (
          <meta name="shopify-api-key" content={shopifyApiKey} />
        ) : null}
      </head>
      <body
        className="min-h-full bg-app-shell font-sans text-foreground"
        translate="no"
        suppressHydrationWarning
      >
        <HostModeProvider>
          <EmbeddedAppBridgeBootstrap>
            <EmbeddedHostChrome>
              <UserProvider>
                <OnboardingProvider>
                  {children}
                  <ToastHost />
                  <ChatwootWidget />
                </OnboardingProvider>
              </UserProvider>
            </EmbeddedHostChrome>
          </EmbeddedAppBridgeBootstrap>
        </HostModeProvider>
      </body>
    </html>
  );
}
