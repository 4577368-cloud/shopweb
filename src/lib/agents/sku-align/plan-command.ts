import type { TranslateFn } from "@/i18n/server";
import type {
  SkuCommandDraft,
  SkuCommandExecution,
  SkuCommandPlan,
  SkuFilterMode,
} from "@/lib/agents/sku-align/command-schema";
import type { SkuProductOverview } from "@/lib/types";

export interface SkuPageContext {
  productCatalog: SkuProductOverview[];
  focusProductId?: string | null;
  focusProduct?: SkuProductOverview | null;
  currentFilter?: string | null;
}

function filterLabel(t: TranslateFn, filter: SkuFilterMode): string {
  const keys: Record<SkuFilterMode, string> = {
    all: "agentSku.filterAll",
    fully_linked: "agentSku.filterFullyLinked",
    partially_linked: "agentSku.filterPartiallyLinked",
  };
  return t(keys[filter]);
}

function needsFocusProduct(intent: SkuCommandDraft["intent"]): boolean {
  return (
    intent === "rerun_auto_align" ||
    intent === "explain_sku_match" ||
    intent === "open_sku_detail" ||
    intent === "bind_variant" ||
    intent === "unbind" ||
    intent === "change_source" ||
    intent === "add_supplement_source" ||
    intent === "ignore_match" ||
    intent === "set_manual" ||
    intent === "tune_threshold"
  );
}

function resolveProductId(
  t: TranslateFn,
  draft: SkuCommandDraft,
  ctx: SkuPageContext
): { productId: string | null; title: string | null; clarify?: string } {
  if (draft.targetScope === "explicit" && draft.productId) {
    const hit = ctx.productCatalog.find((c) => c.thirdPlatformItemId === draft.productId);
    return {
      productId: draft.productId,
      title: hit?.title ?? ctx.focusProduct?.title ?? null,
    };
  }
  if (draft.params.productId) {
    const hit = ctx.productCatalog.find((c) => c.thirdPlatformItemId === draft.params.productId);
    return {
      productId: draft.params.productId,
      title: hit?.title ?? null,
    };
  }

  const hint = draft.params.productTitleHint?.trim();
  if (hint) {
    const matches = ctx.productCatalog.filter((p) =>
      p.title?.toLowerCase().includes(hint.toLowerCase())
    );
    if (matches.length === 1) {
      return { productId: matches[0].thirdPlatformItemId, title: matches[0].title ?? null };
    }
    if (matches.length > 1) {
      return {
        productId: null,
        title: null,
        clarify: t("agentSku.clarifyAmbiguous", {
          matches: matches
            .slice(0, 5)
            .map((m) => `「${m.title}」`)
            .join("、"),
        }),
      };
    }
    return {
      productId: null,
      title: null,
      clarify: t("agentSku.clarifyNotFound", { hint }),
    };
  }

  if (draft.targetScope === "current" || needsFocusProduct(draft.intent)) {
    return {
      productId: ctx.focusProductId ?? null,
      title: ctx.focusProduct?.title ?? null,
    };
  }
  if (draft.intent === "focus_product") {
    return {
      productId: ctx.focusProductId ?? null,
      title: ctx.focusProduct?.title ?? null,
    };
  }
  return { productId: null, title: null };
}

function isPartiallyLinked(product: SkuProductOverview): boolean {
  const active = product.variants.filter((v) => v.bound?.bindStatus === "ACTIVE").length;
  const pending = product.variants.filter((v) => v.bound?.bindStatus === "PENDING").length;
  return pending > 0 || (active > 0 && active < product.variants.length);
}

