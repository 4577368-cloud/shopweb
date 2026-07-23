import { cn } from "@/lib/utils";

/** Optional selectable card surfaces — spec §2.4.4 */
export function selectableCardClassName({
  selected = false,
  interactive = true,
  className,
}: {
  selected?: boolean;
  /** Set false for display-only cards that should not show hover shadow */
  interactive?: boolean;
  className?: string;
} = {}) {
  return cn(
    "rounded-[var(--radius-card)] border border-surface-border bg-surface shadow-card transition-shadow",
    interactive && !selected && "hover:shadow-selectable-hover",
    selected && "border-brand shadow-none",
    className
  );
}
