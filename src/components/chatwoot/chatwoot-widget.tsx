"use client";

import { useEffect } from "react";

const BASE_URL = "https://chat.tangbuy.com";
const WEBSITE_TOKEN = "bGi5WyEWS3hiu9qKRJ8KdQER";

/**
 * Chatwoot live-chat widget.
 *
 * Injects the Chatwoot SDK asynchronously on the client side.
 * Default bubble is hidden — the app surfaces chat via its own
 * "联系我" CTAs (see openChatwoot()).
 */
export function ChatwootWidget() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (document.getElementById("chatwoot-sdk-script")) return;

    (window as unknown as Record<string, unknown>).chatwootSettings = {
      position: "right",
      type: "standard",
      launcherTitle: "",
      hideMessageBubble: true,
    };

    const script = document.createElement("script");
    script.id = "chatwoot-sdk-script";
    script.src = `${BASE_URL}/packs/js/sdk.js`;
    script.async = true;
    script.onload = () => {
      const w = window as unknown as Record<string, unknown>;
      const sdk = w.chatwootSDK as
        | { run: (opts: { websiteToken: string; baseUrl: string }) => void }
        | undefined;
      if (sdk) {
        sdk.run({
          websiteToken: WEBSITE_TOKEN,
          baseUrl: BASE_URL,
        });
      }
    };
    document.head.appendChild(script);

    return () => {
      const existing = document.getElementById("chatwoot-sdk-script");
      if (existing) existing.remove();
    };
  }, []);

  return null;
}

interface ChatwootSDKHandle {
  toggle: (state?: "open" | "close") => void;
}

/**
 * Open the Chatwoot chat window from a custom CTA.
 * Returns false if the SDK is not ready yet so callers can fall back
 * (e.g. show a toast).
 */
export function openChatwoot(): boolean {
  if (typeof window === "undefined") return false;
  const handle = (window as unknown as Record<string, unknown>).$chatwoot as
    | ChatwootSDKHandle
    | undefined;
  if (!handle) return false;
  handle.toggle("open");
  return true;
}

