"use client";

import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { HubAwareSidebar } from "@/components/workbench/hub-aware-sidebar";
import { TangbuyHandoffScreen } from "@/components/sync/tangbuy-handoff-screen";
import { useOnboarding } from "@/context/onboarding-context";

/**
 * Shared handoff surface (also used after sync complete).
 * Sidebar Upgrade and deep links land here — App Store install is the primary CTA.
 */
export default function UpgradeHandoffPage() {
  const { shop } = useOnboarding();
  const shopDomain = shop.domain || shop.name || undefined;

  return (
    <WorkbenchShell sidebar={<HubAwareSidebar />}>
      <div className="relative flex min-h-[calc(100vh-48px)] items-center justify-center px-[var(--wb-gutter)] py-8">
        <TangbuyHandoffScreen shopDomain={shopDomain} mode="upgrade" />
      </div>
    </WorkbenchShell>
  );
}
