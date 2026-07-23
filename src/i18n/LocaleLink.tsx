"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useLocale } from "./LocaleProvider";
import type { Locale } from "./config";

export function localePath(locale: Locale, path: string): string {
  if (!path.startsWith("/")) return path;
  return `/${locale}${path}`;
}

export function useLocalePath() {
  const locale = useLocale();
  return (path: string) => localePath(locale, path);
}

export function LocaleLink({
  href,
  ...props
}: { href: string } & Omit<ComponentProps<typeof Link>, "href">) {
  const locale = useLocale();
  const resolved = href.startsWith("/") ? `/${locale}${href}` : href;
  return <Link href={resolved} {...props} />;
}
