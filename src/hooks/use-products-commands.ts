"use client";

import { useCallback, useMemo } from "react";
import {
  aiFieldEditKey,
  applyListingEditsToProducts,
  formatListingMoney,
  type AiFieldEditRecord,
  type AiFieldId,
} from "@/lib/ai-field-edit-feedback";
import { api, readableError } from "@/lib/api";
import { markCatalogPublished } from "@/lib/batch-link/publish-source";
import { queuePublishReveal } from "@/lib/batch-link/publish-reveal";
import { resolveTitleCopyStyle } from "@/lib/products/resolve-title-copy-style";
import { publishSourcingHit } from "@/lib/sourcing/publish-sourcing-hit";
import {
  getSourcingSession,
  resolveHitByListIndex,
} from "@/lib/sourcing/session";
import {
  formatStatusTransition,
  listingStatusLabel,
  normalizeShopStatus,
  writeShopProductStatus,
  type ShopifyListingStatusTarget,
} from "@/lib/shop-product-status";
import { mergeListingPriceRow, writeShopListingPrice } from "@/lib/shop-product-write";
import type { PricingTemplate, ShopMirrorProduct } from "@/lib/types";
import type { LoadSummaryFn } from "@/hooks/use-products-entry";

type TranslateFn = (
  key: string,
  params?: Record<string, string | number>
) => string;

export interface UseProductsCommandsParams {
  shopName: string;
  template: PricingTemplate | null;
  aiFieldEditsRef: React.RefObject<Record<string, AiFieldEditRecord>>;
  setAiFieldEdits: React.Dispatch<
    React.SetStateAction<Record<string, AiFieldEditRecord>>
  >;
  setShopProducts: React.Dispatch<React.SetStateAction<ShopMirrorProduct[]>>;
  loadSummary: LoadSummaryFn;
  bumpMirrorRefresh: () => void;
  showToast: (message: string) => void;
  t: TranslateFn;
}

