"use client";

import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { HubAwareSidebar } from "@/components/workbench/hub-aware-sidebar";
import { TangbuyHandoffScreen } from "@/components/sync/tangbuy-handoff-screen";
import { useOnboarding } from "@/context/onboarding-context";

/**
 * Shared handoff surface (also used after sync complete).
 * Scrollable column — do not vertically center (clips tall content).
 */
export default function UpgradeHandoffPage() {
  const { shop } = useOnboarding();
  const shopDomain = shop.domain || shop.name || undefined;

  return (
    <WorkbenchShell sidebar={<HubAwareSidebar />}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-[var(--wb-gutter)] py-8 pb-16">
          <TangbuyHandoffScreen shopDomain={shopDomain} mode="upgrade" />
        </div>
      </div>
    </WorkbenchShell>
  );
}
