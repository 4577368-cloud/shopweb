"use client";

// 订单中心筛选条（参考图风格：紧凑一行 + search + 多维下拉 + 重置）。
// 受控组件：所有筛选状态由父组件持有，本组件只渲染 + 回调。
import { useT } from "@/i18n/LocaleProvider";
import { ListChecks, RefreshCw, Search } from "@/lib/ui/icons";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type TimeRange = "all" | "7d" | "30d";
export type ExceptionFilter = "all" | "noQuote" | "stuck";

export interface CountryOption {
  code: string;
  name: string;
}

export interface OrderFilterBarProps {
  searchValue: string;
  onSearchChange: (v: string) => void;
  timeRange: TimeRange;
  onTimeRangeChange: (v: TimeRange) => void;
  exception: ExceptionFilter;
  onExceptionChange: (v: ExceptionFilter) => void;
  country: string;
  onCountryChange: (v: string) => void;
  countryOptions: CountryOption[];
  onReset: () => void;
  statusLabel?: string; // 当前 activeTab 对应的中文标签（顶部展示）
  className?: string;
}

export function OrderFilterBar({
  searchValue,
  onSearchChange,
  timeRange,
  onTimeRangeChange,
  exception,
  onExceptionChange,
  country,
  onCountryChange,
  countryOptions,
  onReset,
  statusLabel,
  className,
}: OrderFilterBarProps) {
  const t = useT();
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-hairline bg-surface px-3 py-2.5",
        className
      )}
    >
      <label className="flex min-w-[200px] flex-1 items-center gap-2">
        <Search className="h-4 w-4 shrink-0 text-ink-subtle" />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("order.filter.searchPlaceholder")}
          className="w-full bg-transparent text-sm text-ink placeholder:text-ink-subtle focus:outline-none"
        />
      </label>

      <Select
        value={timeRange}
        onChange={(e) => onTimeRangeChange(e.target.value as TimeRange)}
        aria-label={t("order.filter.timeRange")}
        className="h-8 w-auto text-xs"
      >
        <option value="all">{t("order.filter.timeAll")}</option>
        <option value="7d">{t("order.filter.time7d")}</option>
        <option value="30d">{t("order.filter.time30d")}</option>
      </Select>

      <Select
        value={exception}
        onChange={(e) => onExceptionChange(e.target.value as ExceptionFilter)}
        aria-label={t("order.filter.exception")}
        className="h-8 w-auto text-xs"
      >
        <option value="all">{t("order.filter.exAll")}</option>
        <option value="noQuote">{t("order.filter.exNoQuote")}</option>
        <option value="stuck">{t("order.filter.exStuck")}</option>
      </Select>

      <Select
        value={country}
        onChange={(e) => onCountryChange(e.target.value)}
        aria-label={t("order.filter.country")}
        className="h-8 w-auto text-xs"
      >
        <option value="all">{t("order.filter.countryAll")}</option>
        {countryOptions.map((c) => (
          <option key={c.code || "—"} value={c.code || "—"}>
            {c.name}
          </option>
        ))}
      </Select>

      <div className="flex items-center gap-1.5 rounded-md border border-hairline bg-canvas px-2 py-1 text-xs text-ink-muted">
        <ListChecks className="h-3.5 w-3.5" />
        <span>{statusLabel ?? t("order.filter.allStatuses")}</span>
      </div>

      <button
        type="button"
        onClick={onReset}
        className="inline-flex items-center gap-1 rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted hover:border-brand/40 hover:text-ink"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        {t("order.filter.reset")}
      </button>
    </div>
  );
}
