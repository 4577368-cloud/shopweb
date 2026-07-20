"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  MARKET_GROUPS,
  countryLabel,
  findGroupForCountry,
} from "@/lib/logistics/markets";
import type { MarketSelection } from "@/lib/types";

/** Collapse selected country codes into MarketSelection[] grouped by marketGroupId. */
export function selectionsFromCodes(codes: string[]): MarketSelection[] {
  const map = new Map<string, string[]>();
  for (const code of codes) {
    const g = findGroupForCountry(code);
    if (!g) continue;
    const list = map.get(g.id) ?? [];
    if (!list.includes(code)) list.push(code);
    map.set(g.id, list);
  }
  return Array.from(map.entries()).map(([marketGroupId, countryCodes]) => ({
    marketGroupId,
    countryCodes,
  }));
}

export function codesFromSelections(markets: MarketSelection[]): string[] {
  const out: string[] = [];
  for (const m of markets ?? []) {
    for (const c of m.countryCodes ?? []) {
      if (c && !out.includes(c)) out.push(c);
    }
  }
  return out;
}

export function MarketMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (codes: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(value), [value]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MARKET_GROUPS;
    return MARKET_GROUPS.map((g) => ({
      ...g,
      countries: g.countries.filter(
        (c) =>
          c.code.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.nameZh.includes(query.trim()) ||
          g.labelZh.includes(query.trim()) ||
          g.label.toLowerCase().includes(q)
      ),
    })).filter((g) => g.countries.length > 0);
  }, [query]);

  const toggle = (code: string) => {
    if (selected.has(code)) {
      onChange(value.filter((c) => c !== code));
    } else {
      onChange([...value, code]);
    }
  };

  const toggleGroup = (groupId: string) => {
    const group = MARKET_GROUPS.find((g) => g.id === groupId);
    if (!group) return;
    const codes = group.countries.map((c) => c.code);
    const allOn = codes.every((c) => selected.has(c));
    if (allOn) {
      onChange(value.filter((c) => !codes.includes(c)));
    } else {
      const next = new Set(value);
      for (const c of codes) next.add(c);
      onChange(Array.from(next));
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索国家 / 市场…"
          className="pl-8"
        />
      </div>

      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => toggle(code)}
              className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-strong"
            >
              {countryLabel(code)}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-ink-subtle">请至少选择一个销售国家</p>
      )}

      <div className="max-h-64 space-y-3 overflow-y-auto rounded-[var(--radius-control)] border border-hairline bg-surface-muted/30 p-2.5">
        {filteredGroups.map((g) => {
          const codes = g.countries.map((c) => c.code);
          const allOn = codes.length > 0 && codes.every((c) => selected.has(c));
          const someOn = codes.some((c) => selected.has(c));
          return (
            <div key={g.id}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => toggleGroup(g.id)}
                  className="text-xs font-semibold text-ink hover:text-brand-strong"
                >
                  {g.labelZh}
                  <span className="ml-1.5 font-normal text-ink-subtle">
                    {g.label}
                  </span>
                </button>
                <span className="text-[10px] text-ink-subtle">
                  {allOn ? "全选" : someOn ? "部分" : "未选"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {g.countries.map((c) => {
                  const on = selected.has(c.code);
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => toggle(c.code)}
                      className={cn(
                        "rounded-[var(--radius-control)] border px-2 py-1 text-[11px] transition-colors",
                        on
                          ? "border-brand bg-brand-soft font-medium text-brand-strong"
                          : "border-hairline bg-surface text-ink-muted hover:border-hairline-strong"
                      )}
                    >
                      {c.nameZh}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {filteredGroups.length === 0 ? (
          <p className="py-4 text-center text-xs text-ink-subtle">无匹配市场</p>
        ) : null}
      </div>
    </div>
  );
}
