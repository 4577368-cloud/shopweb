"use client";

import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { SidebarUserMenu } from "@/components/workbench/sidebar-user-menu";

/**
 * Compact account + locale strip for Shopify Admin embedded mode.
 * Replaces the in-app left rail footer (Admin already owns navigation).
 */
export function EmbeddedTopChrome() {
  return (
    <div className="flex shrink-0 items-center justify-end gap-2 border-b border-hairline bg-canvas/90 px-4 py-2 backdrop-blur">
      <SidebarUserMenu className="max-w-[14rem]" menuPlacement="down" />
      <LanguageSwitcher className="shrink-0" menuPlacement="down" />
    </div>
  );
}
