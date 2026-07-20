"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  LogisticsAnalysis,
  LogisticsTypeCode,
  ProductLogisticsProfile,
} from "@/lib/types";

const TYPE_OPTIONS: { value: LogisticsTypeCode; label: string }[] = [
  { value: "GENERAL", label: "普货" },
  { value: "APPAREL", label: "服装" },
  { value: "FOOD", label: "食品" },
  { value: "BATTERY_MAGNETIC", label: "带电 / 带磁" },
  { value: "BLADE", label: "刀具" },
  { value: "OTHER", label: "其他特殊品类" },
];

export function LogisticsTypeSummary({
  analysis,
  correctingId,
  onCorrect,
}: {
  analysis: LogisticsAnalysis;
  correctingId?: string | null;
  onCorrect: (itemId: string, type: LogisticsTypeCode) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const highRisk = useMemo(
    () => new Set(analysis.highRiskTypes ?? []),
    [analysis.highRiskTypes]
  );
  const samples = expanded ? analysis.profiles : analysis.profiles.slice(0, 6);

  return (
    <section className="rounded-[var(--radius-card)] border border-hairline bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">已识别物流类型</h2>
          <p className="mt-0.5 text-xs text-ink-subtle">
            基于商品标题的规则 / 关键词归类 · 可修正 · 将作为后续线路匹配输入
          </p>
        </div>
        <Badge variant="outline">{analysis.analyzedCount} 个商品</Badge>
      </div>

      {analysis.distribution.length === 0 ? (
        <p className="mt-3 text-xs text-ink-subtle">
          暂无已关联商品可分析。请先完成选品关联或 SKU 对齐。
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {analysis.distribution.map((d) => (
            <span
              key={d.type}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
                highRisk.has(d.type)
                  ? "bg-amber-50 text-amber-800"
                  : "bg-brand-soft text-brand-strong"
              )}
            >
              {d.label}
              <span className="tabular-nums opacity-80">{d.count}</span>
            </span>
          ))}
        </div>
      )}

      {analysis.skippedUnboundCount > 0 ? (
        <p className="mt-2 text-[11px] text-ink-subtle">
          另有 {analysis.skippedUnboundCount} 个店铺商品尚未关联货源，已跳过分析。
        </p>
      ) : null}

      {samples.length > 0 ? (
        <div className="mt-4 space-y-2">
          {samples.map((p) => (
            <ProfileRow
              key={p.thirdPlatformItemId}
              profile={p}
              busy={correctingId === p.thirdPlatformItemId}
              onCorrect={onCorrect}
            />
          ))}
          {analysis.profiles.length > 6 ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-[11px] font-medium text-brand-strong hover:underline"
            >
              {expanded
                ? "收起"
                : `展开全部 ${analysis.profiles.length} 个商品`}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ProfileRow({
  profile,
  busy,
  onCorrect,
}: {
  profile: ProductLogisticsProfile;
  busy: boolean;
  onCorrect: (itemId: string, type: LogisticsTypeCode) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-hairline bg-surface-muted/40 px-3 py-2 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-ink">
          {profile.title || profile.thirdPlatformItemId}
        </p>
        <p className="mt-0.5 truncate text-[10px] text-ink-subtle">
          {(profile.signals ?? []).slice(0, 2).join(" · ") ||
            (profile.reviewed ? "用户已修正" : "规则识别")}
        </p>
      </div>
      <Select
        value={profile.logisticsType}
        disabled={busy}
        onChange={(e) =>
          onCorrect(
            profile.thirdPlatformItemId,
            e.target.value as LogisticsTypeCode
          )
        }
        className="h-8 w-full shrink-0 text-xs sm:w-40"
      >
        {TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
