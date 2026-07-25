"use client";

import { WorkbenchSidebar, type WorkbenchSidebarProps } from "@/components/workbench/workbench-sidebar";

/** @deprecated Use {@link WorkbenchSidebar} directly. Kept for existing imports. */
export function HubAwareSidebar(props: WorkbenchSidebarProps) {
  return <WorkbenchSidebar {...props} />;
}
