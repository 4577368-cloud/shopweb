/**
 * External / Shopify Admin link adapter.
 * Embedded: break out of iframe via top-level navigation (OAuth, App Store, companion apps).
 * Standalone: new tab by default.
 */

import { readEmbeddedMode } from "@/host/embedded/use-embedded-mode";

export function openExternal(url: string, opts?: { newTab?: boolean }): void {
  if (typeof window === "undefined") return;
  const mode = readEmbeddedMode();
  let target = url.trim();
  if (!target) return;
  // Relative paths must be absolutized against the app origin before touching
  // window.top — otherwise Admin resolves them against admin.shopify.com.
  if (target.startsWith("/")) {
    target = `${window.location.origin}${target}`;
  }

  if (mode.isEmbedded) {
    // Consent screens and App Store pages must not stay framed.
    // Do NOT read/assign window.top.location — Admin is cross-origin and throws
    // SecurityError (surfaced as NAVIGATION_FAILED / "leave the Admin frame").
    if (opts?.newTab) {
      window.open(target, "_blank", "noopener,noreferrer");
      return;
    }
    // `_top` navigates the outermost frame without touching top.location.
    const opened = window.open(target, "_top");
    if (opened == null) {
      const anchor = document.createElement("a");
      anchor.href = target;
      anchor.target = "_top";
      anchor.rel = "noopener noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }
    return;
  }

  if (opts?.newTab === false) {
    window.location.assign(target);
    return;
  }
  window.open(target, "_blank", "noopener,noreferrer");
}

/** Open a path inside Shopify Admin (e.g. `/products/123`) when embedded. */
export function openShopifyAdminPath(adminPath: string): void {
  if (typeof window === "undefined") return;
  const mode = readEmbeddedMode();
  const path = adminPath.startsWith("/") ? adminPath : `/${adminPath}`;
  if (mode.isEmbedded && mode.shop) {
    const shopHandle = mode.shop.replace(/\.myshopify\.com$/i, "");
    openExternal(`https://admin.shopify.com/store/${shopHandle}${path}`, {
      newTab: false,
    });
    return;
  }
  openExternal(path, { newTab: true });
}
