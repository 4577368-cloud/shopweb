// 运营中心 · 右栏板块指南（随 Tab 切换）。
// 设计意图（用户 2026-07-25）：切换 Tab 时，右栏给出「这个板块干什么 / 能拿到什么数据 /
// 重点关注哪些指标 / 为什么值得用」的教程 + 营销文案，让使用者优先关注核心数据。
// 内容全部走 i18n（ops.guide.*），文案直接引用真实接口回传字段（见 docs/OPERATIONS_DATA_UI_MAPPING.md）。

"use client";

import { useT } from "@/i18n/LocaleProvider";
import { Lightbulb, Sparkles } from "@/lib/ui/icons";

type GuideTab = "discovery" | "competition" | "creatives" | "imageSearch" | "favorites";

/** 右栏板块教程 / 营销文案面板：随 Tab 切换讲解该板块的价值与核心指标。 */
export function SectionGuide({ tab }: { tab: GuideTab }) {
  const t = useT();
  const base = `ops.guide.${tab}`;
  const focusNums = [1, 2, 3] as const;

  return (
    <section
      data-copilot-card
      className="flex flex-col rounded-[var(--radius-card)] border border-hairline bg-surface shadow-card"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-hairline px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand-accent">
            <Lightbulb className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold text-ink">{t("ops.guide.label")}</span>
        </div>
        <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-medium text-brand-strong">
          {t(`ops.tabs.${tab}`)}
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
        {/* 这个板块做什么 */}
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
            {t("ops.guide.whatTitle")}
          </p>
          <p className="text-xs leading-5 text-ink-muted">{t(`${base}.what`)}</p>
        </div>

        {/* 能拿到什么数据 */}
        <div className="rounded-[var(--radius-control)] border border-hairline/80 bg-surface-muted/50 p-2.5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
            {t("ops.guide.dataTitle")}
          </p>
          <p className="text-xs leading-5 text-ink-muted">{t(`${base}.data`)}</p>
        </div>

        {/* 重点关注指标 */}
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
            <Sparkles className="h-3 w-3 text-brand-accent" />
            {t("ops.guide.focusTitle")}
          </p>
          <ul className="space-y-1.5">
            {focusNums.map((n) => (
              <li
                key={n}
                className="flex gap-2 rounded-[var(--radius-control)] bg-brand-soft/50 px-2.5 py-1.5"
              >
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-semibold text-white">
                  {n}
                </span>
                <span className="text-xs leading-5 text-ink">{t(`${base}.focus${n}`)}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 营销价值 */}
        <div className="rounded-[var(--radius-control)] border border-brand/20 bg-brand-soft/50 p-2.5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-brand-strong">
            {t("ops.guide.whyTitle")}
          </p>
          <p className="text-xs leading-5 text-ink">{t(`${base}.why`)}</p>
        </div>

        {/* 计费说明（真实口径） */}
        <p className="text-[10px] text-ink-subtle">{t(`${base}.cost`)}</p>
      </div>
    </section>
  );
}
