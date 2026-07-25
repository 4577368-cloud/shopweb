// 运营中心 · 广告商品"情报体"（AdCard 组合派生后的可复用展示块）。
// 不渲染卡片外壳（封面/标题/价格由调用方负责），只渲染：
//   平台渠道 chips + 创意缩略图条 + 店铺规模/渠道广度/成熟度 指标 + 拆解价值高亮。
// 被 discovery-view 的 SearchTable 与 creatives-view 的网格共用，保证两处一致。

"use client";

import type { ReactNode } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { adSignals } from "@/lib/marketing/derived";
import { fmtCompact } from "@/lib/marketing/format";
import type { AdCard } from "@/lib/marketing/types";
import { PlatformBadge } from "./platform-badge";
import { CreativeStrip } from "./intel";

const LEARN_KEYS = [
  "ops.intel.ads.learn0",
  "ops.intel.ads.learn1",
  "ops.intel.ads.learn2",
  "ops.intel.ads.learn3",
] as const;

export function AdIntelCard({ card, children }: { card: AdCard; children?: ReactNode }) {
  const t = useT();
  const s = adSignals(card);

  return (
    <div className="space-y-2">
      {/* 平台渠道 chips */}
      <div className="flex flex-wrap gap-1">
        {card.adPlatform.map((p) => (
          <PlatformBadge key={p} platform={p} />
        ))}
      </div>

      {/* 创意缩略图条 */}
      <div>
        <span className="text-[10px] text-ink-subtle">
          {t("ops.intel.ads.creativity")} · {s.creativeCount}
        </span>
        <div className="mt-1">
          <CreativeStrip images={card.images} label={card.title} />
        </div>
      </div>

      {/* 组合指标：店铺规模 / 渠道广度 / 成熟度 */}
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <span className="block text-[10px] text-ink-subtle">{t("ops.intel.ads.storeScale")}</span>
          <span className="font-semibold tabular-nums text-ink">{fmtCompact(s.storeScale)}</span>
        </div>
        <div>
          <span className="block text-[10px] text-ink-subtle">{t("ops.intel.ads.breadth")}</span>
          <span className="font-semibold tabular-nums text-ink">{s.platformBreadth}</span>
        </div>
        <div>
          <span className="block text-[10px] text-ink-subtle">{t("ops.intel.ads.maturity")}</span>
          <span className="font-semibold tabular-nums text-ink">{s.maturityDays}d</span>
        </div>
      </div>

      {/* 拆解价值高亮（渠道广度 × 创意数 × 店铺规模 的组合判定） */}
      <div className="rounded-[var(--radius-control)] bg-brand-soft px-2 py-1 text-[11px] font-medium text-brand">
        {t(LEARN_KEYS[s.learnValue])}
      </div>

      {children}
    </div>
  );
}
