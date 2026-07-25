// 用量明细抽屉（设计 §5.3 / 原型）：最近分录列表 + 汇总。
"use client";

import { useT } from "@/i18n/LocaleProvider";
import type { UsageEntry } from "@/lib/marketing/types";
import { Drawer } from "./drawer";

interface UsageDrawerProps {
  open: boolean;
  entries: UsageEntry[];
  sessionUsed: number;
  onClose: () => void;
}

export function UsageDrawer({ open, entries, sessionUsed, onClose }: UsageDrawerProps) {
  const t = useT();
  // 缓存命中省下的调用次数（每次命中相当于避免一次消耗）。
  const savedCalls = entries.filter((e) => e.cacheHit).length;
  return (
    <Drawer open={open} onClose={onClose} title={t("ops.usageDrawer.title")} widthClass="max-w-xl">
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-[var(--radius-card)] border border-hairline bg-surface-muted/40 px-3 py-2">
          <p className="text-[10px] text-ink-subtle">{t("ops.usageDrawer.totalUsed")}</p>
          <p className="text-sm font-semibold text-ink">{sessionUsed} {t("ops.usage.points")}</p>
        </div>
        <div className="rounded-[var(--radius-card)] border border-hairline bg-surface-muted/40 px-3 py-2">
          <p className="text-[10px] text-ink-subtle">{t("ops.usageDrawer.totalSaved")}</p>
          <p className="text-sm font-semibold text-success">{savedCalls} {t("ops.usage.points")}</p>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="py-12 text-center text-sm text-ink-subtle">{t("ops.usageDrawer.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-hairline text-left text-ink-subtle">
                <th className="px-2 py-1.5 font-medium">{t("ops.usageDrawer.colTime")}</th>
                <th className="px-2 py-1.5 font-medium">{t("ops.usageDrawer.colEndpoint")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("ops.usageDrawer.colConsumed")}</th>
                <th className="px-2 py-1.5 font-medium">{t("ops.usageDrawer.colCache")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("ops.usageDrawer.colRemaining")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-hairline/70">
                  <td className="px-2 py-1.5 text-ink-muted">{e.time}</td>
                  <td className="px-2 py-1.5 text-ink">{e.endpoint}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-ink">{e.consumed}</td>
                  <td className="px-2 py-1.5">
                    {e.cacheHit ? (
                      <span className="rounded-full bg-success-soft px-1.5 text-[10px] text-success">{t("ops.usageDrawer.cacheHit")}</span>
                    ) : (
                      <span className="text-ink-subtle">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-info">{e.remainingAfter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Drawer>
  );
}
