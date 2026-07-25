"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import { ArrowLeft, Coins, FileText, Person, ShieldCheck, Store } from "@/lib/ui/icons";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { StepSidebar } from "@/components/workbench/step-sidebar";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { cn } from "@/lib/utils";

/**
 * Account-center shell.
 *
 * Shares the workbench two-column frame with the rest of the app:
 *   - Left:  <StepSidebar /> — same workflow nav as /products, /sku-align, so
 *     the account pages sit inside the canonical shell instead of a standalone
 *     <main>. Users reach account via the sidebar user menu, so returning to
 *     the workflow rail is the natural back-out path.
 *   - Center: compact header (breadcrumb + back-to-workbench) + horizontal
 *     tab bar (shops / profile / security / bills / credits) + scroll body.
 *   - Right: no assistant rail — account pages are read/edit surfaces, not
 *     copilot workflows, so a two-column focus mode is the right density.
 *
 * Tabs collapse to a horizontally scrollable strip on mobile so all entries
 * remain reachable without expanding a menu. Each page keeps its own header
 * inside the content area — the tab bar only owns navigation.
 *
 * Auth gating: protected by proxy.ts (no `tb_access` cookie → /login redirect).
 * Pages themselves call useUser() and render a sign-in CTA if the bootstrap
 * resolves to unauthenticated, so a stale cookie does not lock the user out
 * of the shell itself.
 */
export default function AccountLayout({ children }: { children: ReactNode }) {
  const t = useT();
  const locale = useLocale();
  const pathname = usePathname();

  const sections = [
    { key: "shops", href: "/account/shops", icon: Store, label: t("accountNav.shops") },
    { key: "profile", href: "/account/profile", icon: Person, label: t("accountNav.profile") },
    { key: "security", href: "/account/security", icon: ShieldCheck, label: t("accountNav.security") },
    { key: "bills", href: "/account/bills", icon: FileText, label: t("accountNav.bills") },
    { key: "credits", href: "/account/credits", icon: Coins, label: t("accountNav.credits") },
  ] as const;

  const isActive = (href: string) => {
    const full = localePath(locale, href);
    if (pathname === full) return true;
    // Sub-routes (e.g. /account/shops/xyz) also activate the parent.
    return pathname.startsWith(full + "/");
  };

  return (
    <WorkbenchShell sidebar={<StepSidebar />}>
      <div className="flex h-full min-h-0 flex-col">
        {/* Compact header — breadcrumb on the left, back-to-workbench on the right.
            The brand logo lives in <StepSidebar />, so we don't duplicate it here. */}
        <header className="shrink-0 border-b border-surface-border bg-canvas/80 px-[var(--wb-gutter)] pb-2.5 pt-3 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {t("accountNav.breadcrumb")}
            </span>
            <Link
              href={localePath(locale, "/")}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {t("accountNav.backToWorkbench")}
            </Link>
          </div>
        </header>

        {/* Horizontal tab bar — scrollable on mobile, centered on desktop */}
        <nav
          aria-label={t("accountNav.sectionLabel")}
          className="shrink-0 border-b border-surface-border bg-surface"
        >
          <div className="mx-auto max-w-6xl px-[var(--wb-gutter)]">
            <ul className="flex gap-1 overflow-x-auto py-1">
              {sections.map(({ key, href, icon: Icon, label }) => {
                const active = isActive(href);
                return (
                  <li key={key} className="shrink-0">
                    <Link
                      href={localePath(locale, href)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group inline-flex items-center gap-1.5 rounded-[var(--radius-control)] px-3 py-1.5 text-[12px] font-medium transition-colors",
                        active
                          ? "bg-brand-soft text-brand-accent"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          active ? "text-brand" : "text-muted-foreground group-hover:text-foreground"
                        )}
                        aria-hidden
                      />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

        {/* Scrollable content area — owns its own scrolling like <WorkbenchPanel> */}
        <div className="min-h-0 flex-1 overflow-y-auto px-[var(--wb-gutter)] py-6 lg:py-8">
          <div className="mx-auto max-w-6xl">
            <div className="min-w-0">{children}</div>
          </div>
        </div>
      </div>
    </WorkbenchShell>
  );
}
