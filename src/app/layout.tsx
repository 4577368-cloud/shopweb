import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { cookies } from "next/headers";
import { OnboardingProvider } from "@/context/onboarding-context";
import { ToastHost } from "@/components/layout/toast-host";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { messages } from "@/i18n/messages";
import {
  isLocale,
  localeHtmlLang,
  defaultLocale,
  type Locale,
} from "@/i18n/config";
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
 * True root layout. Owns <html>/<body> plus the two global providers so they
 * live OUTSIDE the [locale] dynamic segment. Switching language changes the
 * [locale] segment (which remounts [locale]/layout + the page), but this root
 * stays mounted — so OnboardingProvider's global state (auth restore result,
 * shop, workflow data) survives a language switch instead of being wiped and
 * re-fetched. Locale's source of truth is the `locale` cookie (read here for
 * the first SSR paint); the [locale] URL segment is only used for routing.
 */
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const rawLocale = cookieStore.get("locale")?.value ?? "";
  const initialLocale: Locale = isLocale(rawLocale)
    ? (rawLocale as Locale)
    : defaultLocale;

  return (
    <html
      lang={localeHtmlLang[initialLocale]}
      translate="no"
      className={`${displayFont.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-app-shell font-sans text-foreground" translate="no">
        <LocaleProvider locale={initialLocale} messages={messages[initialLocale]}>
          <OnboardingProvider>
            {children}
            <ToastHost />
          </OnboardingProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
