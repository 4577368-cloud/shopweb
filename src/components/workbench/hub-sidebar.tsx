"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppLogo } from "@/components/brand/app-logo";
import { ShopSwitcher } from "@/components/workbench/shop-switcher";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { SidebarUpgradeCta } from "@/components/workbench/sidebar-upgrade-cta";
import { SidebarUserMenu } from "@/components/workbench/sidebar-user-menu";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { cn } from "@/lib/utils";

/**
 * Left rail for the Operations Hub (订单中心 / 运营中心 / 履约中心).
 * Deliberately NOT coupled to `useOnboarding` — the hub is a persistent
 * operations surface, not a store-setup workflow step.
 */
export function HubSidebar() {
  const pathname = usePathname();
  const t = useT();
  const locale = useLocale();

  const items: { id: string; title: string; href?: string }[] = [
    { id: "order", title: t("nav.order"), href: localePath(locale, "/order-center") },
    { id: "ops", title: t("nav.ops") },
    { id: "fulfillment", title: t("nav.fulfillment") },
  ];

  return (
    <aside className="flex h-full w-[15.5rem] shrink-0 flex-col border-r border-hairline bg-surface">
      <div className="shrink-0 px-4 pb-3 pt-4 leading-none">
        <AppLogo variant="sidebar" href={localePath(locale, "/")} />
      </div>

      <ShopSwitcher />

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3" aria-label={t("nav.hub")}>
        <p className="mb-2 px-1 text-[11px] font-medium text-ink-subtle">{t("nav.hub")}</p>
        <ul className="space-y-0.5">
          {items.map((item, idx) => {
            const current = item.href ? pathname === item.href : false;
            const disabled = !item.href;
            return (
              <li key={item.id}>
                {disabled ? (
                  <span
                    title={t("order.empty")}
                    className="flex cursor-default gap-2.5 rounded-[var(--radius-control)] px-2 py-2 text-[13px] font-medium leading-5 text-ink-subtle/70"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface-muted text-[10px] tabular-nums">
                      {idx + 1}
                    </span>
                    <span className="min-w-0 flex-1">{item.title}</span>
                  </span>
                ) : (
                  <Link
                    href={item.href!}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "group flex cursor-pointer gap-2.5 rounded-[var(--radius-control)] px-2 py-2 transition-colors",
                      current
                        ? "bg-brand-soft/80 ring-1 ring-brand/10"
                        : "hover:bg-surface-muted/80"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                        current
                          ? "bg-brand-accent text-white"
                          : "border border-[var(--step-border)] bg-brand-soft text-brand-accent"
                      )}
                    >
                      {idx + 1}
                    </span>
                    <span
                      className={cn(
                        "min-w-0 flex-1 text-[13px] font-medium leading-5",
                        current ? "text-brand-accent" : "text-ink group-hover:text-brand-accent"
                      )}
                    >
                      {item.title}
                    </span>
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <SidebarUpgradeCta />

      <div className="flex shrink-0 items-center gap-2 border-t border-hairline px-4 py-2.5">
        <SidebarUserMenu className="min-w-0 flex-1" />
        <LanguageSwitcher className="shrink-0" />
      </div>
    </aside>
  );
}