export function useProductsCommands({
  shopName,
  template,
  aiFieldEditsRef,
  setAiFieldEdits,
  setShopProducts,
  loadSummary,
  bumpMirrorRefresh,
  showToast,
  t,
}: UseProductsCommandsParams) {
  const copyActionLabel = useCallback(
    (action: "translate" | "rewrite" | "optimize", targetLang?: string) => {
      if (action === "translate") {
        return t("productsPage.copyTranslate", {
          lang: targetLang?.toUpperCase() ?? "EN",
        });
      }
      if (action === "rewrite") return t("productsPage.copyRewrite");
      return t("productsPage.copyOptimize");
    },
    [t]
  );

  const previewFieldLabel = useCallback(
    (copyField: "title" | "description" | "all") => {
      if (copyField === "title") return t("productsPreview.fieldTitle");
      if (copyField === "description") return t("productsPreview.fieldDescription");
      return t("productsPreview.fieldAll");
    },
    [t]
  );

  const previewModeNote = useCallback(
    (style: "literal" | "amazon", short = false) =>
      style === "literal"
        ? short
          ? t("productsPreview.modeLiteralShort")
          : t("productsPreview.modeLiteral")
        : t("productsPreview.modeAmazon"),
    [t]
  );

  const previewDurationHint = useCallback(
    (estimatedSeconds: number) =>
      estimatedSeconds < 60
        ? t("productsPreview.durationSeconds", { seconds: estimatedSeconds })
        : t("productsPreview.durationMinutes", {
            minutes: Math.ceil(estimatedSeconds / 60),
          }),
    [t]
  );

  const clearAiFieldEdit = useCallback((productId: string, field: AiFieldId) => {
    setAiFieldEdits((prev) => {
      const key = aiFieldEditKey(productId, field);
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, [setAiFieldEdits]);

  const markAiFieldEdit = useCallback(
    (record: Omit<AiFieldEditRecord, "createdAt">) => {
      const key = aiFieldEditKey(record.productId, record.field);
      setAiFieldEdits((prev) => ({
        ...prev,
        [key]: { ...record, createdAt: Date.now() },
      }));
    },
    [setAiFieldEdits]
  );

  const executeListingPriceUpdate = useCallback(
    async (req: {
      productId: string;
      price: number;
      currency: string;
      variantScope: "all" | "one";
      variantSkuId?: string;
    }) => {
      const target =
        req.variantScope === "all"
          ? ({ scope: "all" } as const)
          : ({
              scope: "one",
              thirdPlatformSkuId: req.variantSkuId!,
            } as const);
      const { detail, previousPrice, variantScope } = await writeShopListingPrice(
        shopName,
        req.productId,
        req.price,
        target
      );
      const currency = req.currency || detail.currency || "USD";
      const editRecord: AiFieldEditRecord = {
        productId: req.productId,
        field: "listingPrice",
        previousValue: previousPrice,
        nextValue: req.price,
        previousDisplay: formatListingMoney(previousPrice, currency),
        nextDisplay: formatListingMoney(req.price, currency),
        currency,
        createdAt: Date.now(),
      };
      const editsWithCurrent = {
        ...aiFieldEditsRef.current,
        [aiFieldEditKey(req.productId, "listingPrice")]: editRecord,
      };
      aiFieldEditsRef.current = editsWithCurrent;
      setAiFieldEdits(editsWithCurrent);

      await loadSummary();
      setShopProducts((prev) =>
        applyListingEditsToProducts(
          prev.map((p) =>
            p.thirdPlatformItemId === req.productId
              ? mergeListingPriceRow(
                  p,
                  detail,
                  req.price,
                  previousPrice,
                  variantScope
                )
              : p
          ),
          editsWithCurrent
        )
      );
      bumpMirrorRefresh();
      showToast(
        t("productsPage.toastTitleUpdated", {
          title: detail.title ?? t("productsPage.productFallback"),
          currency,
          price: req.price.toFixed(2),
        })
      );
    },
    [bumpMirrorRefresh, loadSummary, shopName, showToast, t]
  );

  const executeProductCopyUpdate = useCallback(
    async (req: {
      productId: string;
      copyField: "title" | "description" | "all";
      copyAction: "translate" | "rewrite" | "optimize";
      targetLang?: string;
      copyStyle?: "amazon" | "literal";
      tone?: string;
      previewText: string;
    }) => {
      if (req.copyField === "title" || req.copyField === "all") {
        try {
          const detail = await api.getShopProductDetail(shopName, req.productId);
          const previousTitle = detail.title ?? "";
          const style = resolveTitleCopyStyle(req.copyAction, req.copyStyle);
          const translated =
            req.previewText?.trim() ||
            (
              await api.translateText(
                previousTitle,
                req.targetLang,
                undefined,
                style
              )
            ).translatedText ||
            "";
          if (!translated) {
            throw new Error(t("productsPreview.errTitleGenFailed"));
          }
          const result = await api.updateShopProduct(shopName, {
            itemId: req.productId,
            title: translated,
          });
          const nextTitle = result.title ?? translated;
          const editRecord: AiFieldEditRecord = {
            productId: req.productId,
            field: "title",
            previousDisplay: previousTitle || "—",
            nextDisplay: nextTitle,
            createdAt: Date.now(),
          };
          const editsWithCurrent = {
            ...aiFieldEditsRef.current,
            [aiFieldEditKey(req.productId, "title")]: editRecord,
          };
          aiFieldEditsRef.current = editsWithCurrent;
          setAiFieldEdits(editsWithCurrent);
          setShopProducts((prev) =>
            prev.map((p) =>
              p.thirdPlatformItemId === req.productId
                ? { ...p, title: nextTitle }
                : p
            )
          );
          bumpMirrorRefresh();
          await loadSummary();
          const actionLabel = copyActionLabel(req.copyAction, req.targetLang);
          showToast(
            t("productsPage.toastTitleCopyUpdated", { action: actionLabel })
          );
        } catch (err) {
          showToast(readableError(err) || t("productsPage.toastTitleCopyFailed"));
          throw err;
        }
      }
    },
    [bumpMirrorRefresh, loadSummary, shopName, showToast, t, copyActionLabel]
  );

  const executeBatchProductCopyUpdate = useCallback(
    async (req: {
      productIds: string[];
      copyField: "title" | "description" | "all";
      copyAction: "translate" | "rewrite" | "optimize";
      targetLang?: string;
      copyStyle?: "amazon" | "literal";
      tone?: string;
      onProgress?: (current: number, total: number, success: number, failed: number) => void;
    }) => {
      const { productIds, copyField, copyAction, targetLang, copyStyle, onProgress } = req;
      const style = resolveTitleCopyStyle(copyAction, copyStyle);
      const total = productIds.length;
      let success = 0;
      let failed = 0;

      for (let i = 0; i < total; i++) {
        const productId = productIds[i];
        try {
          const detail = await api.getShopProductDetail(shopName, productId);
          const originalTitle = detail.title ?? "";
          let newText = "";

          if (copyAction === "translate") {
            const result = await api.translateText(
              originalTitle,
              targetLang,
              undefined,
              style
            );
            if (result.success && result.unchanged) {
              success++;
              onProgress?.(i + 1, total, success, failed);
              continue;
            }
            if (result.success && result.translatedText) {
              newText = result.translatedText;
            } else {
              throw new Error(result.error ?? t("productsPreview.errTitleLocalizeFailed"));
            }
          } else {
            throw new Error(t("productsPreview.errCopyNotImplemented"));
          }

          if (copyField === "title" || copyField === "all") {
            const updateResult = await api.updateShopProduct(shopName, {
              itemId: productId,
              title: newText,
            });
            const nextTitle = updateResult.title ?? newText;
            const editRecord: AiFieldEditRecord = {
              productId,
              field: "title",
              previousDisplay: originalTitle || "—",
              nextDisplay: nextTitle,
              createdAt: Date.now(),
            };
            const editsWithCurrent = {
              ...aiFieldEditsRef.current,
              [aiFieldEditKey(productId, "title")]: editRecord,
            };
            aiFieldEditsRef.current = editsWithCurrent;
            setAiFieldEdits(editsWithCurrent);
            setShopProducts((prev) =>
              prev.map((p) =>
                p.thirdPlatformItemId === productId
                  ? { ...p, title: nextTitle }
                  : p
              )
            );
          }

          success++;
        } catch {
          failed++;
        }

        onProgress?.(i + 1, total, success, failed);
      }

      bumpMirrorRefresh();
      await loadSummary();

      const actionLabel = copyActionLabel(copyAction, targetLang);
      showToast(
        t("productsPage.toastBatchCopyDone", {
          action: actionLabel,
          success,
          failed,
        })
      );
    },
    [bumpMirrorRefresh, loadSummary, shopName, showToast, t, copyActionLabel]
  );

  const executeBatchListingPriceUpdate = useCallback(
    async (req: {
      productIds: string[];
      batchPriceMultiplier?: number;
      batchPriceFixed?: number;
      onProgress?: (current: number, total: number, success: number, failed: number) => void;
    }) => {
      const { productIds, batchPriceMultiplier, batchPriceFixed, onProgress } = req;
      const total = productIds.length;
      let success = 0;
      let failed = 0;

      for (let i = 0; i < total; i++) {
        const productId = productIds[i];
        try {
          const detail = await api.getShopProductDetail(shopName, productId);
          let targetPrice = 0;

          if (batchPriceFixed) {
            targetPrice = batchPriceFixed;
          } else if (batchPriceMultiplier && detail.minPrice != null) {
            targetPrice = detail.minPrice * batchPriceMultiplier;
          } else {
            throw new Error(t("productsPreview.errCannotCalcPrice"));
          }

          const target = { scope: "all" } as const;
          await writeShopListingPrice(shopName, productId, targetPrice, target);
          success++;
        } catch {
          failed++;
        }

        onProgress?.(i + 1, total, success, failed);
      }

      bumpMirrorRefresh();
      await loadSummary();

      const modeLabel = batchPriceFixed
        ? t("productsPage.priceModeFixed", { price: batchPriceFixed })
        : t("productsPage.priceModeMultiplier", {
            multiplier: batchPriceMultiplier ?? 1,
          });
      showToast(
        t("productsPage.toastBatchPriceDone", {
          mode: modeLabel,
          success,
          failed,
        })
      );
    },
    [bumpMirrorRefresh, loadSummary, shopName, showToast, t]
  );

  const applyLocalProductStatus = useCallback(
    (productId: string, status: ShopifyListingStatusTarget) => {
      setShopProducts((prev) =>
        prev.map((p) =>
          p.thirdPlatformItemId === productId ? { ...p, status } : p
        )
      );
    },
    []
  );

  const executeProductStatusUpdate = useCallback(
    async (req: {
      productId: string;
      productTitle: string;
      targetStatus: ShopifyListingStatusTarget;
    }) => {
      const detail = await writeShopProductStatus(
        shopName,
        req.productId,
        req.targetStatus
      );
      applyLocalProductStatus(req.productId, req.targetStatus);
      bumpMirrorRefresh();
      await loadSummary();
      showToast(
        t("productsPage.toastListingUpdated", {
          title: detail.title ?? req.productTitle,
          status: listingStatusLabel(t, req.targetStatus),
        })
      );
    },
    [applyLocalProductStatus, bumpMirrorRefresh, loadSummary, shopName, showToast, t]
  );

  const executeBatchProductStatusUpdate = useCallback(
    async (req: {
      productIds: string[];
      targetStatus: ShopifyListingStatusTarget;
      onProgress?: (current: number, total: number, success: number, failed: number) => void;
    }) => {
      const { productIds, targetStatus, onProgress } = req;
      const total = productIds.length;
      let success = 0;
      let failed = 0;

      for (let i = 0; i < total; i++) {
        const productId = productIds[i]!;
        try {
          const detail = await api.getShopProductDetail(shopName, productId);
          if (normalizeShopStatus(detail.status) === targetStatus) {
            success++;
            onProgress?.(i + 1, total, success, failed);
            continue;
          }
          await writeShopProductStatus(shopName, productId, targetStatus);
          applyLocalProductStatus(productId, targetStatus);
          success++;
        } catch {
          failed++;
        }
        onProgress?.(i + 1, total, success, failed);
      }

      bumpMirrorRefresh();
      await loadSummary();
      showToast(
        t("productsPage.toastBatchListingDone", {
          status: listingStatusLabel(t, targetStatus),
          success,
          failed,
        })
      );
    },
    [applyLocalProductStatus, bumpMirrorRefresh, loadSummary, shopName, showToast, t]
  );

  const previewGenerators = useMemo(
    () => ({
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

        const fieldLabel = previewFieldLabel(copyField);
        const modeNote = previewModeNote(style);

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

        const fieldLabel = previewFieldLabel(copyField);
        const actionLabel =
          copyAction === "translate"
            ? t("productsPreview.localizeTo", { lang: targetLang.toUpperCase() })
            : copyActionLabel(copyAction, targetLang);
        const modeNote = previewModeNote(style, true);

        const extraNote =
          (sampleCount < totalCount
            ? t("productsPreview.previewPartial", {
                sample: sampleCount,
                rest: totalCount - sampleCount,
              })
            : t("productsPreview.previewAll", { count: totalCount })) +
          ` · ${modeNote}`;

        const estimatedSeconds = Math.max(3, totalCount * 2);
        const durationHint = previewDurationHint(estimatedSeconds);

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
        const durationHint = previewDurationHint(estimatedSeconds);

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
            durationHint: previewDurationHint(Math.max(3, totalCount * 2)),
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
            durationHint: previewDurationHint(Math.max(3, totalCount * 2)),
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
        const session = getSourcingSession(shopName);
        const hit =
          (hitId ? session?.hits.find((h) => h.hitId === hitId) : null) ??
          (index != null ? resolveHitByListIndex(shopName, index) : null);
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
    }),
    [t, copyActionLabel, previewFieldLabel, previewModeNote, previewDurationHint, shopName]
  );

  const commandExecutors = useMemo(
    () => ({
      update_listing_price: async (payload: Record<string, unknown>) => {
        const p = payload as {
          productId: string;
          price: number;
          currency: string;
          variantScope: "all" | "one";
          variantSkuId?: string;
        };
        await executeListingPriceUpdate({
          productId: p.productId,
          price: p.price,
          currency: p.currency,
          variantScope: p.variantScope,
          variantSkuId: p.variantSkuId,
        });
      },
      update_product_copy: async (payload: Record<string, unknown>) => {
        const p = payload as {
          productId: string;
          copyField: "title" | "description" | "all";
          copyAction: "translate" | "rewrite" | "optimize";
          targetLang?: string;
          copyStyle?: "amazon" | "literal";
          tone?: string;
          previewText: string;
        };
        await executeProductCopyUpdate({
          productId: p.productId,
          copyField: p.copyField,
          copyAction: p.copyAction,
          targetLang: p.targetLang,
          copyStyle: p.copyStyle,
          tone: p.tone,
          previewText: p.previewText,
        });
      },
      batch_update_product_copy: async (payload: Record<string, unknown>) => {
        const p = payload as {
          productIds: string[];
          copyField: "title" | "description" | "all";
          copyAction: "translate" | "rewrite" | "optimize";
          targetLang?: string;
          copyStyle?: "amazon" | "literal";
          tone?: string;
          totalCount: number;
          onProgress?: (current: number, total: number, success: number, failed: number) => void;
        };
        await executeBatchProductCopyUpdate({
          productIds: p.productIds,
          copyField: p.copyField,
          copyAction: p.copyAction,
          targetLang: p.targetLang,
          copyStyle: p.copyStyle,
          tone: p.tone,
          onProgress: p.onProgress,
        });
      },
      batch_update_listing_price: async (payload: Record<string, unknown>) => {
        const p = payload as {
          productIds: string[];
          batchPriceMultiplier?: number;
          batchPriceFixed?: number;
          totalCount: number;
          onProgress?: (current: number, total: number, success: number, failed: number) => void;
        };
        await executeBatchListingPriceUpdate({
          productIds: p.productIds,
          batchPriceMultiplier: p.batchPriceMultiplier,
          batchPriceFixed: p.batchPriceFixed,
          onProgress: p.onProgress,
        });
      },
      draft_product: async (payload: Record<string, unknown>) => {
        const p = payload as {
          productId: string;
          productTitle: string;
          targetStatus: ShopifyListingStatusTarget;
        };
        await executeProductStatusUpdate(p);
      },
      archive_product: async (payload: Record<string, unknown>) => {
        const p = payload as {
          productId: string;
          productTitle: string;
          targetStatus: ShopifyListingStatusTarget;
        };
        await executeProductStatusUpdate(p);
      },
      batch_draft_products: async (payload: Record<string, unknown>) => {
        const p = payload as {
          productIds: string[];
          targetStatus: ShopifyListingStatusTarget;
          onProgress?: (current: number, total: number, success: number, failed: number) => void;
        };
        await executeBatchProductStatusUpdate({
          productIds: p.productIds,
          targetStatus: p.targetStatus,
          onProgress: p.onProgress,
        });
      },
      batch_archive_products: async (payload: Record<string, unknown>) => {
        const p = payload as {
          productIds: string[];
          targetStatus: ShopifyListingStatusTarget;
          onProgress?: (current: number, total: number, success: number, failed: number) => void;
        };
        await executeBatchProductStatusUpdate({
          productIds: p.productIds,
          targetStatus: p.targetStatus,
          onProgress: p.onProgress,
        });
      },
      publish_sourcing_item: async (payload: Record<string, unknown>) => {
        const p = payload as { hitId: string };
        const session = getSourcingSession(shopName);
        const hit = session?.hits.find((h) => h.hitId === p.hitId);
        if (!hit) {
          throw new Error(t("agentProducts.clarifySourcingPublishTarget"));
        }
        const tpl = template ?? (await api.getPricingTemplate(shopName));
        const outcome = await publishSourcingHit({
          hit,
          shopName,
          template: tpl,
        });
        if (!outcome.ok || !outcome.result) {
          throw new Error(outcome.error ?? t("catalogPublish.publishFailed"));
        }
        if (
          outcome.result.publishStatus === "PUBLISHED" &&
          outcome.result.shopifyProductId?.trim() &&
          outcome.catalogItem
        ) {
          const productId = outcome.result.shopifyProductId.trim();
          markCatalogPublished(shopName, productId);
          queuePublishReveal(shopName, productId, outcome.catalogItem);
        }
      },
    }),
    [
      executeListingPriceUpdate,
      executeProductCopyUpdate,
      executeBatchProductCopyUpdate,
      executeBatchListingPriceUpdate,
      executeProductStatusUpdate,
      executeBatchProductStatusUpdate,
      shopName,
      template,
      t,
    ]
  );
  return {
    clearAiFieldEdit,
    markAiFieldEdit,
    previewGenerators,
    commandExecutors,
  };
}
