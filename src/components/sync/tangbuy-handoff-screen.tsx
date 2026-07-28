"use client";

import Link from "next/link";
import {
  ArrowRight,
  Download,
  ExternalLink,
  FileText,
  ListChecks,
  Package,
  Truck,
  Wand2,
} from "@/lib/ui/icons";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { AppLogoFull, AppLogoMark } from "@/components/brand/app-logo";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import {
  tangbuyDropshippingAppStoreUrl,
  tangbuyDropshippingWebUrl,
  TANGBUY_OFFICIAL_URL,
} from "@/lib/brand";
import { cn } from "@/lib/utils";

function shopifyAdminUrl(shopDomain?: string): string {
  const match = shopDomain?.trim().match(/^([^.]+)\.myshopify\.com/i);
  const handle = match?.[1] ?? "easybrandkit";
  return `https://admin.shopify.com/store/${handle}`;
}

const CAPABILITY_ICONS = [ListChecks, Truck, Package, Wand2] as const;

export function TangbuyHandoffScreen({
  shopDomain,
  mode = "complete",
  onExportReport,
  onViewSummary,
  className,
}: {
  shopDomain?: string;
  mode?: "complete" | "upgrade";
  onExportReport?: () => void;
  onViewSummary?: () => void;
  className?: string;
}) {
  const t = useT();
  const locale = useLocale();
  const appStoreHref = tangbuyDropshippingAppStoreUrl(locale);
  const webHref = tangbuyDropshippingWebUrl({ shop: shopDomain });
  const capabilities = [
    { label: t("handoff.capOrders"), Icon: CAPABILITY_ICONS[0] },
    { label: t("handoff.capFulfillment"), Icon: CAPABILITY_ICONS[1] },
    { label: t("handoff.capTracking"), Icon: CAPABILITY_ICONS[2] },
    { label: t("handoff.capInquiry"), Icon: CAPABILITY_ICONS[3] },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn("mx-auto w-full max-w-3xl", className)}
    >
      {/* Hero panel */}
      <section className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-card">
        <div className="relative border-b border-hairline bg-gradient-to-br from-[#eef2ff] via-white to-[#f8fafc] px-6 pb-7 pt-7 sm:px-8 sm:pb-8 sm:pt-8">
          <div
            className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#325be6]/10 blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-24 left-1/4 h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl"
            aria-hidden
          />

          <div className="relative flex flex-wrap items-center gap-3">
            <AppLogoFull size="sm" />
            {mode === "complete" ? (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800">
                {t("syncCeremony.completionHeading")}{" "}
                {t("syncCeremony.completionHeadingLine2")}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-brand-soft px-2.5 py-0.5 text-[11px] font-medium text-brand-ink">
                {t("handoff.appStoreBadge")}
              </span>
            )}
          </div>

          <h1 className="relative mt-5 max-w-xl text-left text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {mode === "complete"
              ? t("syncCeremony.completionCongrats")
              : t("handoff.upgradeHeading")}
          </h1>
          <p className="relative mt-2 max-w-xl text-left text-sm font-medium text-ink-muted sm:text-[15px]">
            {t("handoff.upgradeLead")}
          </p>
          <p className="relative mt-3 max-w-2xl text-left text-sm leading-relaxed text-ink-muted">
            {t("handoff.bridge")}
          </p>
          <div className="relative mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-subtle">
            {shopDomain ? (
              <span className="rounded-md bg-white/80 px-2 py-1 font-medium text-ink-muted ring-1 ring-hairline">
                {shopDomain}
              </span>
            ) : null}
            <span>{t("handoff.sameAccount")}</span>
          </div>
        </div>

        {/* Capabilities — commercial 2×2 */}
        <div className="grid gap-3 p-5 sm:grid-cols-2 sm:gap-4 sm:p-7">
          {capabilities.map(({ label, Icon }) => (
            <div
              key={label}
              className="flex gap-3 rounded-xl border border-hairline/80 bg-[#fbfcfe] px-3.5 py-3.5 text-left"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-accent">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <p className="pt-1.5 text-sm leading-snug text-ink">{label}</p>
            </div>
          ))}
        </div>

        {/* App Store install — primary commercial CTA */}
        <div className="border-t border-hairline bg-[#f8fafc] px-5 py-6 sm:px-7 sm:py-7">
          <p className="text-left text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
            {t("handoff.installCta")}
          </p>
          <a
            href={appStoreHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex flex-col gap-4 rounded-2xl border border-[#325be6]/20 bg-white p-4 shadow-sm transition hover:border-[#325be6]/45 hover:shadow-md sm:flex-row sm:items-center sm:p-5"
            aria-label={t("handoff.installAria")}
          >
            <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-hairline bg-white shadow-sm">
              <AppLogoMark size="lg" />
            </span>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-base font-semibold text-ink">
                {t("handoff.appName")}
              </p>
              <p className="mt-0.5 text-xs font-medium text-[#325be6]">
                {t("handoff.appStoreBadge")}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                {t("handoff.appBlurb")}
              </p>
            </div>
            <span className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#325be6] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#2648c4]">
              {t("handoff.installCta")}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </span>
          </a>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-left text-sm">
            <a
              href={webHref}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-link hover:text-link-hover hover:underline"
            >
              {t("handoff.openWeb")}
            </a>
            <a
              href={TANGBUY_OFFICIAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-subtle hover:text-ink-muted hover:underline"
            >
              {t("handoff.learnMoreOfficial")}
            </a>
          </div>
        </div>
      </section>

      {/* Stay in app — compact secondary row, always fully visible when scrolling */}
      <section className="mt-6 rounded-2xl border border-hairline bg-surface px-5 py-4 shadow-sm sm:px-6">
        <p className="text-left text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
          {t("handoff.stayHere")}
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {onViewSummary ? (
            <Button
              type="button"
              variant="secondary"
              className="h-9 justify-start sm:justify-center"
              onClick={onViewSummary}
            >
              <FileText className="h-3.5 w-3.5" />
              {t("syncCeremony.viewSummary")}
            </Button>
          ) : null}
          <Link href={localePath(locale, "/products")}>
            <Button variant="secondary" className="h-9 w-full justify-start sm:w-auto sm:justify-center">
              {t("handoff.continueSourcing")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
          {onExportReport ? (
            <Button
              type="button"
              variant="secondary"
              className="h-9 justify-start sm:justify-center"
              onClick={onExportReport}
            >
              <Download className="h-3.5 w-3.5" />
              {t("syncCeremony.exportReport")}
            </Button>
          ) : null}
          {shopDomain ? (
            <a
              href={shopifyAdminUrl(shopDomain)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center px-1 text-sm font-medium text-link hover:underline"
            >
              {t("syncCeremony.openShopifyAdmin")}
            </a>
          ) : null}
        </div>
      </section>
    </motion.div>
  );
}

export function CompletionScreen(
  props: Omit<Parameters<typeof TangbuyHandoffScreen>[0], "mode">
) {
  return <TangbuyHandoffScreen {...props} mode="complete" />;
}
