import { cn } from "@/lib/utils";

/** Shared class string for text inputs, selects, and textareas — spec §2.4.4 */
export const controlClassName = cn(
  "flex h-9 w-full rounded-[var(--radius-control)] border border-input bg-surface px-3 text-sm text-foreground shadow-sm transition-[border-color,box-shadow]",
  "placeholder:text-muted-foreground",
  "focus:border-brand focus:outline-none focus:ring-2 focus:ring-ring/35",
  "focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35",
  "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60",
  "aria-invalid:border-destructive aria-invalid:focus:border-destructive aria-invalid:focus-visible:border-destructive",
  "aria-invalid:focus:ring-destructive/25 aria-invalid:focus-visible:ring-destructive/25"
);
