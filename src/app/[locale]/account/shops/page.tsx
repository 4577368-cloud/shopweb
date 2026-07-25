"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Store,
  Trash2,
} from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { api, ApiError, type UserShopBinding } from "@/lib/api";
import { useOnboarding } from "@/context/onboarding-context";
import { useUser } from "@/context/user-context";
import { SHOP_STORAGE_KEY } from "@/lib/shopify-install";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { localeHtmlLang } from "@/i18n/config";
import { cn } from "@/lib/utils";
import {
  AccountCard,
  AccountLoadingState,
  AccountPageHeader,
  AccountSignInState,
} from "@/components/account/account-primitives";
import { AccountStatItem } from "@/components/account/account-data";

/**
 * Account → My Shops.
 *
 * Lists shops bound to the current user (via /api/plugin/user/shops), lets the
 * user unbind a shop (DELETE), and switches the active shop by writing
 * SHOP_STORAGE_KEY and hydrating onboarding state.
 *
 * The page is gated by proxy.ts (no `tb_access` cookie → redirect to /login).
 * Backend further enforces JWT auth on the API endpoints, so a stale cookie
 * surfaces as 401 → the local UserProvider will refresh or sign out.
 */
export default function AccountShopsPage() {
  const t = useT();
  const locale = useLocale();
  const { user, status, bootstrapping } = useUser();
  const { shop, isAuthorized, hydrateAuthorizedShop, showToast } = useOnboarding();

  const [shops, setShops] = useState<UserShopBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unbindingShopName, setUnbindingShopName] = useState<string | null>(null);
  const [switchingDomain, setSwitchingDomain] = useState<string | null>(null);

  const loadShops = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listUserShops();
      setShops(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(readError(err, t));
      setShops([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    // Wait for auth bootstrap so a stale 401 doesn't show "load failed" flash.
    if (bootstrapping) return;
    if (status !== "authenticated") return;
    void loadShops();
  }, [bootstrapping, status, loadShops]);

  const activeDomain = isAuthorized ? shop.domain.toLowerCase() : "";

  const switchToShop = async (binding: UserShopBinding) => {
    if (switchingDomain) return;
    const normalized = binding.shopDomain.trim().toLowerCase();
    if (!normalized) return;
    if (normalized === activeDomain) return;

    setSwitchingDomain(normalized);
    try {
      const statusResp = await api.getShopStatus(normalized);
      if (!statusResp.authorized) {
        showToast(t("accountShops.toastAuthExpired"));
        return;
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SHOP_STORAGE_KEY, normalized);
      }
      hydrateAuthorizedShop({
        name: statusResp.shopName ?? binding.shopName,
        domain: statusResp.shopDomain ?? normalized,
        authorizedAt: fmtDate(locale, statusResp.authorizedAt),
        productCount: statusResp.productCount ?? 0,
      });
      showToast(t("accountShops.toastSwitched", { name: statusResp.shopName ?? binding.shopName }));
    } catch (err) {
      showToast(readError(err, t));
    } finally {
      setSwitchingDomain(null);
    }
  };

  const handleUnbind = async (binding: UserShopBinding) => {
    if (unbindingShopName) return;
    // Confirm before destructive action — unbinding the active shop forces a
    // shop switch (or sign-out if no other binding remains).
    const msg = t("accountShops.confirmUnbind", {
      shopName: binding.shopName,
      domain: binding.shopDomain,
    });
    if (typeof window !== "undefined" && !window.confirm(msg)) return;

    setUnbindingShopName(binding.shopName);
    try {
      await api.unbindUserShop(binding.shopName);
      // Remove locally so the UI updates without a full refetch.
      setShops((prev) => prev.filter((s) => s.shopName !== binding.shopName));
      showToast(t("accountShops.toastUnbound", { shopName: binding.shopName }));

      // If the user just unbound their active shop, switch to another binding
      // (or clear local storage so the workbench prompts for a shop next time).
      if (binding.shopDomain.toLowerCase() === activeDomain) {
        const remaining = shops.filter((s) => s.shopName !== binding.shopName);
        if (remaining.length > 0) {
          await switchToShop(remaining[0]);
        } else {
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(SHOP_STORAGE_KEY);
          }
          showToast(t("accountShops.toastNoActiveShop"));
        }
      }
    } catch (err) {
      showToast(readError(err, t));
    } finally {
      setUnbindingShopName(null);
    }
  };

  const summary = useMemo(() => {
    const total = shops.length;
    const active = shops.filter((s) => s.authStatus === "ACTIVE").length;
    const missing = shops.filter((s) => s.authStatus === "MISSING").length;
    return { total, active, missing };
  }, [shops]);

  if (bootstrapping) {
    return <AccountLoadingState message={t("common.loading")} />;
  }

  if (status !== "authenticated") {
    return (
      <AccountSignInState
        icon={<Store className="h-4 w-4 text-muted-foreground" />}
        message={t("accountShops.signInRequired")}
        signInLabel={t("userMenu.signIn")}
        signInHref={localePath(locale, `/login?from=${encodeURIComponent("/account/shops")}`)}
      />
    );
  }

  return (
    <section className="space-y-6">
      <AccountPageHeader
        title={t("accountShops.title")}
        subtitle={t("accountShops.subtitle")}
        footnote={user?.email ? t("accountShops.signedInAs", { email: user.email }) : undefined}
        actions={
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void loadShops()}
              disabled={loading}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              {t("accountShops.refresh")}
            </Button>
            <Button variant="primary" size="sm" asChild>
              <Link href={localePath(locale, "/install")}>
                <Plus className="h-3.5 w-3.5" />
                {t("accountShops.addShop")}
              </Link>
            </Button>
          </>
        }
      />

      {shops.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          <AccountStatItem label={t("accountShops.statTotal")} value={summary.total} />
          <AccountStatItem label={t("accountShops.statActive")} value={summary.active} tone="ok" />
          <AccountStatItem
            label={t("accountShops.statNeedsAttention")}
            value={summary.missing}
            tone={summary.missing > 0 ? "warn" : "muted"}
          />
        </div>
      ) : null}

      {loading ? (
        <AccountLoadingState message={t("accountShops.loading")} />
      ) : error ? (
        <AccountCard>
          <div className="flex items-start gap-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="font-medium">{t("accountShops.loadFailed")}</p>
              <p className="mt-1 break-words text-muted-foreground">{error}</p>
            </div>
          </div>
          <div className="mt-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => void loadShops()}>
              <RefreshCw className="h-3.5 w-3.5" />
              {t("accountShops.retry")}
            </Button>
          </div>
        </AccountCard>
      ) : shops.length === 0 ? (
        <EmptyState
          title={t("accountShops.emptyTitle")}
          desc={t("accountShops.emptyDesc")}
          ctaLabel={t("accountShops.addShop")}
          ctaHref={localePath(locale, "/install")}
        />
      ) : (
        <ul className="space-y-2.5">
          {shops.map((s) => {
            const isActive = s.shopDomain.toLowerCase() === activeDomain;
            const isMissing = s.authStatus === "MISSING";
            const switching = switchingDomain === s.shopDomain.toLowerCase();
            const unbinding = unbindingShopName === s.shopName;
            return (
              <li
                key={s.shopDomain}
                className={cn(
                  "rounded-[var(--radius-card)] border bg-surface p-4 shadow-card transition-colors",
                  isActive ? "border-brand/40 ring-1 ring-brand/20" : "border-surface-border"
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Store className="h-4 w-4 shrink-0 text-brand" />
                      <h3 className="truncate text-sm font-semibold text-foreground">
                        {s.shopName}
                      </h3>
                      {isActive ? (
                        <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand-accent">
                          {t("accountShops.activeBadge")}
                        </span>
                      ) : null}
                      <AuthStatusBadge status={s.authStatus} t={t} />
                    </div>
                    <a
                      href={`https://${s.shopDomain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      {s.shopDomain}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground sm:grid-cols-3">
                      <Detail label={t("accountShops.fieldProductCount")} value={fmtCount(s.productCount)} />
                      <Detail label={t("accountShops.fieldBoundAt")} value={fmtDate(locale, s.boundAt)} />
                      <Detail label={t("accountShops.fieldAuthorizedAt")} value={fmtDate(locale, s.authorizedAt)} />
                    </dl>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {isActive ? null : (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => void switchToShop(s)}
                        disabled={switching || isMissing || !!switchingDomain || !!unbindingShopName}
                        title={isMissing ? t("accountShops.switchDisabledMissing") : undefined}
                      >
                        {switching ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        {t("accountShops.switchAction")}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleUnbind(s)}
                      disabled={unbinding || !!switchingDomain || !!unbindingShopName}
                      className="text-destructive! hover:bg-red-50 hover:text-destructive!"
                      title={t("accountShops.unbindHint")}
                    >
                      {unbinding ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      {t("accountShops.unbindAction")}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[11px] leading-5 text-muted-foreground/80">
        {t("accountShops.footnote")}
      </p>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground/80">{label}</dt>
      <dd className="text-muted-foreground">{value}</dd>
    </div>
  );
}

function AuthStatusBadge({
  status,
  t,
}: {
  status: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  if (status === "ACTIVE") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-medium text-brand-accent">
        <CheckCircle2 className="h-3 w-3" />
        {t("accountShops.statusActive")}
      </span>
    );
  }
  if (status === "MISSING") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
        <AlertTriangle className="h-3 w-3" />
        {t("accountShops.statusMissing")}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {status}
    </span>
  );
}

function EmptyState({
  title,
  desc,
  ctaLabel,
  ctaHref,
}: {
  title: string;
  desc: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-surface-border bg-surface/60 px-6 py-10 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand-accent">
        <Store className="h-5 w-5" />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-[12px] leading-5 text-muted-foreground">{desc}</p>
      <div className="mt-4">
        <Button variant="primary" asChild>
          <Link href={ctaHref}>
            <Plus className="h-4 w-4" />
            {ctaLabel}
          </Link>
        </Button>
      </div>
    </div>
  );
}

function fmtCount(n: number | undefined): string {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return n.toLocaleString();
}

function fmtDate(locale: string, iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const htmlLang = localeHtmlLang[locale as keyof typeof localeHtmlLang] ?? locale;
  return d.toLocaleString(htmlLang, { hour12: false });
}

function readError(err: unknown, t: (key: string) => string): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return t("auth.errorNetwork");
    if (err.status === 401) return t("accountShops.errorUnauthenticated");
    if (err.status === 404) return t("accountShops.errorNotFound");
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return t("auth.errorUnknown");
}
