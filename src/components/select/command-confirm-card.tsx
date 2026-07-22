"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { ProductCommandPlan } from "@/lib/agents/products/command-schema";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ConfirmCardTheme = "amber" | "sky" | "emerald" | "violet";

export interface ConfirmPreviewDiffRow {
  label: string;
  before: string;
  after: string;
}

export interface ConfirmPreviewSection {
  title?: string;
  rows: ConfirmPreviewDiffRow[];
}

export interface ConfirmPreviewImpact {
  scope: string;
  durationHint?: string;
  reversible: boolean;
  riskNote?: string;
}

export interface ConfirmPreviewResult {
  sections: ConfirmPreviewSection[];
  extraNote?: string;
  payload: Record<string, unknown>;
  impact?: ConfirmPreviewImpact;
}

const THEME_STYLES: Record<ConfirmCardTheme, {
  card: string;
  header: string;
  title: string;
  subtext: string;
  before: string;
  after: string;
  afterBg: string;
}> = {
  amber: {
    card: "border-amber-200 bg-amber-50/80",
    header: "text-amber-800/80",
    title: "text-amber-950",
    subtext: "text-amber-800/70",
    before: "text-slate-600 line-through decoration-slate-300",
    after: "text-amber-950",
    afterBg: "border-amber-300/60 bg-amber-100/60",
  },
  sky: {
    card: "border-sky-300 bg-sky-50/80",
    header: "text-sky-700/80",
    title: "text-sky-950",
    subtext: "text-sky-800/70",
    before: "text-slate-600 line-through decoration-slate-300",
    after: "text-sky-950",
    afterBg: "border-sky-400/60 bg-sky-100/80 ring-1 ring-sky-300/50",
  },
  emerald: {
    card: "border-emerald-300 bg-emerald-50/80",
    header: "text-emerald-700/80",
    title: "text-emerald-950",
    subtext: "text-emerald-800/70",
    before: "text-slate-600 line-through decoration-slate-300",
    after: "text-emerald-950",
    afterBg: "border-emerald-400/60 bg-emerald-100/80 ring-1 ring-emerald-300/50",
  },
  violet: {
    card: "border-violet-300 bg-violet-50/80",
    header: "text-violet-700/80",
    title: "text-violet-950",
    subtext: "text-violet-800/70",
    before: "text-slate-600 line-through decoration-slate-300",
    after: "text-violet-950",
    afterBg: "border-violet-400/60 bg-violet-100/80 ring-1 ring-violet-300/50",
  },
};

export function CommandConfirmCard({
  plan,
  shopName,
  theme = "amber",
  headerLabel = "命令确认",
  confirmLabel = "确认执行",
  executingLabel = "执行中…",
  executing,
  preview,
  error,
  loading,
  onConfirm,
  onCancel,
}: {
  plan: ProductCommandPlan;
  shopName: string;
  theme?: ConfirmCardTheme;
  headerLabel?: string;
  confirmLabel?: string;
  executingLabel?: string;
  executing?: boolean;
  preview: ConfirmPreviewResult | null;
  error: string | null;
  loading: boolean;
  onConfirm: (payload: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const t = THEME_STYLES[theme];

  return (
    <div className={cn("rounded-md border px-2.5 py-2", t.card)}>
      <p className={cn("text-[10px] font-medium uppercase tracking-wide", t.header)}>
        {headerLabel}
      </p>
      <h3 className={cn("mt-0.5 text-xs font-semibold", t.title)}>
        {plan.operation}
      </h3>
      <p className={cn("mt-0.5 text-[10px]", t.subtext)}>
        目标：{plan.targetLabel}
      </p>

      {loading ? (
        <p className={cn("mt-2 flex items-center gap-1.5 text-[11px]", t.title)}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          正在生成预览…
        </p>
      ) : error ? (
        <p className="mt-2 text-[11px] text-red-700">{error}</p>
      ) : preview ? (
        <div className="mt-2 space-y-2">
          {preview.sections.map((section, si) => (
            <div key={si} className="space-y-1.5">
              {section.title ? (
                <p className={cn("text-[10px] font-medium", t.subtext)}>
                  {section.title}
                </p>
              ) : null}
              {section.rows.map((row, ri) => (
                <div key={ri} className="space-y-1">
                  <div className="rounded border border-slate-200/80 bg-white/70 px-2 py-1.5">
                    <p className={cn("text-[10px] font-medium", t.subtext)}>
                      {row.label} · 原
                    </p>
                    <p className={cn("mt-0.5 text-[11px] leading-relaxed", t.before)}>
                      {row.before || "（空）"}
                    </p>
                  </div>
                  <div className={cn("rounded px-2 py-1.5", t.afterBg)}>
                    <p className={cn("text-[10px] font-medium", t.header)}>
                      {row.label} · 改后
                    </p>
                    <p className={cn("mt-0.5 text-[11px] font-medium leading-relaxed", t.after)}>
                      {row.after}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ))}
          {preview.extraNote ? (
            <p className={cn("text-[10px]", t.subtext)}>{preview.extraNote}</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Button
          size="sm"
          className="h-7 px-2 text-[11px]"
          disabled={executing || loading || !preview}
          onClick={() => preview && onConfirm(preview.payload)}
        >
          {executing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {executing ? executingLabel : confirmLabel}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 px-2 text-[11px]"
          disabled={executing}
          onClick={onCancel}
        >
          取消
        </Button>
      </div>
    </div>
  );
}
