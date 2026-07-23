"use client";

import Link from "next/link";
import { ArrowRight, Download, FileText, ListChecks } from "@/lib/ui/icons";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";

function shopifyAdminUrl(shopDomain?: string): string {
  const match = shopDomain?.trim().match(/^([^.]+)\.myshopify\.com/i);
  const handle = match?.[1] ?? "easybrandkit";
  return `https://admin.shopify.com/store/${handle}`;
}

export function CompletionScreen({
  shopDomain,
  onExportReport,
  onViewSummary,
}: {
  shopDomain?: string;
  onExportReport?: () => void;
  onViewSummary?: () => void;
}) {
  const t = useT();
  const locale = useLocale();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="mx-auto flex w-full max-w-md flex-col items-center px-4 text-center"
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 20 }}
        className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl"
      >
        🎉
      </motion.div>

      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        {t("syncCeremony.completionHeading")}
        <br />
        {t("syncCeremony.completionHeadingLine2")}
      </h1>

      <p className="mt-4 text-sm font-medium text-ink">{t("syncCeremony.completionCongrats")}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
        {t("syncCeremony.completionDesc")}
      </p>
      {shopDomain ? (
        <p className="mt-1 text-xs text-ink-subtle">{shopDomain}</p>
      ) : null}

      <div className="mt-8 w-full space-y-2">
        {onViewSummary ? (
          <Button type="button" className="h-11 w-full" onClick={onViewSummary}>
            <FileText className="h-4 w-4" />
            {t("syncCeremony.viewSummary")}
          </Button>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <Link href={localePath(locale, "/")} className="col-span-1">
            <Button variant="secondary" className="h-10 w-full">
              {t("syncCeremony.enterWorkbench")}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href={localePath(locale, "/products")} className="col-span-1">
            <Button variant="secondary" className="h-10 w-full">
              <ListChecks className="h-4 w-4" />
              {t("syncCeremony.pendingOptimizations")}
            </Button>
          </Link>
        </div>

        <Button
          type="button"
          variant="secondary"
          className="h-10 w-full"
          onClick={onExportReport}
        >
          <Download className="h-4 w-4" />
          {t("syncCeremony.exportReport")}
        </Button>
      </div>

      <a
        href={shopifyAdminUrl(shopDomain)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 text-sm font-medium text-link hover:text-link-hover hover:underline"
      >
        {t("syncCeremony.openShopifyAdmin")}
      </a>
    </motion.div>
  );
}
