"use client";

import { TitleBar } from "@shopify/app-bridge-react";
import { useEmbeddedMode } from "@/host/embedded/use-embedded-mode";
import { EmbeddedNavMenu } from "@/host/embedded/embedded-nav-menu";
import { APP_ADMIN_TITLE } from "@/lib/brand";

/**
 * App Bridge chrome that must sit under LocaleProvider so NavMenu labels resolve.
 * Standalone: renders nothing.
 */
export function EmbeddedAdminChrome({
  title = APP_ADMIN_TITLE,
}: {
  title?: string;
}) {
  const { isEmbedded } = useEmbeddedMode();
  if (!isEmbedded) return null;

  return (
    <>
      <EmbeddedNavMenu />
      <TitleBar title={title} />
    </>
  );
}
