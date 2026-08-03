"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/LocaleProvider";
import { readableError } from "@/lib/api";
import { listCampaigns } from "@/lib/bundle/campaign-api";
import type {
  BundleCampaign,
  BundleHubSeed,
  BundlePlayType,
} from "@/lib/bundle/campaign-types";
import { isBundleParentKit, type BundleStatusMap } from "@/lib/bundle/api";
import { BundleComposerDrawer } from "@/components/select/bundle-composer-drawer";
import { PlayTypePicker } from "@/components/bundle-hub/play-type-picker";
import { MixCampaignEditor } from "@/components/bundle-hub/mix-campaign-editor";
import { ByobEditor } from "@/components/bundle-hub/byob-editor";
import { OfferWizard } from "@/components/bundle-hub/offer-wizard";
import type {
  ImageBindingView,
  PricingTemplate,
  ShopMirrorProduct,
} from "@/lib/types";
import { ArrowLeft, Loader2, Plus, RefreshCw } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

type HubMode =
  | { kind: "list" }
  | { kind: "pick" }
  | { kind: "fixed"; productId: string }
  | { kind: "mix"; campaign?: BundleCampaign | null }
  | { kind: "byob"; campaign?: BundleCampaign | null }
  | { kind: "offer"; productId: string };

function playLabel(
  t: (k: string, params?: Record<string, string | number>) => string,
  play: BundlePlayType
): string {
  switch (play) {
    case "fixed_kit":
      return t("bundleHub.playFixedTitle");
    case "mix_match":
      return t("bundleHub.playMixTitle");
    case "byob":
      return t("bundleHub.playByobTitle");
    case "product_offer":
      return t("bundleHub.playOfferTitle");
    default:
      return play;
  }
}

function statusLabel(
  t: (k: string, params?: Record<string, string | number>) => string,
  status: string
): string {
  switch (status) {
    case "ACTIVE":
      return t("bundleHub.statusActive");
    case "DRAFT":
      return t("bundleHub.statusDraft");
    case "ARCHIVED":
      return t("bundleHub.statusArchived");
    case "COMING_SOON":
      return t("bundleHub.statusComingSoon");
    case "FAILED":
      return t("bundleHub.statusFailed");
    case "STALE":
      return t("bundleHub.statusStale");
    case "CREATING":
      return t("bundleHub.statusCreating");
    default:
      return status;
  }
}

