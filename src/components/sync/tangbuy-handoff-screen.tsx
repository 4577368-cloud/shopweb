"use client";

import Link from "next/link";
import Image from "next/image";
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
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import {
  BRAND_FAVICON,
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
  /** complete = after sync ceremony; upgrade = sidebar entry */
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
    t("handoff.capOrders"),
    t("handoff.capFulfillment"),
    t("handoff.capTracking"),
    t("handoff.capInquiry"),
  ] as const;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className={cn(
        "mx-auto flex w-full max-w-lg flex-col items-center px-4 text-center",
        className
      )}
    >
      {mode === "complete" ? (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.08, type: "spring", stiffness: 200, damping: 20 }}
          className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-xl"
          aria-hidden
        >
          🎉
        </motion.div>
      ) : null}

      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        {mode === "complete" ? (
          <>
            {t("syncCeremony.completionHeading")}
            <br />
            {t("syncCeremony.completionHeadingLine2")}
          </>
        ) : (
          t("handoff.upgradeHeading")
        )}
      </h1>

      <p className="mt-3 text-sm font-medium text-ink">
        {mode === "complete"
          ? t("syncCeremony.completionCongrats")
          : t("handoff.upgradeLead")}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
        {t("handoff.bridge")}
      </p>
      {shopDomain ? (
        <p className="mt-1 text-xs text-ink-subtle">{shopDomain}</p>
      ) : null}
      <p className="mt-2 text-xs leading-relaxed text-ink-subtle">
        {t("handoff.sameAccount")}
      </p>

      <ul className="mt-5 w-full space-y-2 text-left">
        {capabilities.map((label, i) => {
          const Icon = CAPABILITY_ICONS[i] ?? ListChecks;
          return (
            <li
              key={label}
              className="flex items-start gap-2.5 rounded-[var(--radius-control)] border border-hairline bg-surface px-3 py-2.5"
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-accent">
                <Icon className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="text-xs leading-5 text-ink">{label}</span>
            </li>
          );
        })}
      </ul>

      {/* Primary: Shopify App Store card */}
      <a
        href={appStoreHref}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 block w-full rounded-[var(--radius-card)] border border-hairline bg-surface p-3.5 text-left shadow-card transition-colors hover:border-brand/40"
        aria-label={t("handoff.installAria")}
      >
        <div className="flex items-start gap-3">
          <span className="relative flex h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-hairline bg-white">
            <Image
              src={BRAND_FAVICON}
              alt=""
              width={48}
              height={48}
              className="h-full w-full object-contain p-1"
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">
              {t("handoff.appName")}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-subtle">
              {t("handoff.appStoreBadge")}
            </p>
            <p className="mt-1.5 text-xs leading-4 text-ink-muted">
              {t("handoff.appBlurb")}
            </p>
          </div>
        </div>
        <span className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-brand-accent text-sm font-medium text-white">
          {t("handoff.installCta")}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </span>
      </a>

      <a
        href={webHref}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 text-sm font-medium text-link hover:text-link-hover hover:underline"
      >
        {t("handoff.openWeb")}
      </a>

      <div className="mt-8 w-full space-y-2 border-t border-hairline pt-6">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
          {t("handoff.stayHere")}
        </p>
        {onViewSummary ? (
          <Button type="button" variant="secondary" className="h-10 w-full" onClick={onViewSummary}>
            <FileText className="h-4 w-4" />
            {t("syncCeremony.viewSummary")}
          </Button>
        ) : null}
        <Link href={localePath(locale, "/products")} className="block">
          <Button variant="secondary" className="h-10 w-full">
            {t("handoff.continueSourcing")}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
        {onExportReport ? (
          <Button
            type="button"
            variant="secondary"
            className="h-10 w-full"
            onClick={onExportReport}
          >
            <Download className="h-4 w-4" />
            {t("syncCeremony.exportReport")}
          </Button>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-ink-subtle">
        {shopDomain ? (
          <a
            href={shopifyAdminUrl(shopDomain)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-link hover:text-link-hover hover:underline"
          >
            {t("syncCeremony.openShopifyAdmin")}
          </a>
        ) : null}
        <a
          href={TANGBUY_OFFICIAL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-ink-muted hover:underline"
        >
          {t("handoff.learnMoreOfficial")}
        </a>
      </div>
    </motion.div>
  );
}

/** @deprecated Prefer TangbuyHandoffScreen — kept as alias for sync complete. */
export function CompletionScreen(
  props: Omit<Parameters<typeof TangbuyHandoffScreen>[0], "mode">
) {
  return <TangbuyHandoffScreen {...props} mode="complete" />;
}
