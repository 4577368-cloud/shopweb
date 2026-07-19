import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StickyActionBarProps {
  /** Left side — usually a short status/summary line. */
  info?: ReactNode;
  /** Right side — primary/secondary actions. */
  children: ReactNode;
  className?: string;
}

/**
 * Bottom action bar (prototype: /sku-align "确认并进入物流确认", /products "批量处理所选商品"). Designed to
 * sit in {@link WorkbenchPanel}'s sticky footer slot; the surface/border there pins it while the body
 * scrolls. Sticky footer is a shell capability enabled per page, not forced everywhere.
 */
export function StickyActionBar({ info, children, className }: StickyActionBarProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 py-3",
        className
      )}
    >
      <div className="min-w-0 text-xs text-ink-muted">{info}</div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