/** Resolve a single variant by explicit ordinal (variantIndex) or spec text (variantSpec). */
function resolveVariantId(
  t: TranslateFn,
  productId: string,
  draft: SkuCommandDraft,
  ctx: SkuPageContext
): { variantId: string | null; variantLabel: string | null; clarify?: string } {
  const product = ctx.productCatalog.find((p) => p.thirdPlatformItemId === productId);
  if (!product) {
    return { variantId: null, variantLabel: null, clarify: t("agentSku.clarifySelectForUnbind") };
  }
  const variants = product.variants ?? [];
  const idx = draft.params.variantIndex;
  if (idx != null && idx >= 1 && idx <= variants.length) {
    const v = variants[idx - 1];
    return { variantId: v.thirdPlatformSkuId, variantLabel: v.optionLabel };
  }
  const spec = draft.params.variantSpec?.trim();
  if (spec) {
    const matches = variants.filter((v) =>
      v.optionLabel?.toLowerCase().includes(spec.toLowerCase())
    );
    if (matches.length === 1) {
      return { variantId: matches[0].thirdPlatformSkuId, variantLabel: matches[0].optionLabel };
    }
    if (matches.length > 1) {
      return {
        variantId: null,
        variantLabel: null,
        clarify: t("agentSku.clarifyAmbiguous", {
          matches: matches.slice(0, 5).map((m) => `「${m.optionLabel}」`).join("、"),
        }),
      };
    }
    return {
      variantId: null,
      variantLabel: null,
      clarify: t("agentSku.clarifyNoVariantMatch", { spec, title: product.title ?? "" }),
    };
  }
  return { variantId: null, variantLabel: null, clarify: t("agentSku.clarifyVariantNeeded") };
}

function resolveBatchProductIds(
  t: TranslateFn,
  draft: SkuCommandDraft,
  ctx: SkuPageContext
): { ids: string[]; label: string } {
  const filter = draft.params.batchFilter ?? "partially_linked";
  const all = ctx.productCatalog;

  let filtered: typeof all;
  switch (filter) {
    case "partially_linked":
      filtered = all.filter(isPartiallyLinked);
      break;
    case "all":
    default:
      filtered = all;
  }

  const ids = filtered.map((p) => p.thirdPlatformItemId);

  const filterLabels: Record<string, string> = {
    all: t("agentSku.filterAll"),
    partially_linked: t("agentSku.filterPartialProducts"),
  };
  const label = filterLabels[filter] ?? t("agentSku.filterAll");

  return { ids, label };
}

function productTitle(
  t: TranslateFn,
  title: string | null,
  productId: string | null,
  ctx: SkuPageContext
): string {
  return (
    title ??
    ctx.focusProduct?.title ??
    (productId
      ? t("agentSku.productFallback", { id: productId.slice(-8) })
      : t("agentSku.noProductSelected"))
  );
}

