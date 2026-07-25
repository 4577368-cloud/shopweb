// 运营中心 · 通用格式化工具集
// 集中管理数字/金额/百分比的显示格式，避免各视图重复定义。

/** 整数千分位格式化。 */
export function fmtInt(n: number): string {
  return n.toLocaleString();
}

/** 美元金额格式化，最多两位小数。 */
export function fmtUsd(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/** 紧凑数字：K / M。 */
export function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** 百分比格式化（0..1 → 0..100%）。 */
export function fmtPercent(n: number, fractionDigits = 0): string {
  return `${(n * 100).toFixed(fractionDigits)}%`;
}

/**
 * 增长率格式化（输入单位为"百分数"，0..999.9，例如 999.9 表示 999.9%）。
 * - 绝对值 < 300% → "+15%" / "−80%"（常规百分号）
 * - 绝对值 ≥ 300% → "+9.99倍" / "−9.99倍"（倍率，i18n `growthFactor` 决定后缀：zh 倍 / en x / fr × / es ×）
 * 节省宽度：99990% → 9.99倍；保留低值的精确度。
 */
export function fmtGrowthRate(ratePct: number, unit: string): string {
  const sign = ratePct >= 0 ? "+" : "−";
  const abs = Math.abs(ratePct);
  if (abs < 300) return `${sign}${abs.toFixed(0)}%`;
  return `${sign}${(abs / 100).toFixed(1)}${unit}`;
}
