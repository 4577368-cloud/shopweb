"use client";

/**
 * In-app navigation adapter.
 * Embedded: soft-nav via Next router / History so App Bridge tracks the route.
 * Always preserves `host` / `embedded` / `shop` query when in Admin iframe.
 */

import { withEmbeddedQuery, readEmbeddedMode } from "@/host/embedded/use-embedded-mode";

export type AppRouterLike = {
  push: (href: string) => void;
  replace?: (href: string) => void;
};

export function hrefInApp(href: string): string {
  return withEmbeddedQuery(href, readEmbeddedMode());
}

/**
 * Navigate inside the app. Prefer passing the Next.js router for App Router soft nav.
 * Falls back to history.pushState + assign when no router is available.
 */
export function navigateInApp(href: string, router?: AppRouterLike): void {
  if (typeof window === "undefined") return;
  const next = hrefInApp(href);
  if (router?.push) {
    router.push(next);
    return;
  }
  window.location.assign(next);
}

export function replaceInApp(href: string, router?: AppRouterLike): void {
  if (typeof window === "undefined") return;
  const next = hrefInApp(href);
  if (router?.replace) {
    router.replace(next);
    return;
  }
  window.location.replace(next);
}
