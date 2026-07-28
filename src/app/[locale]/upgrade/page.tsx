"use client";

import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { WorkbenchSidebar } from "@/components/workbench/workbench-sidebar";
import { TangbuyHandoffScreen } from "@/components/sync/tangbuy-handoff-screen";
import { useOnboarding } from "@/context/onboarding-context";

/**
 * Shared handoff surface (also used after sync complete).
 * Column fills the main pane; install card docks to the bottom (always visible).
 */
export default function UpgradeHandoffPage() {
  const { shop } = useOnboarding();
  const shopDomain = shop.domain || shop.name || undefined;

  return (
    <WorkbenchShell sidebar={<WorkbenchSidebar />}>
      <div className="flex min-h-0 flex-1 flex-col">
        <TangbuyHandoffScreen shopDomain={shopDomain} mode="upgrade" />
      </div>
    </WorkbenchShell>
  );
}
