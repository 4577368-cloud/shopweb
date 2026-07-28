"use client";

import { useState, type ComponentProps } from "react";
import { CatalogPublishPanel } from "@/components/select/catalog-publish-panel";

export type ProductsCatalogTabProps = Omit<
  ComponentProps<typeof CatalogPublishPanel>,
  "filtersMountEl"
> & {
  /** When set (embedded sticky toolbar), filters portal here instead of in-scroll. */
  filtersMountEl?: HTMLElement | null;
};

/** Discover tab: filter host (portal target) + catalog grid/publish panel (Step 3 shell). */
export function ProductsCatalogTab({
  filtersMountEl: externalMount = null,
  ...props
}: ProductsCatalogTabProps) {
  const [localMountEl, setLocalMountEl] = useState<HTMLDivElement | null>(null);
  const filtersMountEl = externalMount ?? localMountEl;

  return (
    <>
      {!externalMount ? (
        <div className="min-h-0">
          <div ref={setLocalMountEl} />
        </div>
      ) : null}
      <CatalogPublishPanel {...props} filtersMountEl={filtersMountEl} />
    </>
  );
}
