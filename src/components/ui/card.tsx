import * as React from "react";
import { cn } from "@/lib/utils";
import { selectableCardClassName } from "@/lib/ui/selectable-card-styles";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-surface-border bg-surface shadow-card",
        className
      )}
      {...props}
    />
  );
}

/**
 * User-pickable card — hover shadow + #333 selected border (spec §2.4.4).
 * Pair with aria-selected and a visible selection affordance (checkbox, label, etc.).
 */
export function SelectableCard({
  selected = false,
  interactive = true,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  selected?: boolean;
  interactive?: boolean;
}) {
  return (
    <div
      className={selectableCardClassName({ selected, interactive, className })}
      aria-selected={selected}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 border-b border-surface-border px-4 py-3",
        className
      )}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-sm font-semibold text-foreground", className)}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("mt-0.5 text-xs text-muted-foreground", className)} {...props} />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 py-3", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-t border-surface-border px-4 py-3",
        className
      )}
      {...props}
    />
  );
}
