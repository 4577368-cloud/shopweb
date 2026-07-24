"use client";

import { useMemo } from "react";
import type { SkuCommandPlan } from "@/lib/agents/sku-align/command-schema";
import { confirmPageNeedsReview } from "@/lib/sku-align/batch-confirm";
import { unbindWithFallback } from "@/lib/sku-align-v1/compat";
import type { SkuProductOverview } from "@/lib/types";

type TranslateFn = (
  key: string,
  params?: Record<string, string | number>
) => string;

export interface UseSkuAlignAgentCommandsParams {
  products: SkuProductOverview[];
  shopName: string;
  load: () => Promise<void>;
  showToast: (message: string) => void;
  t: TranslateFn;
}

export function useSkuAlignAgentCommands({
  products,
  shopName,
  load,
  showToast,
  t,
}: UseSkuAlignAgentCommandsParams) {
  const previewGenerators = useMemo(
    () => ({
      batch_confirm_pending: async (plan: SkuCommandPlan, _shopName: string) => {
        const productIds = plan.draft.params.batchProductIds ?? [];
        const totalCount = productIds.length;

        if (totalCount === 0) {
          throw new Error(t("sku.confirmNoProducts"));
        }

        const sampleCount = Math.min(3, totalCount);
        const sampleRows: Array<{
          label: string;
          before: string;
          after: string;
        }> = [];

        for (let i = 0; i < sampleCount; i++) {
          const productId = productIds[i];
          const product = products.find((p) => p.thirdPlatformItemId === productId);
          if (product) {
            const needsReview = product.variants.filter(
              (v) => v.bound?.bindStatus === "PENDING"
            ).length;
            sampleRows.push({
              label: product.title ?? t("sku.confirmUnknownProduct"),
              before: t("sku.confirmBefore", { count: needsReview }),
              after: t("sku.confirmAfter"),
            });
          }
        }

        const extraNote =
          sampleCount < totalCount
            ? t("sku.confirmPreviewNote", {
                count: sampleCount,
                rest: totalCount - sampleCount,
              })
            : t("sku.confirmPreviewAll", { count: totalCount });

        return {
          sections: [
            {
              title: t("sku.confirmTitle", { count: totalCount }),
              rows: sampleRows,
            },
          ],
          extraNote,
          impact: {
            scope: t("sku.confirmScope", { count: totalCount }),
            durationHint: t("sku.confirmDuration", {
              seconds: Math.max(3, totalCount * 2),
            }),
            reversible: true,
          },
          payload: {
            productIds,
            totalCount,
          },
        };
      },
      unbind: async (plan: SkuCommandPlan, _shopName: string) => {
        const productId = plan.draft.productId;
        const product = products.find((p) => p.thirdPlatformItemId === productId);
        if (!product) throw new Error(t("sku.confirmNoProducts"));
        const variants = product.variants ?? [];
        let variant: { id: string; label: string } | null = null;
        const idx = plan.draft.params.variantIndex;
        if (idx != null && idx >= 1 && idx <= variants.length) {
          const v = variants[idx - 1];
          variant = { id: v.thirdPlatformSkuId, label: v.optionLabel };
        } else {
          const spec = plan.draft.params.variantSpec?.trim();
          if (spec) {
            const matches = variants.filter((v) =>
              v.optionLabel?.toLowerCase().includes(spec.toLowerCase())
            );
            if (matches.length === 1) {
              variant = {
                id: matches[0].thirdPlatformSkuId,
                label: matches[0].optionLabel,
              };
            }
          }
        }
        if (!variant) throw new Error(t("agentSku.clarifyVariantNeeded"));
        return {
          sections: [
            {
              title: t("agentSku.opUnbind"),
              rows: [
                {
                  label: product.title ?? t("sku.confirmUnknownProduct"),
                  before: variant.label,
                  after: t("sku.confirmAfter"),
                },
              ],
            },
          ],
          impact: {
            scope: t("agentSku.detailUnbind", {
              variantLabel: variant.label,
              title: product.title ?? "",
            }),
            durationHint: t("sku.confirmDuration", { seconds: 3 }),
            reversible: true,
          },
          payload: { productId, variantId: variant.id, variantLabel: variant.label },
        };
      },
    }),
    [products, t]
  );

  const commandExecutors = useMemo(
    () => ({
      batch_confirm_pending: async (payload: Record<string, unknown>) => {
        const p = payload as {
          productIds: string[];
          totalCount: number;
          onProgress?: (
            current: number,
            total: number,
            success: number,
            failed: number
          ) => void;
        };
        const total = p.productIds.length;
        let success = 0;
        let failed = 0;

        for (let i = 0; i < total; i++) {
          const productId = p.productIds[i];
          try {
            const product = products.find((x) => x.thirdPlatformItemId === productId);
            if (product) {
              const result = await confirmPageNeedsReview(shopName, [product]);
              if (result.confirmedCount && result.confirmedCount > 0) {
                success++;
              } else {
                failed++;
              }
            }
          } catch {
            failed++;
          }
          p.onProgress?.(i + 1, total, success, failed);
        }

        await load();
        showToast(t("sku.confirmDone", { success, failed }));
      },
      unbind: async (payload: Record<string, unknown>) => {
        const p = payload as {
          productId: string;
          variantId: string;
          variantLabel?: string;
        };
        await unbindWithFallback(shopName, p.variantId, p.productId);
        await load();
        showToast(t("sku.unbindDone", { variant: p.variantLabel ?? "" }));
      },
    }),
    [products, shopName, load, showToast, t]
  );

  return { previewGenerators, commandExecutors };
}
