"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import {
  SHOP_STORAGE_KEY,
  launchShopifyInstall,
} from "@/lib/shopify-install";
import {
  ShopDomainConnectField,
  shopHandleFromDomain,
} from "@/components/shopify/shop-domain-connect-field";

import { AppLogo } from "@/components/brand/app-logo";
import { APP_FULL_NAME } from "@/lib/brand";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";

function InstallPageContent() {
  const { showToast } = useOnboarding();
  const t = useT();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const autoShopAttempted = useRef(false);
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  const connectWithDomain = (raw: string) => {
    setError(null);
    setRedirecting(true);
    const result = launchShopifyInstall(raw);
    if (!result.ok) {
      setRedirecting(false);
      setError(result.error ?? t("install.launchError"));
      if (result.error) showToast(result.error);
    }
  };

  const connect = () => connectWithDomain(handle);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(SHOP_STORAGE_KEY);
    if (saved) {
      setHandle(shopHandleFromDomain(saved));
    }
  }, []);

  useEffect(() => {
    const shop = searchParams.get("shop")?.trim();
    if (!shop || autoShopAttempted.current) return;
    autoShopAttempted.current = true;
    setHandle(shopHandleFromDomain(shop));
    connectWithDomain(shop);
  }, [searchParams]);

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
            <LanguageSwitcher />
            <Link
              href={localePath(locale, "/authorize")}
              className="text-xs font-medium text-ink-muted hover:text-ink"
            >
              {t("install.authorizedHint")}
            </Link>
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
                  {t("install.connectNote")}
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

          <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3 shadow-card">
            <BrowserFrame label={t("install.browserLabelProducts")}>
              <div className="grid gap-2.5 p-3 sm:grid-cols-2">
                {valuePoints.slice(0, 2).map(({ icon: Icon, title, desc }) => (
                  <div
                    key={title}
                    className="rounded-[var(--radius-control)] border border-hairline bg-canvas px-3 py-3"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand-accent">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <p className="mt-2 text-xs font-medium text-ink">{title}</p>
                    <p className="mt-0.5 text-[10px] leading-4 text-ink-muted">{desc}</p>
                  </div>
                ))}
              </div>
            </BrowserFrame>
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
