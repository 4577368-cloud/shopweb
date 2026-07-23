"use client";

import { usePathname, useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { useLocale } from "@/i18n/LocaleProvider";
import { locales, localeLabels, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  function switchTo(next: Locale) {
    const segments = pathname.split("/");
    // segments[0] === "" ; segments[1] === current locale (always present via middleware)
    const rest = segments.slice(2).join("/");
    const newPath = `/${next}${rest ? `/${rest}` : ""}`;
    document.cookie = `locale=${next}; path=/; max-age=${60 * 60 * 24 * 365}`;
    router.push(newPath);
  }

  return (
    <label className={cn("relative inline-flex items-center", className)}>
      <Languages className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-ink-muted" />
      <span className="sr-only">Language</span>
      <select
        value={locale}
        onChange={(e) => switchTo(e.target.value as Locale)}
        className="appearance-none rounded-[var(--radius-control)] border border-hairline bg-surface py-1 pl-7 pr-6 text-[12px] font-medium text-ink shadow-sm transition-colors hover:border-brand/40 focus:outline-none focus:ring-2 focus:ring-brand/30"
        aria-label="Language"
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {localeLabels[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
