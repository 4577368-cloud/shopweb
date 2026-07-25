import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { OnboardingProvider } from "@/context/onboarding-context";
import { UserProvider } from "@/context/user-context";
import { HubModeProvider } from "@/lib/hub/hub-mode";
import { ToastHost } from "@/components/layout/toast-host";
import { APP_DESCRIPTION, APP_FULL_NAME } from "@/lib/brand";
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
};

/**
 * Root layout: global providers that must survive locale changes (onboarding, hub).
 * Locale + messages live under app/[locale]/layout.tsx so client language switches
 * remount translations from the URL segment.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
      <body
        className="min-h-full bg-app-shell font-sans text-foreground"
        translate="no"
        suppressHydrationWarning
      >
        <UserProvider>
          <OnboardingProvider>
            <HubModeProvider>
              {children}
              <ToastHost />
            </HubModeProvider>
          </OnboardingProvider>
        </UserProvider>
      </body>
    </html>
  );
}
