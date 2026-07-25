// 运营中心 · 轻量图表工具集（纯 SVG，无第三方依赖，浅色主题 token）。
// 用于让数据"看起来震撼"：趋势 sparkline、对比条、环形仪表、平台占比堆叠条。

import { cn } from "@/lib/utils";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string; // 面积填充色（带透明度）
  strokeWidth?: number;
  className?: string;
}

/** 迷你趋势线（带可选面积填充）。 */
export function Sparkline({
  data,
  width = 96,
  height = 28,
  stroke = "var(--brand)",
  fill,
  strokeWidth = 1.5,
  className,
}: SparklineProps) {
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const stepX = width / (data.length - 1 || 1);
  const pad = 2;
  const pts = data.map((v, i) => {
    const x = i * stepX;
    const y = pad + (height - pad * 2) * (1 - (v - min) / span);
    return [x, y] as const;
  });
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
      aria-hidden
    >
      {fill && <path d={area} fill={fill} />}
      <path d={line} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

interface TrendBarsProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

/** 竖向趋势条（增长分布）。 */
export function TrendBars({ data, width = 96, height = 28, color = "var(--brand)", className }: TrendBarsProps) {
  if (!data.length) return null;
  const max = Math.max(...data) || 1;
  const gap = 1.5;
  const bw = (width - gap * (data.length - 1)) / data.length;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn(className)} aria-hidden>
      {data.map((v, i) => {
        const h = Math.max(1, (v / max) * (height - 2));
        return (
          <rect
            key={i}
            x={i * (bw + gap)}
            y={height - h}
            width={bw}
            height={h}
            rx={1}
            fill={color}
            opacity={0.35 + (i / data.length) * 0.6}
          />
        );
      })}
    </svg>
  );
}

interface RadialGaugeProps {
  value: number; // 0..max
  max?: number;
  size?: number;
  stroke?: string;
  label?: string;
  sublabel?: string;
  className?: string;
}

/** 环形进度仪表（百分比/占比）。 */
export function RadialGauge({
  value,
  max = 100,
  size = 64,
  stroke = "var(--brand)",
  label,
  sublabel,
  className,
}: RadialGaugeProps) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-hairline, #e5e7eb)" strokeWidth={6} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-xs font-semibold tabular-nums text-ink">{label ?? `${Math.round(pct * 100)}%`}</span>
        {sublabel && <span className="text-[9px] text-ink-subtle">{sublabel}</span>}
      </div>
    </div>
  );
}

export interface StackSegment {
  label: string;
  value: number;
  color: string;
}

interface StackedBarProps {
  segments: StackSegment[];
  height?: number;
  className?: string;
}

/** 水平堆叠占比条（如各平台播放/广告分布）。 */
export function StackedBar({ segments, height = 8, className }: StackedBarProps) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className={cn("flex w-full overflow-hidden rounded-full bg-surface-muted", className)} style={{ height }}>
      {segments.map((s, i) => (
        <div
          key={i}
          style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
          title={`${s.label}: ${s.value.toLocaleString()}`}
        />
      ))}
    </div>
  );
}

interface MeterProps {
  value: number;
  max: number;
  color?: string;
  className?: string;
  height?: number;
}

/** 水平进度条。 */
export function Meter({ value, max, color = "var(--brand)", height = 6, className }: MeterProps) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-surface-muted", className)} style={{ height }}>
      <div style={{ width: `${pct}%`, background: color, height }} className="rounded-full transition-all" />
    </div>
  );
}

// 多维分析图表原语（浅色主题 token，无第三方依赖）。
const SERIES_COLORS = ["#FE2C55", "#1877F2", "#16A34A", "#F59E0B", "#8B5CF6", "#0EA5E9"];

interface RadarAxis {
  label: string;
  max?: number; // 默认 1
}
interface RadarSeries {
  label: string;
  color: string;
  values: number[]; // 与 axes 对齐，0..(axis.max ?? 1)
}
interface RadarChartProps {
  axes: RadarAxis[];
  series: RadarSeries[];
  size?: number;
  levels?: number;
  max?: number;
}

