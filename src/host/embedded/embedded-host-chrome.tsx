"use client";

import { useEffect, type ReactNode } from "react";
import { useEmbeddedMode } from "@/host/embedded/use-embedded-mode";

/**
 * Embedded Admin shell wrapper around page content.
 * NavMenu / TitleBar live in {@link EmbeddedAdminChrome} under LocaleProvider.
 *
 * Fills the Admin iframe height (not 100vh) so footers are not clipped under
 * Shopify chrome.
 */
export function EmbeddedHostChrome({ children }: { children: ReactNode }) {
  const { isEmbedded } = useEmbeddedMode();

  useEffect(() => {
    if (!isEmbedded) return;
    document.documentElement.dataset.embedded = "1";
    document.body.dataset.embedded = "1";
    return () => {
      delete document.documentElement.dataset.embedded;
      delete document.body.dataset.embedded;
    };
  }, [isEmbedded]);

  if (!isEmbedded) {
    return <>{children}</>;
  }

  return (
    <div className="embedded-host-root flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {children}
    </div>
  );
}
