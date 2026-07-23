import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "success" | "warning" | "teal";
  className?: string;
}

const toneMap = {
  default: "border-hairline",
  success: "border-emerald-200",
  warning: "border-amber-200",
  teal: "border-brand-accent/25",
};

const valueToneMap = {
  default: "text-slate-900",
  success: "text-emerald-700",
  warning: "text-amber-700",
  teal: "text-brand-accent",
};

export function MetricCard({
  label,
  value,
  hint,
  tone = "default",
  className,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        toneMap[tone],
        className
      )}
    >
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tracking-tight", valueToneMap[tone])}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-slate-400">{hint}</p> : null}
    </div>
  );
}
