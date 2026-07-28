import { notFound } from "next/navigation";
import { SyncHtmlLang } from "@/components/i18n/sync-html-lang";
import { EmbeddedAdminChrome } from "@/host/embedded/embedded-admin-chrome";
import { isLocale } from "@/i18n/config";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { messages } from "@/i18n/messages";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw;

  return (
    <LocaleProvider locale={locale} messages={messages[locale]}>
      <SyncHtmlLang />
      {/* NavMenu labels need LocaleProvider; keep App Bridge chrome here. */}
      <EmbeddedAdminChrome />
      {children}
    </LocaleProvider>
  );
}
