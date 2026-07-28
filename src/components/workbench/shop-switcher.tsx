"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Loader2,
  Plus,
  Settings,
  Store,
} from "@/lib/ui/icons";
import Link from "next/link";
import { useOnboarding } from "@/context/onboarding-context";
import { useUser } from "@/context/user-context";
import { api, ApiError, type AuthorizedShopSummary } from "@/lib/api";
import {
  normalizeShopDomain,
  SHOP_STORAGE_KEY,
} from "@/lib/shopify-install";
import {
  shopSummaryMatchesDomain,
} from "@/lib/restore-shop-auth";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { localeHtmlLang } from "@/i18n/config";
import { cn } from "@/lib/utils";

function fmtAuthorizedAt(locale: string, raw?: string): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const htmlLang = localeHtmlLang[locale as keyof typeof localeHtmlLang] ?? locale;
  return d.toLocaleString(htmlLang, { hour12: false });
}

/**
 * Sidebar shop dropdown: switch among authorized shops, or jump to /install to add another.
 *
 * Behavior by auth state:
 * - bootstrapping: render the trigger with the current shop label (no network call yet).
 * - authenticated: list shops from /api/plugin/shopify/auth/shops (user-scoped). A 401 here
 *   triggers a single silent /refresh; persistent 401 falls back to the current shop.
 * - unauthenticated: keep the dropdown (so a remembered shop from localStorage still works
 *   during the transition period), but skip the user-scoped list call — show the current
 *   shop only, with a "sign in" hint at the bottom.
 * - sole shop: if the account has exactly one bound shop but onboarding is not authorized yet,
 *   auto-activate that shop so the sidebar does not stick on "未连接店铺".
 */
