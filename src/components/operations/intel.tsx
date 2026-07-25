// 运营中心 · 组合派生可视化原语（无依赖、内联 SVG）。
// 风格与现有视图一致：使用 CSS 变量色板（--brand / --success / --link …）与 hairline 边框。
// 这些组件只负责"把派生指标画出来"，不持有 i18n（文案由调用方传入）。

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CoverThumb } from "./cover-thumb";

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** 内联趋势 sparkline（把数值序列归一化为折线 + 可选面积）。 */
export function Sparkline({
  values,
  color = "var(--brand)",
  width = 120,
  height = 30,
  area = true,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
  area?: boolean;
}) {
  if (!values.length) return null;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const pts = values.map((v, i) => {
    const x = values.length > 1 ? i * stepX : width / 2;
    const y = height - ((v - min) / span) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = pts.join(" ");
  const areaPath = `M0,${height} L${pts.join(" L")} L${width},${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {area && <path d={areaPath} fill={color} opacity={0.1} />}
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 横向迷你进度条（pct 0..1）。 */
export function MiniBar({ pct, color = "var(--brand)", height = 6 }: { pct: number; color?: string; height?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-full bg-surface-muted" style={{ height }}>
      <div
        className="h-full rounded-full transition-[width]"
        style={{ width: `${Math.round(clamp01(pct) * 100)}%`, background: color }}
      />
    </div>
  );
}

/** 0..100 评分药丸（按阈值着色）。 */
export function ScorePill({
  value,
  suffix = "",
  tone,
}: {
  value: number;
  suffix?: string;
  tone?: "success" | "brand" | "warning" | "muted";
}) {
  const cls =
    tone === "success"
      ? "bg-success-soft text-success"
      : tone === "warning"
      ? "bg-warning-soft text-warning"
      : tone === "brand"
      ? "bg-brand-soft text-brand"
      : "bg-surface-muted text-ink-muted";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", cls)}>
      {value}
      {suffix}
    </span>
  );
}

/** 小标签 chip。 */
export function Tag({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "brand" | "link";
}) {
  const cls =
    tone === "brand"
      ? "bg-brand-soft text-brand"
      : tone === "link"
      ? "bg-[#EEF0FF] text-link"
      : "bg-surface-muted text-ink-muted";
  return (
    <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium", cls)}>
      {children}
    </span>
  );
}

/** 创意缩略图条（最多 max 张，超出显示 +N）。 */
export function CreativeStrip({ images, label, max = 5 }: { images: string[]; label: string; max?: number }) {
  const shows = images.slice(0, max);
  if (!shows.length) return null;
  return (
    <div className="flex gap-1">
      {shows.map((src, i) => (
        <div key={i} className="h-9 w-9 shrink-0 overflow-hidden rounded border border-hairline bg-surface-muted">
          <CoverThumb src={src} label={label} />
        </div>
      ))}
      {images.length > max && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-hairline bg-surface-muted text-[10px] text-ink-subtle">
          +{images.length - max}
        </span>
      )}
    </div>
  );
}