export function planSkuCommand(
  t: TranslateFn,
  draft: SkuCommandDraft,
  ctx: SkuPageContext
): SkuCommandPlan {
  const resolved = resolveProductId(t, draft, ctx);
  const productId = resolved.productId;
  const focusTitle = productTitle(t, resolved.title, productId, ctx);

  if (resolved.clarify) {
    return {
      draft,
      operation: commandOperationLabel(t, draft.intent),
      targetLabel: focusTitle,
      detailLines: [],
      executable: false,
      clarify: resolved.clarify,
    };
  }

  switch (draft.intent) {
    case "open_filter": {
      const filter = draft.params.filterMode ?? "all";
      const label = filterLabel(t, filter);
      return {
        draft,
        operation: t("agentSku.opOpenFilter"),
        targetLabel: label,
        detailLines: [t("agentSku.detailSwitchFilter", { filter: label })],
        executable: true,
      };
    }
    case "focus_product": {
      if (!productId) {
        return {
          draft,
          operation: t("agentSku.opFocusProduct"),
          targetLabel: focusTitle,
          detailLines: [],
          executable: false,
          clarify: t("agentSku.clarifySelectForFocus"),
        };
      }
      return {
        draft: { ...draft, productId },
        operation: t("agentSku.opFocusProduct"),
        targetLabel: focusTitle,
        detailLines: [t("agentSku.detailLocateProduct", { title: focusTitle })],
        executable: true,
      };
    }
    case "rerun_auto_align": {
      if (draft.targetScope === "all") {
        const batchResult = resolveBatchProductIds(t, draft, ctx);
        const totalCount = batchResult.ids.length;
        if (totalCount === 0) {
          return {
            draft,
            operation: t("agentSku.opBatchRealign"),
            targetLabel: batchResult.label,
            detailLines: [],
            executable: false,
            clarify: t("agentSku.clarifyNoProductsInScope", {
              label: batchResult.label,
            }),
          };
        }
        return {
          draft: {
            ...draft,
            targetScope: "all",
            params: {
              ...draft.params,
              batchProductIds: batchResult.ids,
            },
          },
          operation: t("agentSku.opBatchRealign"),
          targetLabel: t("agentSku.targetScopeCount", {
            label: batchResult.label,
            count: totalCount,
          }),
          detailLines: [
            t("agentSku.detailBatchRealignScope", {
              label: batchResult.label,
              count: totalCount,
            }),
            t("agentSku.detailBatchRealignLine2"),
          ],
          executable: true,
        };
      }
      if (!productId) {
        return {
          draft,
          operation: t("agentSku.opRealign"),
          targetLabel: focusTitle,
          detailLines: [],
          executable: false,
          clarify: t("agentSku.clarifySelectForRealign"),
        };
      }
      return {
        draft: { ...draft, productId },
        operation: t("agentSku.opRealign"),
        targetLabel: focusTitle,
        detailLines: [t("agentSku.detailRealign", { title: focusTitle })],
        executable: true,
      };
    }
    case "explain_sku_match": {
      if (!productId) {
        return {
          draft,
          operation: t("agentSku.opExplainMatch"),
          targetLabel: focusTitle,
          detailLines: [],
          executable: false,
          clarify: t("agentSku.clarifySelectForExplain"),
        };
      }
      return {
        draft: { ...draft, productId },
        operation: t("agentSku.opExplainMatch"),
        targetLabel: focusTitle,
        detailLines: [
          t("agentSku.detailExplainMatch", { title: focusTitle }),
        ],
        executable: true,
      };
    }
    case "open_sku_detail": {
      if (!productId) {
        return {
          draft,
          operation: t("agentSku.opOpenDetail"),
          targetLabel: focusTitle,
          detailLines: [],
          executable: false,
          clarify: t("agentSku.clarifySelectForDetail"),
        };
      }
      return {
        draft: { ...draft, productId },
        operation: t("agentSku.opOpenDetail"),
        targetLabel: focusTitle,
        detailLines: [
          t("agentSku.detailOpenSkuDetail", { title: focusTitle }),
        ],
        executable: true,
      };
    }
    case "batch_confirm_pending": {
      const batchResult = resolveBatchProductIds(t, draft, ctx);
      const totalCount = batchResult.ids.length;

      if (totalCount === 0) {
        return {
          draft,
          operation: t("agentSku.opBatchConfirm"),
          targetLabel: batchResult.label,
          detailLines: [],
          executable: false,
          clarify: t("agentSku.clarifyNoPendingInScope", {
            label: batchResult.label,
          }),
        };
      }

      return {
        draft: {
          ...draft,
          targetScope: "all",
          confirmationRequired: true,
          params: {
            ...draft.params,
            batchProductIds: batchResult.ids,
          },
        },
        operation: t("agentSku.opBatchConfirm"),
        targetLabel: t("agentSku.targetScopeCount", {
          label: batchResult.label,
          count: totalCount,
        }),
        detailLines: [
          t("agentSku.detailBatchConfirmScope", {
            label: batchResult.label,
            count: totalCount,
          }),
          t("agentSku.detailBatchConfirmLine2"),
        ],
        executable: true,
      };
    }
    case "unbind": {
      if (!productId) {
        return {
          draft,
          operation: t("agentSku.opUnbind"),
          targetLabel: focusTitle,
          detailLines: [],
          executable: false,
          clarify: t("agentSku.clarifySelectForUnbind"),
        };
      }
      const variant = resolveVariantId(t, productId, draft, ctx);
      if (variant.clarify || !variant.variantId) {
        return {
          draft: { ...draft, productId },
          operation: t("agentSku.opUnbind"),
          targetLabel: focusTitle,
          detailLines: [],
          executable: false,
          clarify: variant.clarify ?? t("agentSku.clarifyVariantNeeded"),
        };
      }
      return {
        draft: { ...draft, productId, confirmationRequired: true },
        operation: t("agentSku.opUnbind"),
        targetLabel: focusTitle,
        detailLines: [
          t("agentSku.detailUnbind", { variantLabel: variant.variantLabel ?? "", title: focusTitle }),
        ],
        executable: true,
      };
    }
    case "bind_variant":
    case "change_source":
    case "add_supplement_source":
    case "ignore_match":
    case "set_manual":
    case "tune_threshold": {
      if (!productId) {
        return {
          draft,
          operation: commandOperationLabel(t, draft.intent),
          targetLabel: focusTitle,
          detailLines: [],
          executable: false,
          clarify: t("agentSku.clarifySelectForDetail"),
        };
      }
      return {
        draft: { ...draft, productId },
        operation: commandOperationLabel(t, draft.intent),
        targetLabel: focusTitle,
        detailLines: [
          t("agentSku.detailRouteWorkbench", {
            title: focusTitle,
            action: commandOperationLabel(t, draft.intent),
          }),
        ],
        executable: true,
      };
    }
    default:
      return {
        draft,
        operation: t("agentSku.opExecute"),
        targetLabel: focusTitle,
        detailLines: [],
        executable: false,
        clarify: t("agentSku.clarifyNotImplemented"),
      };
  }
}

