import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";

/**
 * Nested layout for the [locale] dynamic segment. The real <html>/<body> and
 * global providers now live in the root layout (src/app/layout.tsx), which
 * stays mounted across language switches. This layer only validates the
 * segment and renders children — it intentionally holds no global state, so a
 * language switch (which changes the [locale] segment) remounts this layout
 * and the page but NOT the root providers.
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <>{children}</>;
}
