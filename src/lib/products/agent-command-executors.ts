import {
  aiFieldEditKey,
  applyListingEditsToProducts,
  formatListingMoney,
  type AiFieldEditRecord,
} from "@/lib/ai-field-edit-feedback";
import { api, readableError } from "@/lib/api";
import { markCatalogPublished } from "@/lib/batch-link/publish-source";
import { queuePublishReveal } from "@/lib/batch-link/publish-reveal";
import { resolveTitleCopyStyle } from "@/lib/products/resolve-title-copy-style";
import type { ProductsCommandRuntime } from "@/lib/products/agent-command-types";
import { publishSourcingHit } from "@/lib/sourcing/publish-sourcing-hit";
import { getSourcingSession } from "@/lib/sourcing/session";
import {
  listingStatusLabel,
  normalizeShopStatus,
  writeShopProductStatus,
  type ShopifyListingStatusTarget,
} from "@/lib/shop-product-status";
import { mergeListingPriceRow, writeShopListingPrice } from "@/lib/shop-product-write";

export function applyLocalProductStatus(
  ctx: ProductsCommandRuntime,
  productId: string,
  status: ShopifyListingStatusTarget
) {
  ctx.setShopProducts((prev) =>
    prev.map((p) =>
      p.thirdPlatformItemId === productId ? { ...p, status } : p
    )
  );
}

