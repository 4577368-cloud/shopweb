import { cn } from "@/lib/utils";

type SpinnerProps = React.ComponentProps<"span">;

/** Loading indicator — Polaris Icons has no animated spinner. */
export function Spinner({ className, ...props }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent",
        className
      )}
      {...props}
    />
  );
}
