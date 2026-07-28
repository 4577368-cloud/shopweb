"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  ChevronUp,
  Exit,
  Person,
  Settings,
} from "@/lib/ui/icons";
import { useOnboarding } from "@/context/onboarding-context";
import { useUser } from "@/context/user-context";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { SHOP_STORAGE_KEY } from "@/lib/shopify-install";
import { cn } from "@/lib/utils";

type UserMenuAction = "shops" | "profile" | "settings" | "signOut";

const MENU_ITEMS: { id: Exclude<UserMenuAction, "signOut">; icon: typeof ArrowLeftRight }[] = [
  { id: "shops", icon: ArrowLeftRight },
  { id: "profile", icon: Person },
  { id: "settings", icon: Settings },
];

/**
 * Sidebar footer account control.
 *
 * - bootstrapping: shows a muted placeholder (avoid layout shift + email flash).
 * - unauthenticated: shows a "Sign in" link to /login.
 * - authenticated: shows the user email with an upward action menu.
 *
 * signOut calls the real `logout()` from UserProvider; if the network call
 * fails we still clear local state (the cookie will eventually expire on its own).
 */
export function SidebarUserMenu({ className }: { className?: string }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const { showToast } = useOnboarding();
  const { user, status, bootstrapping, logout } = useUser();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Render variants by auth status. The trigger button must keep a stable
  // height (h-7) across all variants to avoid layout shift during bootstrap.
  if (bootstrapping) {
    return (
      <div
        className={cn(
          "inline-flex h-7 w-full min-w-0 items-center gap-1 rounded-[var(--radius-control)] border border-surface-border bg-surface px-2",
          className
        )}
        aria-busy="true"
        aria-label={t("userMenu.openMenu")}
      >
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {t("common.loading")}
        </span>
        <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-50" aria-hidden />
      </div>
    );
  }

  if (status !== "authenticated" || !user) {
    return (
      <Link
        href={localePath(locale, "/login")}
        className={cn(
          "inline-flex h-7 w-full min-w-0 items-center justify-center gap-1 rounded-[var(--radius-control)] border border-brand/40 bg-brand-soft px-2 text-[11px] font-medium text-brand transition-colors hover:border-brand/60 hover:bg-brand-soft/80",
          className
        )}
      >
        <Person className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {t("userMenu.signIn")}
      </Link>
    );
  }

  const runAction = async (action: UserMenuAction) => {
    setOpen(false);
    if (action === "signOut") {
      if (signingOut) return;
      setSigningOut(true);
      try {
        await logout();
        // Clear persisted shop so the next login starts fresh.
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(SHOP_STORAGE_KEY);
        }
        showToast(t("userMenu.toastSignedOut"));
        // Navigate to landing so the user sees a clear state change.
        // Server components on the landing page do not require auth.
        router.push(localePath(locale, "/"));
      } catch {
        showToast(t("userMenu.signOutFailed"));
      } finally {
        setSigningOut(false);
      }
      return;
    }
    if (action === "profile") {
      router.push(localePath(locale, "/account/profile"));
      return;
    }
    if (action === "settings") {
      // Settings surfaces as the security page (password + sessions) for now.
      // Add a dedicated /account/settings route when notification prefs,
      // API tokens, etc. warrant a separate page.
      router.push(localePath(locale, "/account/security"));
      return;
    }
    if (action === "shops") {
      // Shop management: list bound shops, switch active shop, or unbind.
      router.push(localePath(locale, "/account/shops"));
      return;
    }
    showToast(t("userMenu.comingSoon"));
  };

  return (
    <div ref={rootRef} className={cn("relative min-w-0", className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("userMenu.openMenu")}
        title={user.email}
        onClick={() => setOpen((v) => !v)}
        disabled={signingOut}
        className="inline-flex h-7 w-full min-w-0 items-center gap-1 rounded-[var(--radius-control)] border border-surface-border bg-surface px-2 text-left shadow-sm transition-colors hover:border-brand/40 disabled:opacity-60"
      >
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
          {user.name?.trim() || user.email}
        </span>
        <ChevronUp
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute bottom-full left-0 right-0 z-40 mb-1 overflow-hidden rounded-[var(--radius-control)] border border-surface-border bg-surface py-1 shadow-card"
        >
          {MENU_ITEMS.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              onClick={() => runAction(id)}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] text-foreground transition-colors hover:bg-muted/80"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {t(`userMenu.${id}`)}
            </button>
          ))}

          <div className="my-1 border-t border-surface-border" />

          <button
            type="button"
            role="menuitem"
            onClick={() => runAction("signOut")}
            disabled={signingOut}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
          >
            <Exit className="h-3.5 w-3.5 shrink-0" />
            {signingOut ? t("common.loading") : t("userMenu.signOut")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