export function ShopSwitcher() {
  const t = useT();
  const locale = useLocale();
  const { shop, isAuthorized, hydrateAuthorizedShop, showToast } = useOnboarding();
  const { status: authStatus, bootstrapping } = useUser();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [shops, setShops] = useState<AuthorizedShopSummary[]>([]);
  const [signInHint, setSignInHint] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const autoActivatedRef = useRef<string | null>(null);

  const currentDomain = normalizeShopDomain(shop.domain || "");

  const activateShop = useCallback(
    async (
      domain: string,
      opts?: { silent?: boolean; fallback?: AuthorizedShopSummary }
    ) => {
      const normalized = normalizeShopDomain(domain) || domain.trim().toLowerCase();
      if (!normalized) return false;

      if (
        isAuthorized &&
        currentDomain &&
        currentDomain === normalized
      ) {
        return true;
      }

      try {
        window.localStorage.setItem(SHOP_STORAGE_KEY, normalized);
        const status = await api.getShopStatus(normalized);
        if (!status.authorized) {
          // Sole-shop fallback: /shops already proved the binding is ACTIVE.
          if (opts?.fallback) {
            const fbDomain =
              normalizeShopDomain(
                opts.fallback.shopDomain || opts.fallback.shopName || ""
              ) || normalized;
            hydrateAuthorizedShop({
              name: opts.fallback.shopName || fbDomain.split(".")[0] || fbDomain,
              domain: fbDomain,
              authorizedAt: fmtAuthorizedAt(locale, opts.fallback.authorizedAt),
              productCount: opts.fallback.productCount ?? 0,
            });
            if (!opts.silent) {
              showToast(
                t("shopSwitcher.toastSwitched", {
                  name: opts.fallback.shopName || fbDomain,
                })
              );
            }
            return true;
          }
          if (!opts?.silent) showToast(t("shopSwitcher.toastAuthExpired"));
          return false;
        }
        hydrateAuthorizedShop({
          name: status.shopName ?? normalized.split(".")[0] ?? normalized,
          domain: status.shopDomain ?? normalized,
          authorizedAt: fmtAuthorizedAt(locale, status.authorizedAt),
          productCount: status.productCount ?? 0,
        });
        if (!opts?.silent) {
          showToast(
            t("shopSwitcher.toastSwitched", {
              name: status.shopName ?? normalized,
            })
          );
        }
        return true;
      } catch {
        if (opts?.fallback) {
          const fbDomain =
            normalizeShopDomain(
              opts.fallback.shopDomain || opts.fallback.shopName || ""
            ) || normalized;
          hydrateAuthorizedShop({
            name: opts.fallback.shopName || fbDomain.split(".")[0] || fbDomain,
            domain: fbDomain,
            authorizedAt: fmtAuthorizedAt(locale, opts.fallback.authorizedAt),
            productCount: opts.fallback.productCount ?? 0,
          });
          if (!opts?.silent) {
            showToast(
              t("shopSwitcher.toastSwitched", {
                name: opts.fallback.shopName || fbDomain,
              })
            );
          }
          return true;
        }
        if (!opts?.silent) showToast(t("shopSwitcher.toastSwitchFailed"));
        return false;
      }
    },
    [
      currentDomain,
      hydrateAuthorizedShop,
      isAuthorized,
      locale,
      showToast,
      t,
    ]
  );

  const loadShops = useCallback(async () => {
    // Don't fire the user-scoped endpoint during bootstrap or when clearly unauthenticated —
    // it would 401 and waste a round-trip. The current shop (from localStorage) still shows.
    if (bootstrapping) return;
    if (authStatus !== "authenticated") {
      setShops(
        isAuthorized && shop.domain
          ? [
              {
                shopName: shop.name,
                shopDomain: shop.domain,
                productCount: shop.productCount,
              },
            ]
          : []
      );
      setSignInHint(true);
      return;
    }
    setSignInHint(false);
    setLoading(true);
    try {
      const list = await api.listAuthorizedShops();
      const rows = Array.isArray(list) ? list : [];
      setShops(rows);

      // Sole bound shop + not yet authorized in this session → auto-activate.
      if (rows.length === 1) {
        const sole = rows[0];
        const soleDomain =
          normalizeShopDomain(sole.shopDomain || sole.shopName || "") ||
          sole.shopDomain;
        const needsActivate =
          !!soleDomain &&
          (!isAuthorized ||
            !currentDomain ||
            !shopSummaryMatchesDomain(sole, currentDomain));
        if (
          needsActivate &&
          soleDomain &&
          autoActivatedRef.current !== soleDomain
        ) {
          autoActivatedRef.current = soleDomain;
          void activateShop(soleDomain, { silent: true, fallback: sole });
        }
      }
    } catch (err) {
      // 401 means the access cookie expired; the UserProvider's bootstrap or the next
      // user action will trigger /refresh. Until then, fall back to the current shop so
      // the UI is not empty.
      if (err instanceof ApiError && err.status === 401) {
        setSignInHint(true);
      }
      setShops(
        isAuthorized && shop.domain
          ? [
              {
                shopName: shop.name,
                shopDomain: shop.domain,
                productCount: shop.productCount,
              },
            ]
          : []
      );
    } finally {
      setLoading(false);
    }
  }, [
    activateShop,
    authStatus,
    bootstrapping,
    currentDomain,
    isAuthorized,
    shop.domain,
    shop.name,
    shop.productCount,
  ]);

  // Also probe once after login even if the dropdown stays closed — fixes sole-shop
  // "未连接店铺" without requiring the user to open the switcher.
  useEffect(() => {
    if (bootstrapping) return;
    if (authStatus !== "authenticated") return;
    if (isAuthorized && currentDomain) return;
    void loadShops();
  }, [authStatus, bootstrapping, currentDomain, isAuthorized, loadShops]);

  useEffect(() => {
    if (!open) return;
    void loadShops();
  }, [open, loadShops]);

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

  const selectShop = async (domain: string, row?: AuthorizedShopSummary) => {
    if (switching) return;
    const normalized = normalizeShopDomain(domain) || domain.trim().toLowerCase();
    if (!normalized) return;
    if (isAuthorized && currentDomain && currentDomain === normalized) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    try {
      const ok = await activateShop(normalized, {
        fallback: row ?? (shops.length === 1 ? shops[0] : undefined),
      });
      if (ok) setOpen(false);
    } finally {
      setSwitching(false);
    }
  };

  const label = isAuthorized
    ? shop.name || currentDomain || t("shopSwitcher.notConnected")
    : t("shopSwitcher.notConnected");

  return (
    <div ref={rootRef} className="relative px-4">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-[var(--radius-control)] border border-hairline bg-surface px-2.5 py-2 text-left transition-colors hover:bg-slate-50"
      >
        <Store className="h-3.5 w-3.5 shrink-0 text-brand" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">
          {label}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-ink-subtle transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute left-4 right-4 z-40 mt-1.5 overflow-hidden rounded-[var(--radius-control)] border border-hairline bg-surface shadow-card"
        >
          <div className="max-h-56 overflow-y-auto py-1">
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-ink-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("shopSwitcher.loadingShops")}
              </div>
            ) : shops.length === 0 ? (
              <p className="px-3 py-2.5 text-xs text-ink-muted">
                {t("shopSwitcher.noAuthorizedShops")}
              </p>
            ) : (
              shops.map((s) => {
                const active =
                  isAuthorized &&
                  !!currentDomain &&
                  shopSummaryMatchesDomain(s, currentDomain);
                return (
                  <button
                    key={s.shopDomain || s.shopName}
                    type="button"
                    role="option"
                    aria-selected={active}
                    disabled={switching}
                    onClick={() => void selectShop(s.shopDomain || s.shopName, s)}
                    className={cn(
                      "flex w-full items-start gap-2 px-3 py-2 text-left transition-colors",
                      active ? "bg-brand-soft" : "hover:bg-slate-50",
                      switching && "opacity-60"
                    )}
                  >
                    <Store className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-ink">
                        {s.shopName}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-ink-muted">
                        {s.shopDomain}
                      </span>
                    </span>
                    {active ? (
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
          {signInHint ? (
            <div className="border-t border-hairline bg-brand-soft/40 px-3 py-1.5 text-[10px] text-ink-muted">
              <Link
                href={localePath(locale, "/login")}
                onClick={() => setOpen(false)}
                className="font-medium text-brand underline-offset-2 hover:underline"
              >
                {t("shopSwitcher.signInForAllShops")}
              </Link>
            </div>
          ) : null}
          <div className="border-t border-hairline">
            <Link
              href={localePath(locale, "/install")}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-brand transition-colors hover:bg-brand-soft"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("shopSwitcher.addShop")}
            </Link>
            {authStatus === "authenticated" && !bootstrapping ? (
              <Link
                href={localePath(locale, "/account/shops")}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 text-xs text-ink-muted transition-colors hover:bg-slate-50"
              >
                <Settings className="h-3.5 w-3.5" />
                {t("shopSwitcher.manageShops")}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