export function commandRequiresConfirmation(plan: SkuCommandPlan): boolean {
  return (
    plan.draft.confirmationRequired ||
    plan.draft.intent === "batch_confirm_pending"
  );
}

/** Plan a multi-step (composite) command. Each draft is planned independently;
 *  callers execute the resulting plans in order. */
export function planSkuCommandSequence(
  t: TranslateFn,
  drafts: SkuCommandDraft[],
  ctx: SkuPageContext
): SkuCommandPlan[] {
  return drafts.map((d) => planSkuCommand(t, d, ctx));
}

export function commandOperationLabel(
  t: TranslateFn,
  intent: SkuCommandDraft["intent"]
): string {
  switch (intent) {
    case "open_filter":
      return t("agentSku.opOpenFilter");
    case "focus_product":
      return t("agentSku.opFocusProduct");
    case "batch_confirm_pending":
      return t("agentSku.opBatchConfirm");
    case "rerun_auto_align":
      return t("agentSku.opRealign");
    case "explain_sku_match":
      return t("agentSku.opExplainMatch");
    case "open_sku_detail":
      return t("agentSku.opOpenDetail");
    case "bind_variant":
      return t("agentSku.opBindVariant");
    case "unbind":
      return t("agentSku.opUnbind");
    case "change_source":
      return t("agentSku.opChangeSource");
    case "add_supplement_source":
      return t("agentSku.opAddSupplement");
    case "ignore_match":
      return t("agentSku.opIgnoreMatch");
    case "set_manual":
      return t("agentSku.opSetManual");
    case "tune_threshold":
      return t("agentSku.opTuneThreshold");
    default:
      return t("agentSku.opExecute");
  }
}

export function resolveSkuCommandExecution(
  plan: SkuCommandPlan
): SkuCommandExecution | null {
  switch (plan.draft.intent) {
    case "open_filter": {
      const filterMode = plan.draft.params.filterMode ?? "all";
      return { type: "set_filter", filterMode };
    }
    case "focus_product": {
      const productId = plan.draft.productId;
      if (!productId) return null;
      return { type: "focus_product", productId };
    }
    case "batch_confirm_pending": {
      const productIds = plan.draft.params.batchProductIds ?? [];
      if (productIds.length === 0) return null;
      return {
        type: "batch_confirm_pending",
        productIds,
        totalCount: productIds.length,
        filterLabel: plan.targetLabel,
      };
    }
    case "rerun_auto_align": {
      return { type: "rerun_auto_align", productId: plan.draft.productId };
    }
    case "open_sku_detail": {
      const productId = plan.draft.productId;
      if (!productId) return null;
      return { type: "focus_product", productId };
    }
    case "bind_variant":
    case "change_source":
    case "add_supplement_source":
    case "ignore_match":
    case "set_manual":
    case "tune_threshold": {
      const productId = plan.draft.productId;
      if (!productId) return null;
      return { type: "focus_product", productId };
    }
    default:
      return null;
  }
}
