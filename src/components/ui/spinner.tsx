import { cn } from "@/lib/utils";
import { useT } from "@/i18n/LocaleProvider";

type SpinnerProps = React.ComponentProps<"span">;

/** Loading indicator — Polaris Icons has no animated spinner. */
export function Spinner({ className, ...props }: SpinnerProps) {
  const t = useT();
  return (
    <span
      role="status"
      aria-label={t("common.loading")}
      className={cn(
        "inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent",
        className
      )}
      {...props}
    />
  );
}