/** 多维对标雷达图（如竞品 vs 集合均值）。 */
export function RadarChart({ axes, series, size = 200, levels = 4, max = 1 }: RadarChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 26;
  const n = axes.length;
  if (n < 3) return null;
  const angleAt = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2;
  const pointAt = (i: number, v: number) => {
    const rad = (axes[i].max ?? max) || 1;
    const rr = r * Math.max(0, Math.min(1, v / rad));
    return [cx + rr * Math.cos(angleAt(i)), cy + rr * Math.sin(angleAt(i))] as const;
  };
  const ringPts = (level: number) =>
    Array.from({ length: n }, (_, i) => {
      const [x, y] = pointAt(i, (axes[i].max ?? max) * (level / levels));
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible" aria-hidden>
      {Array.from({ length: levels }, (_, l) => (
        <polygon
          key={l}
          points={ringPts(l + 1)}
          fill="none"
          stroke="var(--border-hairline, #e5e7eb)"
          strokeWidth={1}
        />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pointAt(i, axes[i].max ?? max);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border-hairline, #e5e7eb)" strokeWidth={1} />;
      })}
      {series.map((s, si) => {
        const pts = s.values.map((v, i) => pointAt(i, v)).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
        return (
          <polygon
            key={si}
            points={pts}
            fill={s.color}
            fillOpacity={0.14}
            stroke={s.color}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
        );
      })}
      {axes.map((a, i) => {
        const [x, y] = pointAt(i, (axes[i].max ?? max) * 1.18);
        return (
          <text
            key={i}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-ink-subtle"
            style={{ fontSize: 9 }}
          >
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}

interface LineSeries {
  label: string;
  color: string;
  data: number[];
  area?: boolean;
  dashed?: boolean;
}
interface LineChartProps {
  series: LineSeries[];
  width?: number;
  height?: number;
  labels?: string[];
  yFormat?: (v: number) => string;
  max?: number;
  min?: number;
  heightForArea?: boolean;
}

/** 多序列折线图（如市场动量、多店增长叠图）。 */
export function LineChart({
  series,
  width = 320,
  height = 120,
  labels,
  yFormat,
  max,
  min,
}: LineChartProps) {
  if (!series.length || series.every((s) => s.data.length === 0)) return null;
  const len = Math.max(...series.map((s) => s.data.length));
  const all = series.flatMap((s) => s.data);
  const lo = min ?? Math.min(...all);
  const hi = max ?? Math.max(...all);
  const span = hi - lo || 1;
  const padX = 6;
  const padY = 8;
  const stepX = (width - padX * 2) / (len - 1 || 1);
  const yOf = (v: number) => padY + (height - padY * 2) * (1 - (v - lo) / span);
  const xOf = (i: number) => padX + i * stepX;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height }} className="overflow-visible" aria-hidden>
      {[0, 0.5, 1].map((g) => {
        const y = padY + (height - padY * 2) * g;
        const val = hi - span * g;
        return (
          <g key={g}>
            <line x1={padX} y1={y} x2={width - padX} y2={y} stroke="var(--border-hairline, #e5e7eb)" strokeWidth={1} />
            {yFormat && (
              <text x={padX} y={y - 1} className="fill-ink-subtle" style={{ fontSize: 8 }}>
                {yFormat(val)}
              </text>
            )}
          </g>
        );
      })}
      {series.map((s, si) => {
        const pts = s.data.map((v, i) => [xOf(i), yOf(v)] as const);
        const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
        const area = `${line} L${xOf(s.data.length - 1).toFixed(1)},${height - padY} L${xOf(0).toFixed(1)},${height - padY} Z`;
        return (
          <g key={si}>
            {s.area && <path d={area} fill={s.color} fillOpacity={0.1} />}
            <path
              d={line}
              fill="none"
              stroke={s.color}
              strokeWidth={1.8}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.dashed ? "4 3" : undefined}
            />
            {pts.length > 0 && (
              <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.4} fill={s.color} />
            )}
          </g>
        );
      })}
      {labels &&
        labels.map((lb, i) => (
          <text key={i} x={xOf(i)} y={height - 1} textAnchor="middle" className="fill-ink-subtle" style={{ fontSize: 8 }}>
            {lb}
          </text>
        ))}
    </svg>
  );
}

interface HeatmapProps {
  rows: string[];
  cols: string[];
  cells: number[][]; // cells[r][c]
  format?: (v: number) => string;
  color?: string;
  emptyLabel?: string;
  onCellClick?: (r: number, c: number) => void;
}
/** 类目×地区 等二维热度矩阵。cells 缺失/0 显示为空白。 */
export function Heatmap({ rows, cols, cells, format, color = "#FE2C55", emptyLabel = "—", onCellClick }: HeatmapProps) {
  if (rows.length === 0 || cols.length === 0) return null;
  const flat = cells.flat().filter((v) => v > 0);
  const hi = flat.length ? Math.max(...flat) : 1;
  const labelW = 84;
  const headH = 16;
  const cw = 46;
  const rh = 18;
  const width = labelW + cols.length * cw;
  const height = headH + rows.length * rh;
  const hex = color.replace("#", "");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" aria-hidden>
      {cols.map((c, j) => (
        <text
          key={j}
          x={labelW + j * cw + cw / 2}
          y={headH - 4}
          textAnchor="middle"
          className="fill-ink-subtle"
          style={{ fontSize: 8 }}
        >
          {c.length > 9 ? c.slice(0, 8) + "…" : c}
        </text>
      ))}
      {rows.map((rlabel, i) => (
        <g key={i}>
          <text x={labelW - 4} y={headH + i * rh + rh / 2} textAnchor="end" dominantBaseline="middle" className="fill-ink-muted" style={{ fontSize: 8 }}>
            {rlabel.length > 13 ? rlabel.slice(0, 12) + "…" : rlabel}
          </text>
          {cols.map((_, j) => {
            const v = cells[i]?.[j] ?? 0;
            const alpha = v > 0 ? 0.12 + 0.82 * (v / hi) : 0;
            return (
              <g key={j}>
                <rect
                  x={labelW + j * cw}
                  y={headH + i * rh}
                  width={cw - 1}
                  height={rh - 1}
                  rx={2}
                  fill={v > 0 ? `#${hex}` : "var(--surface-muted)"}
                  fillOpacity={v > 0 ? alpha : 1}
                  stroke="var(--border-hairline, #e5e7eb)"
                  strokeWidth={0.5}
                  style={{ cursor: onCellClick ? "pointer" : "default" }}
                  onClick={() => onCellClick?.(i, j)}
                >
                  <title>{`${rlabel} · ${cols[j]}: ${v > 0 ? (format ? format(v) : v) : emptyLabel}`}</title>
                </rect>
                {v > 0 && (
                  <text
                    x={labelW + j * cw + (cw - 1) / 2}
                    y={headH + i * rh + (rh - 1) / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{ fontSize: 7.5, fill: alpha > 0.5 ? "#fff" : "var(--ink-muted)" }}
                  >
                    {format ? format(v) : v}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

interface ScatterPoint {
  x: number;
  y: number;
  label?: string;
  color?: string;
  r?: number;
}
interface ScatterProps {
  points: ScatterPoint[];
  width?: number;
  height?: number;
  xLabel?: string;
  yLabel?: string;
  xFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
  highlight?: { x0: number; x1: number; label?: string };
}
/** 价格×增长 等二维散点图，支持高亮"甜区"竖带。 */
export function Scatter({ points, width = 320, height = 200, xLabel, yLabel, xFormat, yFormat, highlight }: ScatterProps) {
  if (points.length === 0) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const loX = Math.min(...xs);
  const hiX = Math.max(...xs);
  const loY = Math.min(...ys);
  const hiY = Math.max(...ys);
  const sx = hiX - loX || 1;
  const sy = hiY - loY || 1;
  const padX = 30;
  const padY = 22;
  const xOf = (v: number) => padX + (width - padX - 8) * ((v - loX) / sx);
  const yOf = (v: number) => height - padY - (height - padY - 8) * ((v - loY) / sy);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" aria-hidden>
      <line x1={padX} y1={height - padY} x2={width - 8} y2={height - padY} stroke="var(--border-hairline, #e5e7eb)" strokeWidth={1} />
      <line x1={padX} y1={8} x2={padX} y2={height - padY} stroke="var(--border-hairline, #e5e7eb)" strokeWidth={1} />
      {xLabel && (
        <text x={width / 2} y={height - 4} textAnchor="middle" className="fill-ink-subtle" style={{ fontSize: 8 }}>{xLabel}</text>
      )}
      {yLabel && (
        <text x={10} y={height / 2} textAnchor="middle" transform={`rotate(-90 10 ${height / 2})`} className="fill-ink-subtle" style={{ fontSize: 8 }}>{yLabel}</text>
      )}
      {xFormat && (
        <>
          <text x={padX} y={height - padY + 9} textAnchor="middle" className="fill-ink-subtle" style={{ fontSize: 7.5 }}>{xFormat(loX)}</text>
          <text x={width - 8} y={height - padY + 9} textAnchor="middle" className="fill-ink-subtle" style={{ fontSize: 7.5 }}>{xFormat(hiX)}</text>
        </>
      )}
      {yFormat && (
        <>
          <text x={padX - 3} y={height - padY} textAnchor="end" dominantBaseline="middle" className="fill-ink-subtle" style={{ fontSize: 7.5 }}>{yFormat(loY)}</text>
          <text x={padX - 3} y={10} textAnchor="end" dominantBaseline="middle" className="fill-ink-subtle" style={{ fontSize: 7.5 }}>{yFormat(hiY)}</text>
        </>
      )}
      {highlight && (
        <rect
          x={xOf(Math.max(loX, highlight.x0))}
          y={8}
          width={Math.max(0, xOf(Math.min(hiX, highlight.x1)) - xOf(Math.max(loX, highlight.x0)))}
          height={height - padY - 8}
          fill="#16A34A"
          fillOpacity={0.08}
        >
          {highlight.label && <title>{highlight.label}</title>}
        </rect>
      )}
      {points.map((p, i) => (
        <circle key={i} cx={xOf(p.x)} cy={yOf(p.y)} r={p.r ?? 3} fill={p.color ?? "var(--brand)"} fillOpacity={0.55} stroke={p.color ?? "var(--brand)"} strokeOpacity={0.9} strokeWidth={0.6}>
          {p.label && <title>{p.label}</title>}
        </circle>
      ))}
    </svg>
  );
}

export { SERIES_COLORS };
