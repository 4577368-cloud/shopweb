import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { OnboardingProvider } from "@/context/onboarding-context";
import { HubModeProvider } from "@/lib/hub/hub-mode";
import { ToastHost } from "@/components/layout/toast-host";
import { APP_DESCRIPTION, APP_FULL_NAME } from "@/lib/brand";
import "./globals.css";

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
      translate="no"
      className={`${displayFont.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-app-shell font-sans text-foreground" translate="no">
        <OnboardingProvider>
          <HubModeProvider>
            {children}
            <ToastHost />
          </HubModeProvider>
        </OnboardingProvider>
      </body>
    </html>
  );
}
