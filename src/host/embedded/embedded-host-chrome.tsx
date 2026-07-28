"use client";

import type { ReactNode } from "react";
import { TitleBar } from "@shopify/app-bridge-react";
import { useEmbeddedMode } from "@/host/embedded/use-embedded-mode";
import { EmbeddedNavMenu } from "@/host/embedded/embedded-nav-menu";
import { APP_FULL_NAME } from "@/lib/brand";

/**
 * Embedded Admin chrome: NavigationMenu + default TitleBar.
 * Standalone: passthrough children only.
 */
export function EmbeddedHostChrome({
  children,
  title = APP_FULL_NAME,
}: {
  children: ReactNode;
  title?: string;
}) {
  const { isEmbedded } = useEmbeddedMode();

  if (!isEmbedded) {
    return <>{children}</>;
  }

  return (
    <>
      <EmbeddedNavMenu />
      <TitleBar title={title} />
      <div className="embedded-host-root min-h-0 flex-1">{children}</div>
    </>
  );
}
