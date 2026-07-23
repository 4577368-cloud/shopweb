"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Database,
  LayoutGrid,
  Link2,
  Lock,
  Search,
  ShieldCheck,
  Sparkles,
} from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOnboarding } from "@/context/onboarding-context";
import {
  SHOP_STORAGE_KEY,
  launchShopifyInstall,
} from "@/lib/shopify-install";

import { AppLogo } from "@/components/brand/app-logo";
import { APP_FULL_NAME } from "@/lib/brand";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";

export default function InstallPage() {
  const { showToast } = useOnboarding();
  const t = useT();
  const locale = useLocale();
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Prefill the remembered shop so returning testers can reconnect in one click.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(SHOP_STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot prefill from localStorage
    if (saved) setDomain(saved);
  }, []);

  const trustSignals = [
    t("install.trustOfficialOAuth"),
    t("install.trustReadOnly"),
    t("install.trustNoEdit"),
    t("install.trustEncrypted"),
  ];

  // Core value points — only capabilities that already exist in the product.
  const valuePoints: { icon: typeof Database; title: string; desc: string }[] = [
    { icon: Database, title: t("install.valueAutoSync"), desc: t("install.valueAutoSyncDesc") },
    { icon: Search, title: t("install.valueImageSearch"), desc: t("install.valueImageSearchDesc") },
    { icon: LayoutGrid, title: t("install.valueSku"), desc: t("install.valueSkuDesc") },
    { icon: Boxes, title: t("install.valuePricing"), desc: t("install.valuePricingDesc") },
  ];

  // Honest preview frames of the real product pages (no fabricated dashboards / fake data).
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

  const connect = () => {
    setError(null);
    const result = launchShopifyInstall(domain);
    if (!result.ok) {
      setError(result.error ?? t("install.launchError"));
      if (result.error) showToast(result.error);
    }
    // On success the browser navigates away to Shopify — nothing else to do here.
  };

  return (
    <main className="min-h-full bg-canvas">
      {/* Top bar */}
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <AppLogo variant="header" size="sm" />
            <span className="ml-0.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              {t("common.developerPreview")}
            </span>
          </div>
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
        {/* Hero */}
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

            {/* Domain + primary CTA */}
            <div className="mt-6 max-w-md space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Input
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") connect();
                    }}
                    placeholder={t("install.domainPlaceholder")}
                    className="pr-9"
                    aria-label={t("install.domainAria")}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-subtle">
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                </div>
                <Button className="shrink-0 sm:w-auto" onClick={connect}>
                  <Link2 className="h-4 w-4" />
                  {t("install.connectButton")}
                </Button>
              </div>
              {error ? (
                <p className="text-[11px] leading-4 text-red-600">{error}</p>
              ) : (
                <p className="text-[11px] leading-4 text-ink-subtle">
                  {t("install.connectNote")}
                </p>
              )}
            </div>

            {/* Trust strip */}
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
              {trustSignals.map((signal) => (
                <span
                  key={signal}
                  className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-brand" />
                  {signal}
                </span>
              ))}
            </div>
          </div>

          {/* Hero preview frame (honest product preview, no fake data) */}
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

        {/* Core value points */}
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

        {/* Product previews */}
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

        {/* How it works */}
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

        {/* Developer preview notice */}
        <section className="mt-10 rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-4 py-4">
          <div className="flex items-start gap-2.5">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-900">{t("install.devNoticeTitle")}</p>
              <p className="mt-1 text-xs leading-5 text-amber-800">
                {t("install.devNoticeDesc")}
              </p>
            </div>
          </div>
        </section>

        {/* Footer CTA */}
        <section className="mt-10 flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-brand-accent/20 bg-brand-soft px-5 py-8 text-center">
          <h3 className="text-lg font-semibold tracking-tight text-ink">
            {t("install.readyCta")}
          </h3>
          <p className="max-w-md text-xs leading-5 text-ink-muted">
            {t("install.readyCtaDesc")}
          </p>
          <div className="mt-1 flex w-full max-w-md flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") connect();
                }}
                placeholder={t("install.domainPlaceholder")}
                className="pr-9 bg-surface"
                aria-label={t("install.domainAria")}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-subtle">
                <ShieldCheck className="h-4 w-4" />
              </span>
            </div>
            <Button className="shrink-0" onClick={connect}>
              {t("install.connectButton")}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
            {trustSignals.map((signal) => (
              <li
                key={signal}
                className="inline-flex items-center gap-1 text-[11px] text-ink-muted"
              >
                <CheckCircle2 className="h-3 w-3 text-brand" />
                {signal}
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-10 border-t border-hairline pt-5 text-center text-[11px] text-ink-subtle">
          {t("install.footerNote", { name: APP_FULL_NAME })}
        </footer>
      </div>
    </main>
  );
}

/** A neutral browser-window chrome for honest product previews (no fake data inside). */
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
