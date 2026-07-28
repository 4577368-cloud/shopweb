"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useEmbeddedMode } from "@/host/embedded/use-embedded-mode";
import { exchangeSessionToken } from "@/host/embedded/exchange-session-token";

const APP_BRIDGE_CDN = "https://cdn.shopify.com/shopifycloud/app-bridge.js";

/**
 * Loads App Bridge CDN when embedded and apiKey is configured, then exchanges
 * session token → Tangbuy Bearer. No-op on standalone.
 */
/** Build-time env first, then the server-rendered meta tag (no rebuild needed). */
function resolveApiKey(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_SHOPIFY_API_KEY ?? "").trim();
  if (fromEnv) return fromEnv;
  if (typeof document === "undefined") return "";
  return (
    document
      .querySelector<HTMLMetaElement>('meta[name="shopify-api-key"]')
      ?.content ?? ""
  ).trim();
}

export function EmbeddedAppBridgeBootstrap({ children }: { children: ReactNode }) {
  const { isEmbedded, host } = useEmbeddedMode();
  const started = useRef(false);

  useEffect(() => {
    if (!isEmbedded || started.current) return;
    const apiKey = resolveApiKey();
    if (!apiKey) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[embedded] Shopify API key missing — App Bridge disabled");
      }
      return;
    }
    started.current = true;

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${APP_BRIDGE_CDN}"]`
    );
    const runExchange = () => {
      // Do not auto-launch OAuth here — /install Connect (or authorize) owns consent.
      // Auto-launch raced the install gate and bounced merchants back to marketing.
      void exchangeSessionToken(true, { launchOauthOnNeed: false }).then((result) => {
        if (!result.ok && process.env.NODE_ENV === "development") {
          console.warn("[embedded] session-token exchange:", result.code, result.message);
        }
      });
    };

    if (existing) {
      runExchange();
      return;
    }

    const script = document.createElement("script");
    script.src = APP_BRIDGE_CDN;
    script.async = true;
    script.dataset.apiKey = apiKey;
    if (host) script.dataset.host = host;
    script.onload = () => runExchange();
    script.onerror = () => {
      if (process.env.NODE_ENV === "development") {
        console.warn("[embedded] failed to load App Bridge CDN");
      }
    };
    document.head.appendChild(script);
  }, [isEmbedded, host]);

  return <>{children}</>;
}
