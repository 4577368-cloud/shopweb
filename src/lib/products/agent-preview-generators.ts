import { api } from "@/lib/api";
import { resolveTitleCopyStyle } from "@/lib/products/resolve-title-copy-style";
import type { ProductsCommandLabels } from "@/lib/products/agent-command-labels";
import type { ProductsTranslateFn } from "@/lib/products/agent-command-types";
import {
  getSourcingSession,
  resolveHitByListIndex,
} from "@/lib/sourcing/session";
import {
  formatStatusTransition,
  normalizeShopStatus,
  type ShopifyListingStatusTarget,
} from "@/lib/shop-product-status";

export interface CreateProductsPreviewGeneratorsOpts {
  t: ProductsTranslateFn;
  labels: ProductsCommandLabels;
  sessionShopName: string;
}

export function createProductsPreviewGenerators({
  t,
  labels,
  sessionShopName,
}: CreateProductsPreviewGeneratorsOpts) {
  return {
      update_product_copy: async (plan: any, shopName: string) => {
        const productId = plan.draft.productId ?? plan.draft.params.productId;
        const copyField = plan.draft.params.copyField ?? "title";
        const copyAction = plan.draft.params.copyAction ?? "translate";
        const targetLang = plan.draft.params.copyTargetLang ?? "en";
        const copyStyle = plan.draft.params.copyStyle;

        const detail = await api.getShopProductDetail(shopName, productId);
        const originalTitle = detail.title ?? "";
        let translatedText = "";
        const style = resolveTitleCopyStyle(copyAction, copyStyle);

        if (copyAction === "translate") {
          const result = await api.translateText(
            originalTitle,
            targetLang,
            undefined,
            style
          );
          if (!result.success || !result.translatedText) {
            throw new Error(result.error ?? t("productsPreview.errTitleGenFailed"));
          }
          translatedText = result.translatedText;
        } else {
          throw new Error(t("productsPreview.errCopyNotImplemented"));
        }

        const fieldLabel = labels.previewFieldLabel(copyField);
        const modeNote = labels.previewModeNote(style);

        return {
          sections: [
            {
              rows: [
                {
                  label: fieldLabel,
                  before: originalTitle,
                  after: translatedText,
                },
              ],
            },
          ],
          extraNote: `${modeNote}${copyField === "all" ? ` · ${t("productsPreview.updateTitleAndDesc")}` : ""}`.trim(),
          impact: {
            scope: t("productsPreview.scopeOneProduct", { field: fieldLabel }),
            durationHint: t("productsPreview.durationTwoSec"),
            reversible: true,
            riskNote: undefined,
          },
          payload: {
            productId,
            copyField,
            copyAction,
            targetLang,
            copyStyle: style,
            previewText: translatedText,
          },
        };
      },
      batch_update_product_copy: async (plan: any, shopName: string) => {
        const productIds = plan.draft.params.batchProductIds ?? [];
        const copyField = plan.draft.params.copyField ?? "title";
        const copyAction = plan.draft.params.copyAction ?? "translate";
        const targetLang = plan.draft.params.copyTargetLang ?? "en";
        const copyStyle = plan.draft.params.copyStyle;
        const style = resolveTitleCopyStyle(copyAction, copyStyle);
        const totalCount = productIds.length;

        if (totalCount === 0) {
          throw new Error(t("productsPreview.errNoProducts"));
        }

        const sampleCount = Math.min(3, totalCount);
        const sampleRows: any[] = [];

        for (let i = 0; i < sampleCount; i++) {
          const productId = productIds[i];
          try {
            const detail = await api.getShopProductDetail(shopName, productId);
            const originalTitle = detail.title ?? "";
            let translatedText = "";

            if (copyAction === "translate") {
              const result = await api.translateText(
                originalTitle,
                targetLang,
                undefined,
                style
              );
              if (result.success && result.translatedText) {
                translatedText = result.translatedText;
              } else {
                translatedText = result.error ?? t("productsPreview.genFailed");
              }
            } else {
              translatedText = t("productsPreview.opNotImplemented");
            }

            sampleRows.push({
              label: t("productsPreview.productN", { n: i + 1 }),
              before: originalTitle,
              after: translatedText,
            });
          } catch {
            sampleRows.push({
              label: t("productsPreview.productN", { n: i + 1 }),
              before: t("productsPreview.readFailed"),
              after: t("productsPreview.readFailed"),
            });
          }
        }

        const fieldLabel = labels.previewFieldLabel(copyField);
        const actionLabel =
          copyAction === "translate"
            ? t("productsPreview.localizeTo", { lang: targetLang.toUpperCase() })
            : labels.copyActionLabel(copyAction, targetLang);
        const modeNote = labels.previewModeNote(style, true);

        const extraNote =
          (sampleCount < totalCount
            ? t("productsPreview.previewPartial", {
                sample: sampleCount,
                rest: totalCount - sampleCount,
              })
            : t("productsPreview.previewAll", { count: totalCount })) +
          ` · ${modeNote}`;

        const estimatedSeconds = Math.max(3, totalCount * 2);
        const durationHint = labels.previewDurationHint(estimatedSeconds);

        return {
          sections: [
            {
              title: t("productsPreview.batchCopyTitle", {
                action: actionLabel,
                count: totalCount,
              }),
              rows: sampleRows,
            },
          ],
          extraNote,
          impact: {
            scope: t("productsPreview.scopeBatchCopy", {
              count: totalCount,
              field: fieldLabel,
            }),
            durationHint,
            reversible: true,
            riskNote:
              totalCount > 10 ? t("productsPreview.riskBatchCopy") : undefined,
          },
          payload: {
            productIds,
            copyField,
            copyAction,
            targetLang,
            copyStyle: style,
            totalCount,
          },
        };
      },
      batch_update_listing_price: async (plan: any, shopName: string) => {
        const productIds = plan.draft.params.batchProductIds ?? [];
        const multiplier = plan.draft.params.batchPriceMultiplier;
        const fixedPrice = plan.draft.params.batchPriceFixed;
        const totalCount = productIds.length;

        if (totalCount === 0) {
          throw new Error(t("productsPreview.errNoProducts"));
        }

        const sampleCount = Math.min(3, totalCount);
        const sampleRows: any[] = [];

        for (let i = 0; i < sampleCount; i++) {
          const productId = productIds[i];
          try {
            const detail = await api.getShopProductDetail(shopName, productId);
            const title = detail.title ?? t("productsPreview.unknownProduct");
            const currentPrice = detail.minPrice ?? 0;
            let newPrice = 0;

            if (fixedPrice) {
              newPrice = fixedPrice;
            } else if (multiplier && detail.minPrice != null) {
              newPrice = detail.minPrice * multiplier;
            } else {
              newPrice = 0;
            }

            sampleRows.push({
              label: title,
              before:
                currentPrice > 0
                  ? `${currentPrice.toFixed(2)}`
                  : t("productsPreview.noPrice"),
              after:
                newPrice > 0
                  ? `${newPrice.toFixed(2)}`
                  : t("productsPreview.cannotCalc"),
            });
          } catch {
            sampleRows.push({
              label: t("productsPreview.productN", { n: i + 1 }),
              before: t("productsPreview.readFailed"),
              after: t("productsPreview.readFailed"),
            });
          }
        }

        const modeLabel = fixedPrice
          ? t("productsPreview.priceModeFixed", { price: fixedPrice })
          : t("productsPreview.priceModeMultiplier", { multiplier });

        const extraNote =
          sampleCount < totalCount
            ? t("productsPreview.previewPartial", {
                sample: sampleCount,
                rest: totalCount - sampleCount,
              })
            : t("productsPreview.previewAll", { count: totalCount });

        const estimatedSeconds = Math.max(3, totalCount * 2);
        const durationHint = labels.previewDurationHint(estimatedSeconds);

        return {
          sections: [
            {
              title: t("productsPreview.batchPriceTitle", {
                mode: modeLabel,
                count: totalCount,
              }),
              rows: sampleRows,
            },
          ],
          extraNote,
          impact: {
            scope: t("productsPreview.scopeBatchPrice", { count: totalCount }),
            durationHint,
            reversible: true,
            riskNote:
              totalCount > 10 ? t("productsPreview.riskBatchPrice") : undefined,
          },
          payload: {
            productIds,
            batchPriceMultiplier: multiplier,
            batchPriceFixed: fixedPrice,
            totalCount,
          },
        };
      },
      draft_product: async (plan: any, shopName: string) => {
        const productId = plan.draft.productId ?? plan.draft.params.productId;
        const detail = await api.getShopProductDetail(shopName, productId);
        const title =
          detail.title ?? plan.targetLabel ?? t("productsPreview.productFallback");
        const targetStatus: ShopifyListingStatusTarget = "DRAFT";
        return {
          sections: [
            {
              rows: [
                {
                  label: title,
                  before: normalizeShopStatus(detail.status),
                  after: targetStatus,
                },
              ],
            },
          ],
          extraNote: formatStatusTransition(detail.status, targetStatus, t),
          impact: {
            scope: t("productsPreview.scopeOneStatus"),
            durationHint: t("productsPreview.durationTwoSec"),
            reversible: true,
            riskNote: t("productsPreview.riskDraft"),
          },
          payload: {
            productId,
            productTitle: title,
            targetStatus,
          },
        };
      },
      archive_product: async (plan: any, shopName: string) => {
        const productId = plan.draft.productId ?? plan.draft.params.productId;
        const detail = await api.getShopProductDetail(shopName, productId);
        const title =
          detail.title ?? plan.targetLabel ?? t("productsPreview.productFallback");
        const targetStatus: ShopifyListingStatusTarget = "ARCHIVED";
        return {
          sections: [
            {
              rows: [
                {
                  label: title,
                  before: normalizeShopStatus(detail.status),
                  after: targetStatus,
                },
              ],
            },
          ],
          extraNote: formatStatusTransition(detail.status, targetStatus, t),
          impact: {
            scope: t("productsPreview.scopeOneStatus"),
            durationHint: t("productsPreview.durationTwoSec"),
            reversible: true,
            riskNote: t("productsPreview.riskArchive"),
          },
          payload: {
            productId,
            productTitle: title,
            targetStatus,
          },
        };
      },
      batch_draft_products: async (plan: any, shopName: string) => {
        const productIds = plan.draft.params.batchProductIds ?? [];
        const targetStatus: ShopifyListingStatusTarget = "DRAFT";
        const totalCount = productIds.length;
        if (totalCount === 0) throw new Error(t("productsPreview.errNoProducts"));

        const sampleCount = Math.min(3, totalCount);
        const sampleRows: Array<{ label: string; before: string; after: string }> = [];
        for (let i = 0; i < sampleCount; i++) {
          const productId = productIds[i];
          try {
            const detail = await api.getShopProductDetail(shopName, productId);
            sampleRows.push({
              label:
                detail.title ?? t("productsPreview.productN", { n: i + 1 }),
              before: normalizeShopStatus(detail.status),
              after: targetStatus,
            });
          } catch {
            sampleRows.push({
              label: t("productsPreview.productN", { n: i + 1 }),
              before: t("productsPreview.readFailed"),
              after: targetStatus,
            });
          }
        }

        return {
          sections: [
            {
              title: t("productsPreview.batchDraftTitle", { count: totalCount }),
              rows: sampleRows,
            },
          ],
          extraNote:
            sampleCount < totalCount
              ? t("productsPreview.previewPartialDraft", {
                  sample: sampleCount,
                  rest: totalCount - sampleCount,
                })
              : t("productsPreview.previewAllDraft", { count: totalCount }),
          impact: {
            scope: t("productsPreview.scopeBatchStatus", { count: totalCount }),
            durationHint: labels.previewDurationHint(Math.max(3, totalCount * 2)),
            reversible: true,
            riskNote:
              totalCount > 10 ? t("productsPreview.riskBatchArchive") : undefined,
          },
          payload: {
            productIds,
            targetStatus,
            totalCount,
          },
        };
      },
      batch_archive_products: async (plan: any, shopName: string) => {
        const productIds = plan.draft.params.batchProductIds ?? [];
        const targetStatus: ShopifyListingStatusTarget = "ARCHIVED";
        const totalCount = productIds.length;
        if (totalCount === 0) throw new Error(t("productsPreview.errNoProducts"));

        const sampleCount = Math.min(3, totalCount);
        const sampleRows: Array<{ label: string; before: string; after: string }> = [];
        for (let i = 0; i < sampleCount; i++) {
          const productId = productIds[i];
          try {
            const detail = await api.getShopProductDetail(shopName, productId);
            sampleRows.push({
              label:
                detail.title ?? t("productsPreview.productN", { n: i + 1 }),
              before: normalizeShopStatus(detail.status),
              after: targetStatus,
            });
          } catch {
            sampleRows.push({
              label: t("productsPreview.productN", { n: i + 1 }),
              before: t("productsPreview.readFailed"),
              after: targetStatus,
            });
          }
        }

        return {
          sections: [
            {
              title: t("productsPreview.batchArchiveTitle", { count: totalCount }),
              rows: sampleRows,
            },
          ],
          extraNote:
            sampleCount < totalCount
              ? t("productsPreview.previewPartialArchive", {
                  sample: sampleCount,
                  rest: totalCount - sampleCount,
                })
              : t("productsPreview.previewAllArchive", { count: totalCount }),
          impact: {
            scope: t("productsPreview.scopeBatchStatus", { count: totalCount }),
            durationHint: labels.previewDurationHint(Math.max(3, totalCount * 2)),
            reversible: true,
            riskNote:
              totalCount > 10 ? t("productsPreview.riskBatchArchive") : undefined,
          },
          payload: {
            productIds,
            targetStatus,
            totalCount,
          },
        };
      },
      publish_sourcing_item: async (plan: any) => {
        const hitId = plan.draft.params.sourcingItemHint as string | undefined;
        const index = plan.draft.params.sourcingListIndex as number | undefined;
        const session = getSourcingSession(sessionShopName);
        const hit =
          (hitId ? session?.hits.find((h) => h.hitId === hitId) : null) ??
          (index != null ? resolveHitByListIndex(sessionShopName, index) : null);
        if (!hit) throw new Error(t("agentProducts.clarifySourcingPublishTarget"));

        const currency =
          (plan.draft.params.sourcingCurrency as string | undefined) ?? "USD";
        const procurement = plan.draft.params.sourcingProcurementUsd as
          | number
          | null
          | undefined;
        const display = plan.draft.params.sourcingDisplayUsd as
          | number
          | null
          | undefined;

        const fmt = (n: number | null | undefined) =>
          n != null ? `${currency} ${n.toFixed(2)}` : "—";

        return {
          sections: [
            {
              title: hit.title,
              rows: [
                {
                  label: t("agentProducts.detailSourcingSource", {
                    source: hit.source,
                  }),
                  before: "",
                  after: hit.source === "1688" ? "1688" : "Tangbuy",
                },
                {
                  label: t("catalogCard.purchaseCost", {
                    price: fmt(procurement),
                  }),
                  before: "",
                  after: fmt(procurement),
                },
                {
                  label: t("catalogCard.suggestedPrice", {
                    price: fmt(display),
                  }),
                  before: "",
                  after: `${fmt(display)} (${hit.displayMultiplier}×)`,
                },
              ],
            },
          ],
          impact: {
            scope: t("agentProducts.opPublishSourcing"),
            durationHint: hit.source === "1688" ? "30–90s" : "10–30s",
            reversible: false,
            riskNote:
              hit.source === "1688"
                ? t("agentProducts.detailPoolWillIngest")
                : undefined,
          },
          payload: { hitId: hit.hitId },
        };
      },
  };
}
