/**
 * External / Shopify Admin link adapter.
 * Embedded: break out of iframe via top-level navigation (OAuth, App Store, companion apps).
 * Standalone: new tab by default.
 */

import { readEmbeddedMode } from "@/host/embedded/use-embedded-mode";

function navigateTop(url: string): void {
  // App Bridge 4 recommends open(url, "_top"). Never read window.top.location
  // (cross-origin SecurityError inside Admin).
  try {
    const opened = window.open(url, "_top");
    if (opened != null) return;
  } catch {
    // sandboxed / unsafe navigation
  }
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_top";
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return;
  } catch {
    // fall through
  }
  // Last resort: new tab (OAuth still completes; callback returns to Admin).
  window.open(url, "_blank", "noopener,noreferrer");
}

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
    if (opts?.newTab) {
      window.open(target, "_blank", "noopener,noreferrer");
      return;
    }
    navigateTop(target);
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
