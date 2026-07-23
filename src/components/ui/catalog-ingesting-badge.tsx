import {
  CATALOG_INGESTING_LABEL,
  CATALOG_INGESTING_TOOLTIP,
} from "@/lib/tangbuy/catalog-ingest-display";
import { cn } from "@/lib/utils";

export function CatalogIngestingBadge({ className }: { className?: string }) {
  return (
    <span
      title={CATALOG_INGESTING_TOOLTIP}
      aria-label={CATALOG_INGESTING_TOOLTIP}
      className={cn(
        "inline-flex cursor-default rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-800",
        className
      )}
    >
      {CATALOG_INGESTING_LABEL}
    </span>
  );
}
