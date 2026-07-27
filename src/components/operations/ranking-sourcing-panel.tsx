// 榜单 → 找同款 → 加入 Tangbuy → 上架 Shopify。
// 图搜走 image-aop（无需 Shopify 镜像）；无结果时用标题关键词再试一轮（对齐商品关联图搜的 title tier）。
"use client";

import { useCallback, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, Search } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { CoverThumb } from "@/components/operations/cover-thumb";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { api } from "@/lib/api";
import { imageSearchCountryForLocale } from "@/lib/batch-link/1688-title-locale";
import { markCatalogPublished } from "@/lib/batch-link/publish-source";
import { queuePublishReveal } from "@/lib/batch-link/publish-reveal";
import { PRICING_TEMPLATE_REQUIRED } from "@/lib/listing-pricing";
import { search1688OffersByKeyword } from "@/lib/sourcing/search-1688";
import {
  continuePublishAfterPoolInBackground,
  publishSourcingHit,
  type PublishSourcingPhase,
} from "@/lib/sourcing/publish-sourcing-hit";
import type { SourcingSearchHit } from "@/lib/sourcing/types";
import type { PricingTemplate } from "@/lib/types";

const MAX_HITS = 8;
/** 与后端 SearchImageResolver.MAX_QUERY_LEN 对齐，避免过长英文标题干扰召回 */
const MAX_TITLE_QUERY_LEN = 30;

const PHASE_KEY: Record<PublishSourcingPhase, string> = {
  preparing: "ops.discovery.board.sourcePhasePreparing",
  pool_ingest: "ops.discovery.board.sourcePhasePool",
  pool_poll: "ops.discovery.board.sourcePhasePool",
  publishing: "ops.discovery.board.sourcePhasePublishing",
  done: "ops.discovery.board.sourcePhasePublishing",
  failed: "ops.discovery.board.sourcePhasePublishing",
};

type SearchState = "idle" | "loading" | "done" | "failed";

interface PublishState {
  phase?: PublishSourcingPhase;
  published?: boolean;
  pending?: boolean;
  error?: string;
}

function titleQuery(title: string): string {
  const normalized = title.replace(/\s+/g, " ").trim();
  if (normalized.length < 2) return "";
  return normalized.length > MAX_TITLE_QUERY_LEN
    ? normalized.slice(0, MAX_TITLE_QUERY_LEN)
    : normalized;
}