export async function executeListingPriceUpdate(ctx: ProductsCommandRuntime, req: {
      productId: string;
      price: number;
      currency: string;
      variantScope: "all" | "one";
      variantSkuId?: string;
    }) {
      const target =
        req.variantScope === "all"
          ? ({ scope: "all" } as const)
          : ({
              scope: "one",
              thirdPlatformSkuId: req.variantSkuId!,
            } as const);
      const { detail, previousPrice, variantScope } = await writeShopListingPrice(
        ctx.shopName,
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
        ...ctx.aiFieldEditsRef.current,
        [aiFieldEditKey(req.productId, "listingPrice")]: editRecord,
      };
      ctx.aiFieldEditsRef.current = editsWithCurrent;
      ctx.setAiFieldEdits(editsWithCurrent);

      await ctx.loadSummary();
      ctx.setShopProducts((prev) =>
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
      ctx.bumpMirrorRefresh();
      ctx.showToast(
        ctx.t("productsPage.toastTitleUpdated", {
          title: detail.title ?? ctx.t("productsPage.productFallback"),
          currency,
          price: req.price.toFixed(2),
        })
      );
    }

export async function executeProductCopyUpdate(ctx: ProductsCommandRuntime, req: {
      productId: string;
      copyField: "title" | "description" | "all";
      copyAction: "translate" | "rewrite" | "optimize";
      targetLang?: string;
      copyStyle?: "amazon" | "literal";
      tone?: string;
      previewText: string;
    }) {
      if (req.copyField === "title" || req.copyField === "all") {
        try {
          const detail = await api.getShopProductDetail(ctx.shopName, req.productId);
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
            throw new Error(ctx.t("productsPreview.errTitleGenFailed"));
          }
          const result = await api.updateShopProduct(ctx.shopName, {
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
            ...ctx.aiFieldEditsRef.current,
            [aiFieldEditKey(req.productId, "title")]: editRecord,
          };
          ctx.aiFieldEditsRef.current = editsWithCurrent;
          ctx.setAiFieldEdits(editsWithCurrent);
          ctx.setShopProducts((prev) =>
            prev.map((p) =>
              p.thirdPlatformItemId === req.productId
                ? { ...p, title: nextTitle }
                : p
            )
          );
          ctx.bumpMirrorRefresh();
          await ctx.loadSummary();
          const actionLabel = ctx.labels.copyActionLabel(req.copyAction, req.targetLang);
          ctx.showToast(
            ctx.t("productsPage.toastTitleCopyUpdated", { action: actionLabel })
          );
        } catch (err) {
          ctx.showToast(readableError(err) || ctx.t("productsPage.toastTitleCopyFailed"));
          throw err;
        }
      }
    }

export async function executeBatchProductCopyUpdate(ctx: ProductsCommandRuntime, req: {
      productIds: string[];
      copyField: "title" | "description" | "all";
      copyAction: "translate" | "rewrite" | "optimize";
      targetLang?: string;
      copyStyle?: "amazon" | "literal";
      tone?: string;
      onProgress?: (current: number, total: number, success: number, failed: number) => void;
    }) {
      const { productIds, copyField, copyAction, targetLang, copyStyle, onProgress } = req;
      const style = resolveTitleCopyStyle(copyAction, copyStyle);
      const total = productIds.length;
      let success = 0;
      let failed = 0;

      for (let i = 0; i < total; i++) {
        const productId = productIds[i];
        try {
          const detail = await api.getShopProductDetail(ctx.shopName, productId);
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
              throw new Error(result.error ?? ctx.t("productsPreview.errTitleLocalizeFailed"));
            }
          } else {
            throw new Error(ctx.t("productsPreview.errCopyNotImplemented"));
          }

          if (copyField === "title" || copyField === "all") {
            const updateResult = await api.updateShopProduct(ctx.shopName, {
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
              ...ctx.aiFieldEditsRef.current,
              [aiFieldEditKey(productId, "title")]: editRecord,
            };
            ctx.aiFieldEditsRef.current = editsWithCurrent;
            ctx.setAiFieldEdits(editsWithCurrent);
            ctx.setShopProducts((prev) =>
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

      ctx.bumpMirrorRefresh();
      await ctx.loadSummary();

      const actionLabel = ctx.labels.copyActionLabel(copyAction, targetLang);
      ctx.showToast(
        ctx.t("productsPage.toastBatchCopyDone", {
          action: actionLabel,
          success,
          failed,
        })
      );
    }

export async function executeBatchListingPriceUpdate(ctx: ProductsCommandRuntime, req: {
      productIds: string[];
      batchPriceMultiplier?: number;
      batchPriceFixed?: number;
      onProgress?: (current: number, total: number, success: number, failed: number) => void;
    }) {
      const { productIds, batchPriceMultiplier, batchPriceFixed, onProgress } = req;
      const total = productIds.length;
      let success = 0;
      let failed = 0;

      for (let i = 0; i < total; i++) {
        const productId = productIds[i];
        try {
          const detail = await api.getShopProductDetail(ctx.shopName, productId);
          let targetPrice = 0;

          if (batchPriceFixed) {
            targetPrice = batchPriceFixed;
          } else if (batchPriceMultiplier && detail.minPrice != null) {
            targetPrice = detail.minPrice * batchPriceMultiplier;
          } else {
            throw new Error(ctx.t("productsPreview.errCannotCalcPrice"));
          }

          const target = { scope: "all" } as const;
          await writeShopListingPrice(ctx.shopName, productId, targetPrice, target);
          success++;
        } catch {
          failed++;
        }

        onProgress?.(i + 1, total, success, failed);
      }

      ctx.bumpMirrorRefresh();
      await ctx.loadSummary();

      const modeLabel = batchPriceFixed
        ? ctx.t("productsPage.priceModeFixed", { price: batchPriceFixed })
        : ctx.t("productsPage.priceModeMultiplier", {
            multiplier: batchPriceMultiplier ?? 1,
          });
      ctx.showToast(
        ctx.t("productsPage.toastBatchPriceDone", {
          mode: modeLabel,
          success,
          failed,
        })
      );
    }

export async function executeProductStatusUpdate(ctx: ProductsCommandRuntime, req: {
      productId: string;
      productTitle: string;
      targetStatus: ShopifyListingStatusTarget;
    }) {
      const detail = await writeShopProductStatus(
        ctx.shopName,
        req.productId,
        req.targetStatus
      );
      applyLocalProductStatus(ctx, req.productId, req.targetStatus);
      ctx.bumpMirrorRefresh();
      await ctx.loadSummary();
      ctx.showToast(
        ctx.t("productsPage.toastListingUpdated", {
          title: detail.title ?? req.productTitle,
          status: listingStatusLabel(ctx.t, req.targetStatus),
        })
      );
    }

export async function executeBatchProductStatusUpdate(ctx: ProductsCommandRuntime, req: {
      productIds: string[];
      targetStatus: ShopifyListingStatusTarget;
      onProgress?: (current: number, total: number, success: number, failed: number) => void;
    }) {
      const { productIds, targetStatus, onProgress } = req;
      const total = productIds.length;
      let success = 0;
      let failed = 0;

      for (let i = 0; i < total; i++) {
        const productId = productIds[i]!;
        try {
          const detail = await api.getShopProductDetail(ctx.shopName, productId);
          if (normalizeShopStatus(detail.status) === targetStatus) {
            success++;
            onProgress?.(i + 1, total, success, failed);
            continue;
          }
          await writeShopProductStatus(ctx.shopName, productId, targetStatus);
          applyLocalProductStatus(ctx, productId, targetStatus);
          success++;
        } catch {
          failed++;
        }
        onProgress?.(i + 1, total, success, failed);
      }

      ctx.bumpMirrorRefresh();
      await ctx.loadSummary();
      ctx.showToast(
        ctx.t("productsPage.toastBatchListingDone", {
          status: listingStatusLabel(ctx.t, targetStatus),
          success,
          failed,
        })
      );
    }

export function createProductsCommandExecutors(ctx: ProductsCommandRuntime) {
  return {
    update_listing_price: async (payload: Record<string, unknown>) => {
      const p = payload as {
        productId: string;
        price: number;
        currency: string;
        variantScope: "all" | "one";
        variantSkuId?: string;
      };
      await executeListingPriceUpdate(ctx, {
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
      await executeProductCopyUpdate(ctx, {
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
      await executeBatchProductCopyUpdate(ctx, {
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
      await executeBatchListingPriceUpdate(ctx, {
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
      await executeProductStatusUpdate(ctx, p);
    },
    archive_product: async (payload: Record<string, unknown>) => {
      const p = payload as {
        productId: string;
        productTitle: string;
        targetStatus: ShopifyListingStatusTarget;
      };
      await executeProductStatusUpdate(ctx, p);
    },
    batch_draft_products: async (payload: Record<string, unknown>) => {
      const p = payload as {
        productIds: string[];
        targetStatus: ShopifyListingStatusTarget;
        onProgress?: (current: number, total: number, success: number, failed: number) => void;
      };
      await executeBatchProductStatusUpdate(ctx, {
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
      await executeBatchProductStatusUpdate(ctx, {
        productIds: p.productIds,
        targetStatus: p.targetStatus,
        onProgress: p.onProgress,
      });
    },
    publish_sourcing_item: async (payload: Record<string, unknown>) => {
      const p = payload as { hitId: string };
      const session = getSourcingSession(ctx.shopName);
      const hit = session?.hits.find((h) => h.hitId === p.hitId);
      if (!hit) {
        throw new Error(ctx.t("agentProducts.clarifySourcingPublishTarget"));
      }
      const tpl = ctx.template ?? (await api.getPricingTemplate(ctx.shopName));
      const outcome = await publishSourcingHit({
        hit,
        shopName: ctx.shopName,
        template: tpl,
      });
      if (!outcome.ok || !outcome.result) {
        throw new Error(outcome.error ?? ctx.t("catalogPublish.publishFailed"));
      }
      if (
        outcome.result.publishStatus === "PUBLISHED" &&
        outcome.result.shopifyProductId?.trim() &&
        outcome.catalogItem
      ) {
        const productId = outcome.result.shopifyProductId.trim();
        markCatalogPublished(ctx.shopName, productId);
        queuePublishReveal(ctx.shopName, productId, outcome.catalogItem);
      }
    },
  };
}
