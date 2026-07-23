import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { notFound } from "next/navigation";
import { Providers } from "@/components/providers";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { messages } from "@/i18n/messages";
import { isLocale, localeHtmlLang, type Locale } from "@/i18n/config";
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

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const typed = locale as Locale;

  return (
    <html lang={localeHtmlLang[typed]} className={`${displayFont.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-100 font-sans text-slate-900">
        <Providers>
          <LocaleProvider locale={typed} messages={messages[typed]}>
            {children}
          </LocaleProvider>
        </Providers>
      </body>
    </html>
  );
}
