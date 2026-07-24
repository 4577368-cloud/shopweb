"use client";

import { useState, type ComponentProps } from "react";
import { CatalogPublishPanel } from "@/components/select/catalog-publish-panel";

export type ProductsCatalogTabProps = Omit<
  ComponentProps<typeof CatalogPublishPanel>,
  "filtersMountEl"
>;

/** Discover tab: filter host (portal target) + catalog grid/publish panel (Step 3 shell). */
export function ProductsCatalogTab(props: ProductsCatalogTabProps) {
  const [filtersMountEl, setFiltersMountEl] = useState<HTMLDivElement | null>(
    null
  );

  return (
    <>
      <div className="min-h-0">
        <div ref={setFiltersMountEl} />
      </div>
      <CatalogPublishPanel {...props} filtersMountEl={filtersMountEl} />
    </>
  );
}
