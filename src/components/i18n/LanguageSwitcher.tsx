"use client";

import { useEffect, useRef, useState, startTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown, Globe } from "@/lib/ui/icons";
import { useLocale } from "@/i18n/LocaleProvider";
import { locales, localeCodes, localeLabels, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/**
 * Compact locale control for the sidebar footer.
 * Uses a custom menu (not a native &lt;select&gt;) so locale navigation does not
 * race the browser's select popup — that race commonly throws
 * NotFoundError: removeChild during Next.js client transitions.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function switchTo(next: Locale) {
    if (next === locale) {
      setOpen(false);
      return;
    }
    setOpen(false);
    const segments = pathname.split("/");
    const rest = segments.slice(2).join("/");
    const newPath = `/${next}${rest ? `/${rest}` : ""}`;
    document.cookie = `locale=${next}; path=/; max-age=${60 * 60 * 24 * 365}`;
    // Warm the target locale route so the navigation doesn't stall on a cold RSC request.
    router.prefetch(newPath);
    // Defer navigation one tick so the menu unmounts cleanly first; wrap in a
    // transition so the layout re-render (await params) doesn't block the UI.
    window.setTimeout(() => {
      startTransition(() => {
        router.push(newPath);
      });
    }, 0);
  }

  return (
    <div ref={rootRef} className={cn("relative shrink-0", className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={localeLabels[locale]}
        title={localeLabels[locale]}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-[var(--radius-control)] border border-hairline bg-surface px-2 text-ink shadow-sm transition-colors hover:border-brand/40"
      >
        <Globe className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden />
        <span className="text-[11px] font-semibold uppercase tracking-wide">
          {localeCodes[locale]}
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-ink-muted transition-transform",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label={localeLabels[locale]}
          className="absolute bottom-full right-0 z-40 mb-1 min-w-[7.5rem] overflow-hidden rounded-[var(--radius-control)] border border-hairline bg-surface py-1 shadow-card"
        >
          {locales.map((l) => {
            const active = l === locale;
            return (
              <button
                key={l}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => switchTo(l)}
                className={cn(
                  "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] transition-colors",
                  active
                    ? "bg-brand-soft text-brand-accent"
                    : "text-ink hover:bg-surface-muted/80"
                )}
              >
                <span className="w-6 font-semibold uppercase tracking-wide">
                  {localeCodes[l]}
                </span>
                <span className="min-w-0 flex-1 truncate">{localeLabels[l]}</span>
                {active ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
