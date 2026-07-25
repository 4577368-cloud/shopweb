// 上下文条（设计 §2 / 原型）：本次预估 / 上次实际 / 缓存命中 / 当前剩余 四点。
import { useT } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

interface ContextBarProps {
  estimate: number | null;
  lastActual: number | null;
  cacheHit: boolean | null;
  remaining: number;
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "warning" | "neutral" | "success" | "info";
}) {
  const toneCls = {
    warning: "bg-warning-soft text-warning",
    neutral: "bg-muted text-ink-muted",
    success: "bg-success-soft text-success",
    info: "bg-info-soft text-info",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
        toneCls
      )}
    >
      <span className="text-ink-subtle">{label}</span>
      <span>{value}</span>
    </span>
  );
}

export function ContextBar({ estimate, lastActual, cacheHit, remaining }: ContextBarProps) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Stat
        label={t("ops.contextBar.estimate")}
        value={estimate == null ? "—" : `~${estimate} ${t("ops.usage.points")}`}
        tone="warning"
      />
      <Stat
        label={t("ops.contextBar.lastActual")}
        value={lastActual == null ? "—" : `${lastActual} ${t("ops.usage.points")}`}
        tone="neutral"
      />
      <Stat
        label={t("ops.contextBar.cache")}
        value={cacheHit == null ? "—" : cacheHit ? t("ops.contextBar.cacheHit") : t("ops.contextBar.miss")}
        tone={cacheHit ? "success" : "neutral"}
      />
      <Stat
        label={t("ops.contextBar.accountRemaining")}
        value={`${remaining} ${t("ops.usage.points")}`}
        tone="info"
      />
    </div>
  );
}
