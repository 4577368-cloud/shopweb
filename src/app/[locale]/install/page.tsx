"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Database,
  LayoutGrid,
  Loader2,
  Search,
  Sparkles,
} from "@/lib/ui/icons";
import { useOnboarding } from "@/context/onboarding-context";
import { useUser } from "@/context/user-context";
import {
  SHOP_STORAGE_KEY,
  launchShopifyInstall,
  normalizeShopDomain,
  rememberShopDomain,
  resolveInstallError,
} from "@/lib/shopify-install";
import {
  ShopDomainConnectField,
  shopHandleFromDomain,
} from "@/components/shopify/shop-domain-connect-field";

import { AppLogo } from "@/components/brand/app-logo";
import { LandingHeroPreview } from "@/components/landing/landing-hero-preview";
import { APP_FULL_NAME } from "@/lib/brand";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { consumeJustRegistered } from "@/lib/auth/just-registered";

function InstallPageContent() {
  const { showToast } = useOnboarding();
  const { status: authStatus, bootstrapping } = useUser();
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const autoShopAttempted = useRef(false);
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [justRegistered, setJustRegistered] = useState(false);

  useEffect(() => {
    setJustRegistered(consumeJustRegistered());
  }, []);

  const connectWithDomain = (raw: string) => {
    // Always remember the shop before any redirect so login / language switch can restore it.
    const remembered = rememberShopDomain(raw);
    if (remembered) {
      setHandle(shopHandleFromDomain(remembered));
    }

    // Login-first: Shopify OAuth writes user_shop under the current Tangbuy JWT.
    if (!bootstrapping && authStatus !== "authenticated") {
      const shopQ = remembered
        ? `?shop=${encodeURIComponent(remembered)}`
        : "";
      const from = `/install${shopQ}`;
      router.push(
        localePath(locale, `/login?from=${encodeURIComponent(from)}`)
      );
      return;
    }
    // During bootstrap we don't yet know the auth state — block the action briefly to avoid
    // a race where an authenticated user clicks before /me resolves and gets bounced to /login.
    if (bootstrapping) {
      showToast(t("install.waitAuth"));
      return;
    }
    setError(null);
    setRedirecting(true);
    const result = launchShopifyInstall(raw);
    if (!result.ok) {
      setRedirecting(false);
      const msg = resolveInstallError(t, result.errorCode, t("install.launchError"));
      setError(msg);
      showToast(msg);
    }
  };

  const connect = () => connectWithDomain(handle);

  const goLoginPreservingShop = (mode: "login" | "register" = "login") => {
    const raw =
      handle.trim() ||
      searchParams.get("shop")?.trim() ||
      (typeof window !== "undefined"
        ? window.localStorage.getItem(SHOP_STORAGE_KEY) ?? ""
        : "");
    const remembered = raw ? rememberShopDomain(raw) : null;
    const shopQ = remembered
      ? `?shop=${encodeURIComponent(remembered)}`
      : "";
    const from = `/install${shopQ}`;
    const base = mode === "register" ? "/register" : "/login";
    router.push(localePath(locale, `${base}?from=${encodeURIComponent(from)}`));
  };

  // Prefill from localStorage (e.g. returned from login) or ?shop=.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromQuery = searchParams.get("shop")?.trim();
    if (fromQuery) {
      const normalized = normalizeShopDomain(fromQuery);
      if (normalized) {
        rememberShopDomain(normalized);
        setHandle(shopHandleFromDomain(normalized));
        return;
      }
    }
    const saved = window.localStorage.getItem(SHOP_STORAGE_KEY);
    if (saved) {
      setHandle(shopHandleFromDomain(saved));
    }
  }, [searchParams]);

  // After Tangbuy login (or when already signed in), auto-resume Shopify OAuth for ?shop=.
  useEffect(() => {
    if (bootstrapping || authStatus !== "authenticated") return;
    const shop =
      searchParams.get("shop")?.trim() ||
      (typeof window !== "undefined"
        ? window.localStorage.getItem(SHOP_STORAGE_KEY)
        : null);
    if (!shop || autoShopAttempted.current) return;
    autoShopAttempted.current = true;
    setHandle(shopHandleFromDomain(shop));
    connectWithDomain(shop);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resume once when auth ready
  }, [authStatus, bootstrapping, searchParams]);

  const needsLogin = !bootstrapping && authStatus !== "authenticated";
  const trustSignals = [
    t("install.trustOfficialOAuth"),
    t("install.trustScoped"),
    t("install.trustRevocable"),
    t("install.trustEncrypted"),
  ];

  const valuePoints: { icon: typeof Database; title: string; desc: string }[] = [
    { icon: Database, title: t("install.valueAutoSync"), desc: t("install.valueAutoSyncDesc") },
    { icon: Search, title: t("install.valueImageSearch"), desc: t("install.valueImageSearchDesc") },
    { icon: LayoutGrid, title: t("install.valueSku"), desc: t("install.valueSkuDesc") },
    { icon: Boxes, title: t("install.valuePricing"), desc: t("install.valuePricingDesc") },
  ];

  const previews: { title: string; desc: string }[] = [
    { title: t("install.previewProducts"), desc: t("install.previewProductsDesc") },
    { title: t("install.previewSku"), desc: t("install.previewSkuDesc") },
    { title: t("install.previewScan"), desc: t("install.previewScanDesc") },
  ];

  const steps: { title: string; desc: string }[] = [
    { title: t("install.step1Title"), desc: t("install.step1Desc") },
    { title: t("install.step2Title"), desc: t("install.step2Desc") },
    { title: t("install.step3Title"), desc: t("install.step3Desc") },
  ];

  if (redirecting && searchParams.get("shop")) {
    return (
      <main className="flex min-h-full flex-col items-center justify-center gap-3 bg-canvas px-5">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
        <p className="text-sm font-medium text-ink">{t("install.redirectingToShopify")}</p>
        <p className="text-xs text-ink-muted">{t("install.shopFromAppHint")}</p>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-canvas">
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5">
          <AppLogo variant="header" size="sm" />
          <div className="flex items-center gap-3">
            <LanguageSwitcher menuPlacement="down" />
            {needsLogin ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goLoginPreservingShop("login")}
                  className="text-xs font-medium text-ink-muted hover:text-ink"
                >
                  {t("install.navLogin")}
                </button>
                <button
                  type="button"
                  onClick={() => goLoginPreservingShop("register")}
                  className="rounded-[var(--radius-control)] bg-ink px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-ink/90"
                >
                  {t("install.navRegister")}
                </button>
              </div>
            ) : (
              <Link
                href={localePath(locale, "/authorize")}
                className="text-xs font-medium text-ink-muted hover:text-ink"
              >
                {t("install.authorizedHint")}
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-8 sm:py-12">
        <section className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-muted">
              <Sparkles className="h-3.5 w-3.5 text-brand" />
              Shopify × Tangbuy Smart Match
            </span>
            <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl">
              {t("install.heroHeading")}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-ink-muted">
              {t("install.heroSubtitle")}
            </p>

            <div className="mt-6 max-w-lg space-y-2">
              {justRegistered && !needsLogin ? (
                <div
                  className="rounded-[var(--radius-control)] border border-brand/25 bg-brand/5 px-3 py-2.5 text-[11px] leading-4 text-ink"
                  role="status"
                >
                  <p className="font-medium">{t("install.welcomeRegisterTitle")}</p>
                  <p className="mt-0.5 text-ink-muted">{t("install.welcomeRegisterDesc")}</p>
                </div>
              ) : null}
              {needsLogin ? (
                <div className="rounded-[var(--radius-control)] border border-brand-accent/25 bg-brand-soft px-3 py-2.5 text-[11px] leading-4 text-ink">
                  <p className="font-medium">{t("install.loginFirstTitle")}</p>
                  <p className="mt-0.5 text-ink-muted">{t("install.loginFirstDesc")}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => goLoginPreservingShop("login")}
                      className="rounded-[var(--radius-control)] bg-ink px-2.5 py-1 text-[11px] font-semibold text-white"
                    >
                      {t("install.navLogin")}
                    </button>
                    <button
                      type="button"
                      onClick={() => goLoginPreservingShop("register")}
                      className="rounded-[var(--radius-control)] border border-hairline bg-surface px-2.5 py-1 text-[11px] font-medium text-ink"
                    >
                      {t("install.navRegister")}
                    </button>
                  </div>
                </div>
              ) : null}
              <ShopDomainConnectField
                value={handle}
                onChange={setHandle}
                onConnect={connect}
                connecting={redirecting}
              />
              {error ? (
                <p className="text-[11px] leading-4 text-red-600">{error}</p>
              ) : (
                <p className="text-[11px] leading-4 text-ink-subtle">
                  {needsLogin
                    ? t("install.connectNoteLoginFirst")
                    : t("install.connectNote")}
                </p>
              )}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
              {trustSignals.map((signal) => (
                <span
                  key={signal}
                  className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-brand" />
                  {signal}
                </span>
              ))}
            </div>
          </div>

          {/* Same animated workbench mockup as the marketing home hero. */}
          <div className="landing-root !min-h-0 !overflow-visible bg-transparent">
            <LandingHeroPreview />
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-lg font-semibold tracking-tight text-ink">
            {t("install.coreCapabilities")}
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">{t("install.coreCapabilitiesDesc")}</p>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {valuePoints.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-[var(--radius-card)] border border-hairline bg-surface px-4 py-4 shadow-card"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand-accent">
                  <Icon className="h-4 w-4" />
                </span>
                <p className="mt-3 text-sm font-medium text-ink">{title}</p>
                <p className="mt-1 text-[11px] leading-4 text-ink-muted">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-lg font-semibold tracking-tight text-ink">
            {t("install.pagePreviews")}
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">{t("install.pagePreviewsDesc")}</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {previews.map((p) => (
              <BrowserFrame key={p.title} label={p.title}>
                <div className="p-3">
                  <p className="text-xs font-medium text-ink">{p.title}</p>
                  <p className="mt-1 text-[11px] leading-4 text-ink-muted">{p.desc}</p>
                </div>
              </BrowserFrame>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-lg font-semibold tracking-tight text-ink">
            {t("install.howItWorks")}
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {steps.map((s, idx) => (
              <div
                key={s.title}
                className="rounded-[var(--radius-card)] border border-hairline bg-surface px-4 py-4 shadow-card"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-white">
                  {idx + 1}
                </span>
                <p className="mt-2.5 text-sm font-medium text-ink">{s.title}</p>
                <p className="mt-1 text-[11px] leading-4 text-ink-muted">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10 flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-brand-accent/20 bg-brand-soft px-5 py-8 text-center">
          <h3 className="text-lg font-semibold tracking-tight text-ink">
            {t("install.readyCta")}
          </h3>
          <p className="max-w-md text-xs leading-5 text-ink-muted">
            {t("install.readyCtaDesc")}
          </p>
          <div className="mt-1 w-full max-w-lg">
            <ShopDomainConnectField
              value={handle}
              onChange={setHandle}
              onConnect={connect}
              connecting={redirecting}
              inputClassName="bg-surface"
              buttonLabel={
                <>
                  {t("install.connectButton")}
                  <ArrowRight className="h-4 w-4" />
                </>
              }
            />
          </div>
        </section>

        <footer className="mt-10 border-t border-hairline pt-5 text-center text-[11px] text-ink-subtle">
          {t("install.footerNote", { name: APP_FULL_NAME })}
        </footer>
      </div>
    </main>
  );
}

export default function InstallPage() {
  const t = useT();
  return (
    <Suspense
      fallback={
        <main className="flex min-h-full items-center justify-center bg-canvas">
          <Loader2 className="h-7 w-7 animate-spin text-brand" aria-label={t("authorize.loading")} />
        </main>
      }
    >
      <InstallPageContent />
    </Suspense>
  );
}

function BrowserFrame({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-control)] border border-hairline bg-canvas">
      <div className="flex items-center gap-1.5 border-b border-hairline bg-surface px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-slate-300" />
        <span className="h-2 w-2 rounded-full bg-slate-300" />
        <span className="h-2 w-2 rounded-full bg-slate-300" />
        <span className="ml-2 truncate text-[10px] text-ink-subtle">{label}</span>
      </div>
      {children}
    </div>
  );
}