export function BundleHubPanel({
  shopName,
  shopDomain,
  catalog,
  bindings,
  pricingTemplate,
  seed,
  onSeedConsumed,
  onClose,
  onToast,
  onActivity,
}: {
  shopName: string;
  shopDomain?: string | null;
  catalog: ShopMirrorProduct[];
  bindings: Record<string, ImageBindingView>;
  pricingTemplate?: PricingTemplate | null;
  seed?: BundleHubSeed | null;
  onSeedConsumed?: () => void;
  /** Leave hub overlay and return to Shopify product list. */
  onClose?: () => void;
  onToast?: (msg: string) => void;
  onActivity?: () => void;
}) {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<BundleCampaign[]>([]);
  const [statusMap, setStatusMap] = useState<BundleStatusMap | null>(null);
  const [mode, setMode] = useState<HubMode>({ kind: "list" });
  const [seedProductId, setSeedProductId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listCampaigns(shopName);
      setCampaigns(res.campaigns);
      setStatusMap(res.statusMap);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [shopName]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!seed?.productId) return;
    const pid = seed.productId;
    setSeedProductId(pid);
    const card = statusMap?.byProductId?.[pid];
    if (isBundleParentKit(card) || card?.status === "FAILED") {
      setMode({ kind: "fixed", productId: pid });
    } else {
      setMode({ kind: "pick" });
    }
    onSeedConsumed?.();
  }, [seed?.productId, statusMap, onSeedConsumed]);

  const catalogById = useMemo(() => {
    const m = new Map<string, ShopMirrorProduct>();
    for (const p of catalog) m.set(p.thirdPlatformItemId, p);
    return m;
  }, [catalog]);

  const seedProductForOffer = useMemo(() => {
    if (mode.kind !== "offer") return null;
    return catalogById.get(mode.productId) ?? null;
  }, [catalogById, mode]);

  const fixedContext = useMemo(() => {
    if (mode.kind !== "fixed") return null;
    return catalogById.get(mode.productId) ?? null;
  }, [catalogById, mode]);

  const onPick = (type: BundlePlayType) => {
    const productId = seedProductId ?? catalog[0]?.thirdPlatformItemId;
    if (type === "fixed_kit") {
      if (!productId) {
        onToast?.(t("bundleHub.errNeedProduct"));
        return;
      }
      setMode({ kind: "fixed", productId });
      return;
    }
    if (type === "mix_match") {
      setMode({ kind: "mix", campaign: null });
      return;
    }
    if (type === "byob") {
      setMode({ kind: "byob", campaign: null });
      return;
    }
    if (type === "product_offer") {
      if (!productId) {
        onToast?.(t("bundleHub.errNeedProduct"));
        return;
      }
      setMode({ kind: "offer", productId });
    }
  };

  const header = (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{t("bundleHub.title")}</h2>
        <p className="text-[11px] text-ink-muted">{t("bundleHub.subtitle")}</p>
      </div>
      <div className="flex items-center gap-1.5">
        {mode.kind !== "list" ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 gap-1"
            onClick={() => setMode({ kind: "list" })}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("bundleHub.back")}
          </Button>
        ) : (
          <>
            {onClose ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-7 gap-1"
                onClick={onClose}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {t("bundleHub.backToProducts")}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 w-7 px-0"
              title={t("bundleHub.refresh")}
              aria-label={t("bundleHub.refresh")}
              onClick={() => void reload()}
              disabled={loading}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1"
              onClick={() => setMode({ kind: "pick" })}
            >
              <Plus className="h-3.5 w-3.5" />
              {t("bundleHub.create")}
            </Button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-[420px] flex-col rounded-[var(--radius-card)] border border-hairline bg-surface p-3 sm:p-4">
      {header}

      {mode.kind === "list" ? (
        <>
          {error ? <p className="mb-2 text-[12px] text-red-600">{error}</p> : null}
          {loading ? (
            <div className="flex flex-1 items-center justify-center py-16 text-ink-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <ul className="divide-y divide-hairline rounded-lg border border-hairline">
              {campaigns.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-ink">{c.title}</p>
                    <p className="text-[11px] text-ink-muted">
                      {playLabel(t, c.playType)}
                      {" · "}
                      {statusLabel(t, c.status)}
                      {c.poolCount != null && c.poolCount > 0
                        ? ` · ${t("bundleHub.listPoolCount", { count: c.poolCount })}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {c.playType === "fixed_kit" && c.linkedBundleId != null ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7"
                        onClick={() => {
                          const refs = c.shopifyRefsJson
                            ? (JSON.parse(c.shopifyRefsJson) as {
                                contextHint?: string;
                              })
                            : {};
                          const pid =
                            refs.contextHint ||
                            catalog.find((p) => {
                              const card =
                                statusMap?.byProductId?.[p.thirdPlatformItemId];
                              return card?.bundleId === c.linkedBundleId;
                            })?.thirdPlatformItemId;
                          if (pid) setMode({ kind: "fixed", productId: pid });
                        }}
                      >
                        {t("bundleHub.open")}
                      </Button>
                    ) : null}
                    {c.playType === "mix_match" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7"
                        onClick={() => setMode({ kind: "mix", campaign: c })}
                      >
                        {t("bundleHub.open")}
                      </Button>
                    ) : null}
                    {c.playType === "byob" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7"
                        onClick={() => setMode({ kind: "byob", campaign: c })}
                      >
                        {c.status === "COMING_SOON"
                          ? t("bundleHub.setupByob")
                          : t("bundleHub.open")}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}

      {mode.kind === "pick" ? (
        <div className="space-y-3">
          <p className="text-[12px] text-ink-muted">{t("bundleHub.pickHint")}</p>
          <PlayTypePicker onSelect={onPick} />
        </div>
      ) : null}

      {mode.kind === "mix" ? (
        <MixCampaignEditor
          shopName={shopName}
          catalog={catalog}
          bindings={bindings}
          seedProductIds={seedProductId ? [seedProductId] : undefined}
          initial={mode.campaign}
          onCancel={() => setMode({ kind: "list" })}
          onSaved={() => {
            onToast?.(t("bundleHub.mixSaved"));
            setMode({ kind: "list" });
            void reload();
            onActivity?.();
          }}
        />
      ) : null}

      {mode.kind === "byob" ? (
        <ByobEditor
          shopName={shopName}
          catalog={catalog}
          bindings={bindings}
          initial={mode.campaign}
          onCancel={() => setMode({ kind: "list" })}
          onSaved={() => {
            onToast?.(t("bundleHub.byobSaved"));
            setMode({ kind: "list" });
            void reload();
            onActivity?.();
          }}
        />
      ) : null}

      {mode.kind === "offer" && seedProductForOffer ? (
        <OfferWizard
          shopName={shopName}
          product={seedProductForOffer}
          catalog={catalog}
          bindings={bindings}
          onClose={() => setMode({ kind: "list" })}
          onSaved={(msg) => {
            onToast?.(msg);
            onActivity?.();
          }}
        />
      ) : null}

      {mode.kind === "fixed" && fixedContext ? (
        <BundleComposerDrawer
          open
          shopName={shopName}
          shopDomain={shopDomain}
          contextProduct={fixedContext}
          catalog={catalog}
          feature={statusMap?.feature ?? null}
          existing={statusMap?.byProductId?.[mode.productId] ?? null}
          statusMap={statusMap}
          bindings={bindings}
          pricingTemplate={pricingTemplate}
          lockedTrack="cross"
          onClose={() => setMode({ kind: "list" })}
          onCreated={() => {
            onToast?.(t("bundle.toastCreated"));
            setMode({ kind: "list" });
            void reload();
            onActivity?.();
          }}
          onDissolved={() => {
            onToast?.(t("bundleHub.toastDissolved"));
            setMode({ kind: "list" });
            void reload();
            onActivity?.();
          }}
        />
      ) : null}
    </div>
  );
}
