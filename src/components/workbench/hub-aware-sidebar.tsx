"use client";

import { StepSidebar } from "@/components/workbench/step-sidebar";
import { HubSidebar } from "@/components/workbench/hub-sidebar";
import { useHubMode } from "@/lib/hub/hub-mode";
import { HUB_ENABLED } from "@/lib/hub/flags";

/**
 * Left rail that follows the dev-only Operations Hub switch.
 *
 * - Hub mode OFF (default / production): renders the store-opening `StepSidebar`
 *   unchanged — the store-setup flow is 100% untouched.
 * - Hub mode ON (local testing only): renders `HubSidebar` (订单/运营/履约中心).
 *
 * The sidebar-ad-carousel lives inside `StepSidebar`, so it is automatically
 * hidden whenever the hub rail is shown — no extra guard needed.
 */
export function HubAwareSidebar() {
  const { enabled } = useHubMode();
  return HUB_ENABLED && enabled ? <HubSidebar /> : <StepSidebar />;
}
