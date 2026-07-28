"use client";

import {
  ExternalLink,
  ListChecks,
  Package,
  Truck,
  Wand2,
} from "@/lib/ui/icons";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { AppLogoFull } from "@/components/brand/app-logo";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import {
  tangbuyDropshippingAppStoreUrl,
  tangbuyDropshippingWebUrl,
  TANGBUY_LOGO_MARK,
  TANGBUY_OFFICIAL_URL,
} from "@/lib/brand";
import { openExternal } from "@/host/adapters/external-link";
import { cn } from "@/lib/utils";

const CAPABILITY_ICONS = [ListChecks, Truck, Package, Wand2] as const;

export function TangbuyHandoffScreen({
  shopDomain,
  mode = "complete",
  className,
}: {
  shopDomain?: string;
  mode?: "complete" | "upgrade";
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
      className={cn(
        "mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col",
        className
      )}
    >
      {/* Scrollable body — install dock stays pinned below */}
      <div className="min-h-0 flex-1 overflow-y-auto px-[var(--wb-gutter)] pb-4 pt-6 sm:pt-8">
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
            <p className="relative mt-3 max-w-2xl text-left text-sm leading-relaxed text-ink-muted">
              {t("handoff.bridge")}
            </p>
            <p className="relative mt-3 text-left text-xs text-ink-subtle">
              {t("handoff.sameAccount")}
            </p>
          </div>

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
        </section>
      </div>

      {/* Bottom dock — always visible in the main column */}
      <div className="shrink-0 border-t border-hairline bg-gradient-to-t from-[#f4f5f7] via-[#f8f9fb] to-transparent px-[var(--wb-gutter)] pb-4 pt-3">
        <div className="rounded-2xl border border-hairline bg-white p-3.5 shadow-[0_8px_28px_-12px_rgba(15,23,42,0.28)] sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[0.9rem] ring-1 ring-black/8 sm:h-14 sm:w-14 sm:rounded-[1rem]">
                <img
                  src={TANGBUY_LOGO_MARK}
                  alt=""
                  width={56}
                  height={56}
                  className="h-full w-full object-cover"
                  aria-hidden
                />
              </span>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-semibold tracking-tight text-ink sm:text-[15px]">
                  {t("handoff.appName")}
                </p>
                <p className="mt-0.5 truncate text-xs text-ink-muted">
                  {t("handoff.appStoreBadge")}
                  <span className="mx-1.5 text-ink-subtle" aria-hidden>
                    ·
                  </span>
                  <a
                    href={webHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-link hover:underline"
                    onClick={(e) => {
                      e.preventDefault();
                      openExternal(webHref, { newTab: true });
                    }}
                  >
                    {t("handoff.openWeb")}
                  </a>
                </p>
                <p className="mt-1 hidden text-xs leading-snug text-ink-muted sm:line-clamp-2 sm:block">
                  {t("handoff.appBlurb")}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-stretch lg:flex-row lg:items-center">
              <Button
                variant="primary"
                className="h-10 flex-1 px-4 text-sm sm:flex-none"
                asChild
              >
                <a
                  href={appStoreHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("handoff.installAria")}
                  onClick={(e) => {
                    e.preventDefault();
                    openExternal(appStoreHref, { newTab: true });
                  }}
                >
                  {t("handoff.installCta")}
                  <ExternalLink className="h-3.5 w-3.5 opacity-90" aria-hidden />
                </a>
              </Button>
              <a
                href={TANGBUY_OFFICIAL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden px-1 text-xs text-ink-subtle hover:text-ink-muted hover:underline sm:inline"
              >
                {t("handoff.learnMoreOfficial")}
              </a>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function CompletionScreen(
  props: Omit<Parameters<typeof TangbuyHandoffScreen>[0], "mode">
) {
  return <TangbuyHandoffScreen {...props} mode="complete" />;
}
