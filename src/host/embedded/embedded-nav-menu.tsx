"use client";

import { useMemo } from "react";
import { NavMenu } from "@shopify/app-bridge-react";
import { useEmbeddedMode } from "@/host/embedded/use-embedded-mode";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { hrefInApp } from "@/host/adapters/navigation";

const WORKBENCH_NAV: { href: string; labelKey: string; home?: boolean }[] = [
  { href: "/products", labelKey: "steps.products.title", home: true },
  { href: "/authorize", labelKey: "steps.authorize.title" },
  { href: "/sku-align", labelKey: "steps.sku.title" },
  { href: "/logistics", labelKey: "steps.logistics.title" },
  { href: "/sync", labelKey: "steps.sync.title" },
  { href: "/upgrade", labelKey: "sidebar.upgradeLabel" },
];

/**
 * Syncs Shopify Admin left NavigationMenu with the sourcing workbench routes.
 * Renders nothing on standalone.
 */
export function EmbeddedNavMenu() {
  const { isEmbedded } = useEmbeddedMode();
  const locale = useLocale();
  const t = useT();

  const items = useMemo(() => {
    return WORKBENCH_NAV.map((item) => {
      const path = localePath(locale, item.href);
      return {
        ...item,
        href: hrefInApp(path),
        label: t(item.labelKey),
      };
    });
  }, [locale, t]);

  if (!isEmbedded) return null;

  return (
    <NavMenu>
      {items.map((item) =>
        item.home ? (
          <a key={item.href} href={item.href} rel="home">
            {item.label}
          </a>
        ) : (
          <a key={item.href} href={item.href}>
            {item.label}
          </a>
        )
      )}
    </NavMenu>
  );
}
