"use client";

import type { ReactNode } from "react";
import { useEmbeddedMode } from "@/host/embedded/use-embedded-mode";

/**
 * Embedded Admin shell wrapper around page content.
 * NavMenu / TitleBar live in {@link EmbeddedAdminChrome} under LocaleProvider.
 */
export function EmbeddedHostChrome({ children }: { children: ReactNode }) {
  const { isEmbedded } = useEmbeddedMode();

  if (!isEmbedded) {
    return <>{children}</>;
  }

  return (
    <div className="embedded-host-root min-h-0 flex-1">{children}</div>
  );
}
