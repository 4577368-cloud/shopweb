"use client";

import type { SavedCatalogSearch } from "@/lib/catalog-sourcing-types";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/LocaleProvider";

export interface SavedSearchChipsProps {
  searches: SavedCatalogSearch[];
  activeId?: string | null;
  onSelect: (search: SavedCatalogSearch) => void;
  onRemove: (id: string) => void;
  className?: string;
}

export function SavedSearchChips({
  searches,
  activeId,
  onSelect,
  onRemove,
  className,
}: SavedSearchChipsProps) {
  const t = useT();
  if (!searches.length) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="text-[11px] text-ink-subtle">{t("sourcing.savedLabel")}</span>
      {searches.map((s) => {
        const active = s.id === activeId;
        return (
          <span
            key={s.id}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
              active
                ? "border-brand bg-brand-soft text-brand-strong"
                : "border-hairline bg-surface-muted text-ink-muted"
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(s)}
              className="font-medium hover:underline"
            >
              {s.name}
            </button>
            <button
              type="button"
              onClick={() => onRemove(s.id)}
              className="ml-0.5 text-ink-subtle hover:text-red-600"
              aria-label={t("sourcing.removeSearchAria", { name: s.name })}
            >
              ×
            </button>
          </span>
        );
      })}
    </div>
  );
}
