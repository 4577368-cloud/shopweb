"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useEmbeddedMode } from "@/host/embedded/use-embedded-mode";
import { exchangeSessionToken } from "@/host/embedded/exchange-session-token";

/**
 * After App Bridge is present (loaded sync from root layout <head>), exchange
 * session token → Tangbuy Bearer. Does NOT inject the CDN script — Shopify
 * requires it as the first <script> without async/defer (see layout.tsx).
 */
export function EmbeddedAppBridgeBootstrap({ children }: { children: ReactNode }) {
  const { isEmbedded } = useEmbeddedMode();
  const started = useRef(false);

  useEffect(() => {
    if (!isEmbedded || started.current) return;
    started.current = true;

    // Do not auto-launch OAuth here — /install Connect (or authorize) owns consent.
    void exchangeSessionToken(true, { launchOauthOnNeed: false }).then((result) => {
      if (!result.ok) {
        console.warn(
          "[embedded] session-token exchange:",
          result.code,
          result.message
        );
      }
    });
  }, [isEmbedded]);

  return <>{children}</>;
}
