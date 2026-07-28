"use client";

import { useMemo } from "react";
import { NavMenu } from "@shopify/app-bridge-react";
import { useEmbeddedMode } from "@/host/embedded/use-embedded-mode";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { hrefInApp } from "@/host/adapters/navigation";

/**
 * Shopify hides the `rel="home"` link (it becomes the app-title click target).
 * Keep a dedicated home entry, then list every workbench step as a visible item
 * — including 商品关联 — so Admin left nav matches the in-app sidebar.
 */
const HOME_HREF = "/products";

const VISIBLE_NAV: { href: string; labelKey: string }[] = [
  { href: "/authorize", labelKey: "steps.authorize.title" },
  { href: "/products", labelKey: "steps.products.title" },
  { href: "/sku-align", labelKey: "steps.sku.title" },
  { href: "/logistics", labelKey: "steps.logistics.title" },
  { href: "/sync", labelKey: "steps.sync.title" },
  { href: "/upgrade", labelKey: "sidebar.upgradeLabel" },
];

/**
 * Syncs Shopify Admin left NavigationMenu with the sourcing workbench routes.
 * Renders nothing on standalone. Must be under LocaleProvider.
 *
 * ui-nav-menu is visually hidden via CSS so raw link text never flashes in the
 * iframe when App Bridge upgrades the custom element late (or fails).
 */
export function EmbeddedNavMenu() {
  const { isEmbedded } = useEmbeddedMode();
  const locale = useLocale();
  const t = useT();

  const { homeHref, items } = useMemo(() => {
    const homeHref = hrefInApp(localePath(locale, HOME_HREF));
    const items = VISIBLE_NAV.map((item) => ({
      href: hrefInApp(localePath(locale, item.href)),
      label: t(item.labelKey),
    }));
    return { homeHref, items };
  }, [locale, t]);

  if (!isEmbedded) return null;

  return (
    <NavMenu>
      {/* Required: configures Admin app-home; not shown as a menu row. */}
      <a href={homeHref} rel="home">
        {t("steps.products.title")}
      </a>
      {items.map((item) => (
        <a key={item.href} href={item.href}>
          {item.label}
        </a>
      ))}
    </NavMenu>
  );
}
