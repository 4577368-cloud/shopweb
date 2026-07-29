"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  startTransition,
} from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown, Globe } from "@/lib/ui/icons";
import { useLocale } from "@/i18n/LocaleProvider";
import {
  locales,
  localeCodes,
  localeLabels,
  isLocale,
  type Locale,
} from "@/i18n/config";
import { localePath } from "@/i18n/LocaleLink";
import { hrefInApp, replaceInApp } from "@/host/adapters/navigation";
import { cn } from "@/lib/utils";

function localeHrefForPath(
  next: Locale,
  pathname: string,
  search: string
): string {
  const segments = pathname.split("/").filter(Boolean);
  const rest = isLocale(segments[0]) ? segments.slice(1) : segments;
  const pathOnly = `/${rest.join("/")}`;
  return hrefInApp(`${localePath(next, pathOnly)}${search}`);
}

export type LanguageMenuPlacement = "up" | "down";

type MenuCoords = {
  top?: number;
  bottom?: number;
  right: number;
  minWidth: number;
};

/**
 * Compact locale control.
 * - `menuPlacement="up"`: sidebar footer (opens above the trigger)
 * - `menuPlacement="down"`: page headers (opens below; avoids clipping off the top)
 *
 * Menu is portaled to `document.body` so embedded `overflow-hidden` chrome
 * cannot clip it. Locale changes use `replaceInApp` (keeps Admin host query)
 * without an extra `router.refresh()`.
 */
export function LanguageSwitcher({
  className,
  menuPlacement = "up",
}: {
  className?: string;
  menuPlacement?: LanguageMenuPlacement;
}) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<MenuCoords | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const update = () => {
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setCoords({
        ...(menuPlacement === "down"
          ? { top: r.bottom + 4 }
          : { bottom: window.innerHeight - r.top + 4 }),
        right: Math.max(8, window.innerWidth - r.right),
        minWidth: Math.max(r.width, 120),
      });
    };
    update();
    window.addEventListener("resize", update);
    // Capture scroll from nested overflow containers (workbench / Admin iframe).
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, menuPlacement]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
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

  // Warm sibling locale RSC payloads while the menu is open.
  useEffect(() => {
    if (!open) return;
    const search =
      typeof window !== "undefined" ? window.location.search : "";
    for (const l of locales) {
      if (l === locale) continue;
      try {
        router.prefetch(localeHrefForPath(l, pathname, search));
      } catch {
        /* prefetch is best-effort */
      }
    }
  }, [open, locale, pathname, router]);

  function switchTo(next: Locale) {
    if (next === locale) {
      setOpen(false);
      return;
    }
    setOpen(false);
    const search =
      typeof window !== "undefined" ? window.location.search : "";
    const newPath = localeHrefForPath(next, pathname, search);
    document.cookie = `locale=${next}; path=/; max-age=${60 * 60 * 24 * 365}`;
    startTransition(() => {
      // Soft replace preserves embedded host/shop via sticky query merge.
      // Skip router.refresh() — locale segment change already remounts messages.
      replaceInApp(newPath, router);
    });
  }

  const menu =
    open && coords && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={localeLabels[locale]}
            style={{
              position: "fixed",
              top: coords.top,
              bottom: coords.bottom,
              right: coords.right,
              minWidth: coords.minWidth,
              zIndex: 80,
            }}
            className="overflow-hidden rounded-[var(--radius-control)] border border-hairline bg-surface py-1 shadow-card"
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
                  <span className="min-w-0 flex-1 truncate">
                    {localeLabels[l]}
                  </span>
                  {active ? (
                    <Check className="h-3.5 w-3.5 shrink-0" />
                  ) : null}
                </button>
              );
            })}
          </div>,
          document.body
        )
      : null;

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
      {menu}
    </div>
  );
}