export function RankingSourcingPanel({
  shopName,
  title,
  imageUrl,
}: {
  shopName?: string | null;
  title: string;
  imageUrl?: string | null;
}) {
  const t = useT();
  const locale = useLocale();
  const [state, setState] = useState<SearchState>("idle");
  const [hits, setHits] = useState<SourcingSearchHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [publishById, setPublishById] = useState<Record<string, PublishState>>({});
  const templateRef = useRef<PricingTemplate | null | undefined>(undefined);

  const shop = shopName?.trim() || "";
  const seed = imageUrl?.trim() || "";

  const runSearch = useCallback(async () => {
    if (!seed) return;
    setState("loading");
    setError(null);
    setPublishById({});
    const country = imageSearchCountryForLocale(locale);
    try {
      // 1) 纯图搜（后端对非 alicdn 会先 upload→imageId）
      let found = await search1688OffersByKeyword("", {
        seedImageUrl: seed,
        country,
        size: MAX_HITS,
      });
      // 2) 空结果时用截断标题再搜（对齐商品关联链路的 title tier；无 LLM）
      const kw = titleQuery(title);
      if (found.length === 0 && kw) {
        found = await search1688OffersByKeyword(kw, {
          seedImageUrl: seed,
          country,
          size: MAX_HITS,
        });
      }
      setHits(found.slice(0, MAX_HITS));
      setState(found.length > 0 ? "done" : "failed");
    } catch (err) {
      setHits([]);
      setError(err instanceof Error ? err.message : t("ops.discovery.board.sourceFailed"));
      setState("failed");
    }
  }, [seed, title, locale, t]);
  const handlePublish = useCallback(
    async (hit: SourcingSearchHit) => {
      if (!shop) return;
      if (publishById[hit.hitId]?.phase && !publishById[hit.hitId]?.error) return;
      if (!window.confirm(t("ops.discovery.board.sourceConfirm", { title: hit.title, shop }))) {
        return;
      }

      setPublishById((prev) => ({ ...prev, [hit.hitId]: { phase: "preparing" } }));

      const finishPublished = (
        productId: string,
        catalogItem: NonNullable<Awaited<ReturnType<typeof publishSourcingHit>>["catalogItem"]>
      ) => {
        markCatalogPublished(shop, productId);
        queuePublishReveal(shop, productId, catalogItem);
        setPublishById((prev) => ({ ...prev, [hit.hitId]: { published: true } }));
      };

      try {
        if (templateRef.current === undefined) {
          templateRef.current = await api.getPricingTemplate(shop).catch(() => null);
        }
        const outcome = await publishSourcingHit({
          hit,
          shopName: shop,
          template: templateRef.current,
          onPhase: (phase) => {
            // 入库轮询阶段立刻切到「可离开」态，不再转圈等待
            if (phase === "pool_poll") {
              setPublishById((prev) => ({ ...prev, [hit.hitId]: { pending: true } }));
              return;
            }
            setPublishById((prev) => ({
              ...prev,
              [hit.hitId]: { ...prev[hit.hitId], phase, error: undefined },
            }));
          },
        });

        if (outcome.awaitingPool) {
          setPublishById((prev) => ({ ...prev, [hit.hitId]: { pending: true } }));
          continuePublishAfterPoolInBackground(
            {
              hit,
              shopName: shop,
              template: templateRef.current,
            },
            {
              onPublished: (productId, catalogItem) => {
                finishPublished(productId, catalogItem);
              },
              onPublishing: () => {
                setPublishById((prev) => ({
                  ...prev,
                  [hit.hitId]: { pending: true },
                }));
              },
            }
          );
          return;
        }

        if (!outcome.ok || !outcome.result) {
          throw new Error(
            outcome.error === PRICING_TEMPLATE_REQUIRED
              ? t("catalogPublish.pricingRequired")
              : t("ops.discovery.board.sourcePublishFailed")
          );
        }

        const productId = outcome.result.shopifyProductId?.trim();
        if (outcome.result.publishStatus === "PUBLISHED" && productId && outcome.catalogItem) {
          finishPublished(productId, outcome.catalogItem);
        } else if (outcome.result.publishStatus === "PUBLISHING") {
          setPublishById((prev) => ({ ...prev, [hit.hitId]: { pending: true } }));
        } else if (outcome.result.publishStatus === "PUBLISHED" && productId) {
          markCatalogPublished(shop, productId);
          setPublishById((prev) => ({ ...prev, [hit.hitId]: { published: true } }));
        } else {
          throw new Error(t("ops.discovery.board.sourcePublishFailed"));
        }
      } catch (err) {
        setPublishById((prev) => ({
          ...prev,
          [hit.hitId]: {
            error: t("ops.discovery.board.sourcePublishFailed"),
          },
        }));
      }
    },
    [shop, publishById, t]
  );

  if (!seed) return null;

  return (
    <div className="rounded border border-hairline bg-surface p-2.5">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-[12px] font-medium text-ink">
          {t("ops.discovery.board.sourceTitle")}
        </p>
        {state !== "idle" && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 w-7 shrink-0 px-0"
            disabled={state === "loading"}
            onClick={() => void runSearch()}
            title={t("ops.discovery.board.sourceRetry")}
            aria-label={t("ops.discovery.board.sourceRetry")}
          >
            {state === "loading" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
      </div>
      <p className="mt-0.5 text-[10px] leading-4 text-ink-subtle">
        {t("ops.discovery.board.sourceHint")}
      </p>

      {state === "idle" && (
        <Button
          type="button"
          size="sm"
          className="mt-2 w-full"
          onClick={() => void runSearch()}
        >
          <Search className="h-3.5 w-3.5" />
          {t("ops.discovery.board.sourceFind")}
        </Button>
      )}

      {state === "loading" && (
        <div className="mt-2 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded bg-surface-muted" />
          ))}
        </div>
      )}

      {state === "failed" && (
        <p className={`mt-2 text-[11px] ${error ? "text-destructive" : "text-ink-subtle"}`}>
          {error || t("ops.discovery.board.sourceEmpty")}
        </p>
      )}

      {state === "done" && (
        <ul className="mt-2 space-y-2">
          {hits.map((hit) => {
            const ps = publishById[hit.hitId];
            const busy =
              Boolean(ps?.phase) &&
              !ps?.error &&
              !ps?.pending &&
              !ps?.published &&
              ps?.phase !== "pool_poll";
            return (
              <li key={hit.hitId} className="flex gap-2 rounded border border-hairline p-1.5">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded bg-surface-muted">
                  <CoverThumb src={hit.imageUrl ?? undefined} label={hit.title} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[11px] leading-4 text-ink" title={hit.title}>
                    {hit.title}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-ink-subtle">
                    <span className="font-medium tabular-nums text-ink">
                      {hit.costCny != null ? `¥${hit.costCny.toFixed(2)}` : "—"}
                    </span>
                    {hit.supplierShop && <span className="truncate">{hit.supplierShop}</span>}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    {ps?.published ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {t("ops.discovery.board.sourcePublished")}
                      </span>
                    ) : ps?.pending ? (
                      <span className="text-[11px] text-ink-subtle">
                        {t("ops.discovery.board.sourcePublishPending")}
                      </span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={!shop || busy}
                        onClick={() => void handlePublish(hit)}
                        title={shop ? undefined : t("ops.discovery.board.sourceNoShop")}
                      >
                        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {busy
                          ? t(PHASE_KEY[ps?.phase ?? "preparing"])
                          : t("ops.discovery.board.sourceAdd")}
                      </Button>
                    )}
                    {hit.detailUrl1688 && (
                      <a
                        href={hit.detailUrl1688}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 text-[11px] text-link hover:underline"
                      >
                        {t("ops.discovery.board.sourceOpenOffer")}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  {ps?.error && <p className="mt-1 text-[10px] text-destructive">{ps.error}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
