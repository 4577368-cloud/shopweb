"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * Detect whether the app is running as a Shopify Admin embedded iframe host.
 *
 * Truth sources (Shopify App Bridge / Admin load URL):
 * - `embedded=1` query param
 * - `host` query param (base64 Admin host)
 * - `shop` alone is NOT enough (standalone also uses `?shop=`)
 *
 * Standalone (`ai.tangbuy.com` direct) must remain the default when these are absent.
 */

export type EmbeddedModeSnapshot = {
  /** True when Admin iframe / App Bridge host context is present. */
  isEmbedded: boolean;
  /** Shopify `host` query value (base64), empty when standalone. */
  host: string;
  /** Shop domain from query when present (display only — auth truth is session). */
  shop: string;
};

const EMPTY: EmbeddedModeSnapshot = {
  isEmbedded: false,
  host: "",
  shop: "",
};

const STICKY_KEY = "tb_embedded_mode_v1";

/** Survives soft-nav remounts so getServerSnapshot does not flash standalone. */
let stickyClientSnapshot: EmbeddedModeSnapshot | null = null;

function readStickyFromSession(): EmbeddedModeSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STICKY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EmbeddedModeSnapshot;
    if (parsed && typeof parsed.isEmbedded === "boolean") return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function persistSticky(next: EmbeddedModeSnapshot): void {
  stickyClientSnapshot = next;
  if (typeof window === "undefined") return;
  try {
    if (next.isEmbedded) {
      sessionStorage.setItem(STICKY_KEY, JSON.stringify(next));
      document.documentElement.dataset.embedded = "1";
      document.body.dataset.embedded = "1";
    } else {
      sessionStorage.removeItem(STICKY_KEY);
      delete document.documentElement.dataset.embedded;
      delete document.body.dataset.embedded;
    }
  } catch {
    /* private mode / quota */
  }
}

function readSearchParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

function snapshotFromSearch(search: URLSearchParams): EmbeddedModeSnapshot {
  const host = (search.get("host") ?? "").trim();
  const embeddedFlag = search.get("embedded");
  const shop = (search.get("shop") ?? "").trim().toLowerCase();
  let isEmbedded =
    Boolean(host) || embeddedFlag === "1" || embeddedFlag === "true";
  // Admin iframe may briefly lack host on soft-nav; frame / App Bridge are truthy too.
  if (!isEmbedded && typeof window !== "undefined") {
    try {
      if (window.self !== window.top) isEmbedded = true;
    } catch {
      isEmbedded = true; // cross-origin parent ⇒ embedded
    }
    if (window.shopify) isEmbedded = true;
  }
  // Soft-nav can drop host; keep sticky shop/host when still embedded.
  if (isEmbedded && stickyClientSnapshot?.isEmbedded) {
    return {
      isEmbedded: true,
      host: host || stickyClientSnapshot.host,
      shop: shop || stickyClientSnapshot.shop,
    };
  }
  return { isEmbedded, host, shop };
}

/**
 * React requires getSnapshot to return a cached reference when the value is
 * unchanged — a fresh object every call triggers an infinite re-render loop.
 */
let cachedClientSnapshot: EmbeddedModeSnapshot = EMPTY;

function getClientSnapshot(): EmbeddedModeSnapshot {
  if (!stickyClientSnapshot) {
    stickyClientSnapshot = readStickyFromSession();
  }
  const next = snapshotFromSearch(readSearchParams());
  if (next.isEmbedded) {
    persistSticky(next);
  } else if (stickyClientSnapshot?.isEmbedded) {
    persistSticky(EMPTY);
  }
  if (
    cachedClientSnapshot.isEmbedded === next.isEmbedded &&
    cachedClientSnapshot.host === next.host &&
    cachedClientSnapshot.shop === next.shop
  ) {
    return cachedClientSnapshot;
  }
  cachedClientSnapshot = next;
  return cachedClientSnapshot;
}

/**
 * SSR / hydration: always standalone so markup matches the server.
 * Soft-nav remounts use getClientSnapshot (sticky + sessionStorage).
 * First-paint left-rail flash is covered by html[data-embedded] CSS.
 */
function getServerSnapshot(): EmbeddedModeSnapshot {
  return EMPTY;
}

type Listener = () => void;
const listeners = new Set<Listener>();
let historyPatched = false;
let origPush: History["pushState"] | null = null;
let origReplace: History["replaceState"] | null = null;

function emit() {
  for (const listener of listeners) listener();
}

function ensureHistoryPatch() {
  if (typeof window === "undefined" || historyPatched) return;
  historyPatched = true;
  origPush = history.pushState.bind(history);
  origReplace = history.replaceState.bind(history);
  history.pushState = (...args: Parameters<History["pushState"]>) => {
    origPush!(...args);
    emit();
  };
  history.replaceState = (...args: Parameters<History["replaceState"]>) => {
    origReplace!(...args);
    emit();
  };
  window.addEventListener("popstate", emit);
}

function subscribe(onStoreChange: Listener): () => void {
  if (typeof window === "undefined") return () => {};
  ensureHistoryPatch();
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

/**
 * Client hook: embedded vs standalone. Prefer this in Host adapters and chrome.
 * Feature packages should not call this — use Host adapters instead.
 */
export function useEmbeddedMode(): EmbeddedModeSnapshot {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}

/**
 * One-shot read for non-React call sites (e.g. launchShopifyInstall adapters).
 * Returns standalone snapshot during SSR.
 */
export function readEmbeddedMode(): EmbeddedModeSnapshot {
  if (typeof window === "undefined") return EMPTY;
  return getClientSnapshot();
}

/** Preserve embedded query keys when building in-app URLs. */
export function withEmbeddedQuery(
  href: string,
  mode: Pick<EmbeddedModeSnapshot, "isEmbedded" | "host" | "shop"> = readEmbeddedMode()
): string {
  if (!mode.isEmbedded) return href;
  const url = new URL(
    href,
    typeof window !== "undefined" ? window.location.origin : "https://ai.tangbuy.com"
  );
  if (mode.host && !url.searchParams.has("host")) {
    url.searchParams.set("host", mode.host);
  }
  if (!url.searchParams.has("embedded")) {
    url.searchParams.set("embedded", "1");
  }
  if (mode.shop && !url.searchParams.has("shop")) {
    url.searchParams.set("shop", mode.shop);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Stable memo helper when a parent already has the snapshot. */
export function useEmbeddedQueryHref(href: string): string {
  const mode = useEmbeddedMode();
  return useMemo(() => withEmbeddedQuery(href, mode), [href, mode]);
}
