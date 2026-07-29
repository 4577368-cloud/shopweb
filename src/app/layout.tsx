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
        {/*
          Detect Shopify Admin embed before React (avoids standalone chrome flash).
          App Bridge CDN must ONLY load when Admin signals exist (host / embedded=1
          / sticky host). Loading it on standalone login throws
          "missing required configuration fields: shop" and can leave the page as
          inert SSR HTML (tabs/buttons stop working).
          CDN rules: classic script, no async/defer; document.write during parse.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var q=new URLSearchParams(location.search);var host=(q.get("host")||"").trim();var embFlag=q.get("embedded")==="1"||q.get("embedded")==="true";var shop=(q.get("shop")||"").trim().toLowerCase();var stickyHost="";try{var raw=sessionStorage.getItem("tb_embedded_mode_v1");if(raw){var p=JSON.parse(raw);if(p&&p.isEmbedded&&p.host)stickyHost=String(p.host||"")}}catch(e){}var loadBridge=Boolean(host)||embFlag||Boolean(stickyHost);var inFrame=false;try{inFrame=window.self!==window.top}catch(e){inFrame=true}if(loadBridge||inFrame){document.documentElement.dataset.embedded="1"}if(loadBridge){try{sessionStorage.setItem("tb_embedded_mode_v1",JSON.stringify({isEmbedded:true,host:host||stickyHost,shop:shop}))}catch(e){}}${
              shopifyApiKey
                ? `if(loadBridge){document.write(${JSON.stringify(`<meta name="shopify-api-key" content="${shopifyApiKey}">`)});document.write('<script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"><\\/script>');}`
                : ""
            }}catch(e){}})();`,
          }}
        />
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
