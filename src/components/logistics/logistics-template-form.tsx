"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MarketMultiSelect,
  codesFromSelections,
  selectionsFromCodes,
} from "@/components/logistics/market-multi-select";
import type {
  LogisticsSpeedPreference,
  LogisticsTemplate,
  PackagingType,
} from "@/lib/types";

const PACKAGING: { value: PackagingType; label: string; hint: string }[] = [
  { value: "MINIMAL", label: "极简包装", hint: "轻量袋装 / 原厂简装，适合普货小件" },
  { value: "CARTON", label: "纸箱包装", hint: "加固纸箱，适合易损或多件" },
];

const SPEEDS: {
  value: LogisticsSpeedPreference;
  label: string;
  hint: string;
}[] = [
  { value: "ECONOMY", label: "经济型", hint: "优先成本，时效可接受更长" },
  { value: "FAST", label: "快速型", hint: "优先时效，成本可接受更高" },
  { value: "BALANCED", label: "综合型", hint: "在成本与时效之间平衡" },
];

export function LogisticsTemplateForm({
  value,
  saving,
  error,
  onChange,
  onSave,
}: {
  value: LogisticsTemplate;
  saving: boolean;
  error?: string | null;
  onChange: (next: LogisticsTemplate) => void;
  onSave: () => void;
}) {
  const countryCodes = codesFromSelections(value.markets ?? []);

  return (
    <section className="rounded-[var(--radius-card)] border border-hairline bg-surface p-4 shadow-card">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-ink">物流策略模板</h2>
        <p className="mt-0.5 text-xs text-ink-subtle">
          店铺级一套策略 · 保存后将用于后续线路与价格推荐（Phase 2）
          {value.defaultTemplate ? " · 当前为系统默认，尚未保存" : ""}
        </p>
      </div>

      <div className="space-y-5">
        <FieldBlock title="包装方式">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PACKAGING.map((o) => (
              <ChoiceCard
                key={o.value}
                active={value.packaging === o.value}
                title={o.label}
                hint={o.hint}
                onClick={() => onChange({ ...value, packaging: o.value })}
              />
            ))}
          </div>
        </FieldBlock>

        <FieldBlock title="销售国家 / 市场">
          <MarketMultiSelect
            value={countryCodes}
            onChange={(codes) =>
              onChange({ ...value, markets: selectionsFromCodes(codes) })
            }
          />
        </FieldBlock>

        <FieldBlock title="时效偏好">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {SPEEDS.map((o) => (
              <ChoiceCard
                key={o.value}
                active={value.speedPreference === o.value}
                title={o.label}
                hint={o.hint}
                onClick={() =>
                  onChange({ ...value, speedPreference: o.value })
                }
              />
            ))}
          </div>
        </FieldBlock>
      </div>

      {error ? (
        <p className="mt-3 text-xs text-amber-700">{error}</p>
      ) : null}

      <div className="mt-5 flex justify-end">
        <Button onClick={onSave} disabled={saving || countryCodes.length === 0}>
          {saving ? "保存中…" : "保存物流模板"}
        </Button>
      </div>
    </section>
  );
}

function FieldBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold text-ink">{title}</h3>
      {children}
    </div>
  );
}

function ChoiceCard({
  active,
  title,
  hint,
  onClick,
}: {
  active: boolean;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[var(--radius-control)] border px-3 py-2.5 text-left transition-colors",
        active
          ? "border-brand bg-brand-soft"
          : "border-hairline bg-surface hover:border-hairline-strong"
      )}
    >
      <p
        className={cn(
          "text-xs font-semibold",
          active ? "text-brand-strong" : "text-ink"
        )}
      >
        {title}
      </p>
      <p className="mt-0.5 text-[11px] leading-4 text-ink-subtle">{hint}</p>
    </button>
  );
}
