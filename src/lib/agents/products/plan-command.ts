import type { TranslateFn } from "@/i18n/server";
import type { ProductsIntentId } from "@/lib/agents/products/intents";
import type { ProductsPageContext } from "@/lib/agents/products/page-context";
import type {
  ProductCommandDraft,
  ProductCommandExecution,
  ProductCommandPlan,
  ProductCommandShopFilter,
} from "@/lib/agents/products/command-schema";
import type { AgentSuggestedAction } from "@/lib/agents/types";
import {
  resolveProductByTitleHint,
} from "@/lib/agents/products/resolve-product-target";
import {
  isActiveShopStatus,
  listingStatusLabel,
  normalizeShopStatus,
} from "@/lib/shop-product-status";

function filterLabel(t: TranslateFn, filter: ProductCommandShopFilter): string {
  const keys: Record<ProductCommandShopFilter, string> = {
    all: "agentProducts.filterAll",
    pending: "agentProducts.filterPending",
    unbound: "agentProducts.filterUnbound",
    confirmed: "agentProducts.filterConfirmed",
    new_arrivals: "agentProducts.filterNewArrivals",
  };
  return t(keys[filter]);
}

function needsFocusProduct(intent: ProductCommandDraft["intent"]): boolean {
  return (
    intent === "rerun_candidate_search" ||
    intent === "explain_product_match" ||
    intent === "update_listing_price" ||
    intent === "update_product_copy" ||
    intent === "draft_product" ||
    intent === "archive_product"
  );
}

function resolveProductId(
  t: TranslateFn,
  draft: ProductCommandDraft,
  ctx: ProductsPageContext
): { productId: string | null; title: string | null; clarify?: string } {
  if (draft.targetScope === "explicit" && draft.productId) {
    const hit = ctx.productCatalog.find((c) => c.productId === draft.productId);
    return {
      productId: draft.productId,
      title: hit?.title ?? ctx.focusProduct?.title ?? null,
    };
  }
  if (draft.params.productId) {
    const hit = ctx.productCatalog.find((c) => c.productId === draft.params.productId);
    return {
      productId: draft.params.productId,
      title: hit?.title ?? null,
    };
  }

  const hint = draft.params.productTitleHint?.trim();
  if (hint) {
    const resolved = resolveProductByTitleHint(hint, ctx.productCatalog);
    if (resolved.status === "resolved") {
      return { productId: resolved.productId, title: resolved.title };
    }
    if (resolved.status === "ambiguous") {
      return {
        productId: null,
        title: null,
        clarify: t("agentProducts.clarifyAmbiguous", {
          matches: resolved.matches.map((m) => `「${m.title}」`).join("、"),
        }),
      };
    }
    return {
      productId: null,
      title: null,
      clarify: t("agentProducts.clarifyNotFound", { hint }),
    };
  }

  if (draft.targetScope === "current" || needsFocusProduct(draft.intent)) {
    return {
      productId: ctx.focusProductId,
      title: ctx.focusProduct?.title ?? null,
    };
  }
  if (draft.intent === "focus_product") {
    return {
      productId: ctx.focusProductId,
      title: ctx.focusProduct?.title ?? null,
    };
  }
  return { productId: null, title: null };
}

function resolveCurrency(
  draft: ProductCommandDraft,
  ctx: ProductsPageContext
): string {
  return (
    draft.params.currency?.toUpperCase() ??
    ctx.focusProduct?.shopCurrency?.toUpperCase() ??
    "USD"
  );
}

function resolveBatchProductIds(
  t: TranslateFn,
  draft: ProductCommandDraft,
  ctx: ProductsPageContext,
  opts?: { activeOnly?: boolean }
): { ids: string[]; label: string } {
  const filter = draft.params.batchFilter ?? "all";
  const all = ctx.productCatalog;

  let filtered: typeof all;
  switch (filter) {
    case "pending":
      filtered = all.filter((p) => p.bindState === "pending");
      break;
    case "confirmed":
      filtered = all.filter((p) => p.bindState === "confirmed");
      break;
    case "unbound":
      filtered = all.filter((p) => p.bindState === "unbound" || !p.bindState);
      break;
    default:
      filtered = all;
  }

  if (opts?.activeOnly) {
    filtered = filtered.filter((p) => isActiveShopStatus(p.shopStatus));
  }

  const limit = draft.params.batchLimit ?? 0;
  const result = limit > 0 ? filtered.slice(0, limit) : filtered;
  const ids = result.map((p) => p.productId);

  const filterLabels: Record<string, string> = {
    all: opts?.activeOnly
      ? t("agentProducts.filterAllActive")
      : t("agentProducts.filterAll"),
    pending: t("agentProducts.filterPendingProducts"),
    confirmed: t("agentProducts.filterConfirmedProducts"),
    unbound: t("agentProducts.filterUnboundProducts"),
  };
  const label =
    filterLabels[filter] ??
    (opts?.activeOnly
      ? t("agentProducts.filterAllActive")
      : t("agentProducts.filterAll"));

  return { ids, label };
}

function productTitle(
  t: TranslateFn,
  title: string | null,
  productId: string | null,
  ctx: ProductsPageContext
): string {
  return (
    title ??
    ctx.focusProduct?.title ??
    (productId
      ? t("agentProducts.productFallback", { id: productId.slice(-8) })
      : t("agentProducts.noProductSelected"))
  );
}

function copyFieldLabel(
  t: TranslateFn,
  field: "title" | "description" | "all"
): string {
  const keys = {
    title: "agentProducts.fieldTitle",
    description: "agentProducts.fieldDescription",
    all: "agentProducts.fieldAll",
  } as const;
  return t(keys[field]);
}

function copyActionLabel(
  t: TranslateFn,
  action: "translate" | "rewrite" | "optimize",
  targetLang?: string
): string {
  if (action === "translate") {
    return targetLang
      ? t("agentProducts.actionLocalize") +
          t("agentProducts.actionLocalizeLang", {
            lang: targetLang.toUpperCase(),
          })
      : t("agentProducts.actionLocalize");
  }
  if (action === "rewrite") return t("agentProducts.actionRewrite");
  return t("agentProducts.actionOptimize");
}

function copyOperationLabel(
  t: TranslateFn,
  action: string,
  field: string,
  batch = false
): string {
  return t(
    batch ? "agentProducts.actionBatchProductField" : "agentProducts.actionProductField",
    { action, field }
  );
}

function planSingleStatusChange(
  t: TranslateFn,
  draft: ProductCommandDraft,
  ctx: ProductsPageContext,
  targetStatus: "DRAFT" | "ARCHIVED",
  operation: string
): ProductCommandPlan {
  const resolved = resolveProductId(t, draft, ctx);
  const productId = resolved.productId;
  const focusTitle = productTitle(t, resolved.title, productId, ctx);

  if (resolved.clarify) {
    return {
      draft,
      operation,
      targetLabel: focusTitle,
      detailLines: [],
      executable: false,
      clarify: resolved.clarify,
    };
  }

  if (!productId) {
    return {
      draft,
      operation,
      targetLabel: focusTitle,
      detailLines: [],
      executable: false,
      clarify: t("agentProducts.clarifySelectForStatus"),
    };
  }

  const currentStatus = normalizeShopStatus(
    ctx.productCatalog.find((p) => p.productId === productId)?.shopStatus
  );
  if (currentStatus === targetStatus) {
    return {
      draft,
      operation,
      targetLabel: focusTitle,
      detailLines: [],
      executable: false,
      clarify: t("agentProducts.clarifyAlreadyStatus", {
        title: focusTitle,
        status: listingStatusLabel(t, targetStatus),
      }),
    };
  }

  return {
    draft: { ...draft, productId, confirmationRequired: true },
    operation,
    targetLabel: focusTitle,
    detailLines: [
      t("agentProducts.detailCurrentStatus", { status: currentStatus }),
      t("agentProducts.detailTargetStatus", {
        status: listingStatusLabel(t, targetStatus),
      }),
      t("agentProducts.detailSyncShopify"),
    ],
    executable: true,
  };
}

function planBatchStatusChange(
  t: TranslateFn,
  draft: ProductCommandDraft,
  ctx: ProductsPageContext,
  targetStatus: "DRAFT" | "ARCHIVED",
  operation: string
): ProductCommandPlan {
  const batchResult = resolveBatchProductIds(t, draft, ctx, { activeOnly: true });
  const totalCount = batchResult.ids.length;

  if (totalCount === 0) {
    return {
      draft,
      operation,
      targetLabel: batchResult.label,
      detailLines: [],
      executable: false,
      clarify: t("agentProducts.clarifyNoActiveInScope", {
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
    operation,
    targetLabel: t("agentProducts.targetScopeCount", {
      label: batchResult.label,
      count: totalCount,
    }),
    detailLines: [
      t("agentProducts.detailBatchScope", {
        label: batchResult.label,
        count: totalCount,
      }),
      t("agentProducts.detailTargetStatus", {
        status: listingStatusLabel(t, targetStatus),
      }),
      t("agentProducts.detailBatchSyncShopify"),
    ],
    executable: true,
  };
}

export function planProductCommand(
  t: TranslateFn,
  draft: ProductCommandDraft,
  ctx: ProductsPageContext
): ProductCommandPlan {
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
      const filter = draft.params.shopFilter ?? "all";
      const label = filterLabel(t, filter);
      return {
        draft,
        operation: t("agentProducts.opOpenFilter"),
        targetLabel: label,
        detailLines: [t("agentProducts.detailSwitchFilter", { filter: label })],
        executable: true,
      };
    }
    case "focus_product": {
      if (!productId) {
        return {
          draft,
          operation: t("agentProducts.opFocusProduct"),
          targetLabel: focusTitle,
          detailLines: [],
          executable: false,
          clarify: t("agentProducts.clarifySelectForFocus"),
        };
      }
      return {
        draft: { ...draft, productId },
        operation: t("agentProducts.opFocusProduct"),
        targetLabel: focusTitle,
        detailLines: [t("agentProducts.detailLocateProduct", { title: focusTitle })],
        executable: true,
      };
    }
    case "rerun_candidate_search": {
      if (!productId) {
        return {
          draft,
          operation: t("agentProducts.opRerunSearch"),
          targetLabel: focusTitle,
          detailLines: [],
          executable: false,
          clarify: t("agentProducts.clarifySelectForRerun"),
        };
      }
      return {
        draft: { ...draft, productId },
        operation: t("agentProducts.opRerunSearch"),
        targetLabel: focusTitle,
        detailLines: [
          t("agentProducts.detailRerunSearch", { title: focusTitle }),
        ],
        executable: true,
      };
    }
    case "explain_product_match": {
      if (!productId) {
        return {
          draft,
          operation: t("agentProducts.opExplainMatch"),
          targetLabel: focusTitle,
          detailLines: [],
          executable: false,
          clarify: t("agentProducts.clarifySelectForExplain"),
        };
      }
      if (!ctx.focusProduct || ctx.focusProduct.productId !== productId) {
        return {
          draft: { ...draft, productId },
          operation: t("agentProducts.opExplainMatch"),
          targetLabel: focusTitle,
          detailLines: [
            t("agentProducts.detailExplainThenLocate", { title: focusTitle }),
          ],
          executable: true,
        };
      }
      const mode =
        draft.params.matchExplain === "risk"
          ? t("agentProducts.matchModeRisk")
          : t("agentProducts.matchModeReason");
      return {
        draft: { ...draft, productId },
        operation: t("agentProducts.opExplainMatch"),
        targetLabel: focusTitle,
        detailLines: [
          t("agentProducts.explainMatchDetail", { title: focusTitle, mode }),
        ],
        executable: true,
      };
    }
    case "open_pricing_editor": {
      const lines = [t("agentProducts.detailOpenPricing")];
      if (productId) {
        lines.push(t("agentProducts.detailContextProduct", { title: focusTitle }));
      }
      return {
        draft,
        operation: t("agentProducts.opOpenPricing"),
        targetLabel: productId ? focusTitle : t("agentProducts.targetShopPricing"),
        detailLines: lines,
        executable: true,
      };
    }
    case "update_listing_price": {
      const price = draft.params.price;
      const currency = resolveCurrency(draft, ctx);
      if (!productId) {
        return {
          draft,
          operation: t("agentProducts.opUpdatePrice"),
          targetLabel: focusTitle,
          detailLines: [],
          executable: false,
          clarify: t("agentProducts.clarifySelectForPrice"),
        };
      }
      if (price == null || !Number.isFinite(price) || price <= 0) {
        return {
          draft,
          operation: t("agentProducts.opUpdatePrice"),
          targetLabel: focusTitle,
          detailLines: [],
          executable: false,
          clarify: t("agentProducts.clarifyInvalidPrice"),
        };
      }
      if (price > 1_000_000) {
        return {
          draft,
          operation: t("agentProducts.opUpdatePrice"),
          targetLabel: focusTitle,
          detailLines: [],
          executable: false,
          clarify: t("agentProducts.clarifyPriceOutOfRange"),
        };
      }
      return {
        draft: {
          ...draft,
          productId,
          confirmationRequired: true,
          params: { ...draft.params, price, currency },
        },
        operation: t("agentProducts.opUpdatePrice"),
        targetLabel: focusTitle,
        detailLines: [
          t("agentProducts.detailNewPrice", {
            currency,
            price: price.toFixed(2),
          }),
          t("agentProducts.detailPriceScope"),
        ],
        executable: true,
      };
    }
    case "update_product_copy": {
      const copyField = draft.params.copyField ?? "title";
      const copyAction = draft.params.copyAction ?? "translate";
      const targetLang = draft.params.copyTargetLang;
      const copyStyle = draft.params.copyStyle ?? "amazon";
      const fieldLabel = copyFieldLabel(t, copyField);
      const actionLabel = copyActionLabel(t, copyAction, targetLang);
      const operation = copyOperationLabel(t, actionLabel, fieldLabel);

      if (!productId) {
        return {
          draft,
          operation,
          targetLabel: focusTitle,
          detailLines: [],
          executable: false,
          clarify: t("agentProducts.clarifySelectForCopy"),
        };
      }

      if (copyAction === "translate" && !targetLang) {
        return {
          draft,
          operation,
          targetLabel: focusTitle,
          detailLines: [],
          executable: false,
          clarify: t("agentProducts.clarifyMissingLang"),
        };
      }

      const detailLines: string[] = [];
      detailLines.push(t("agentProducts.detailFieldTarget", { field: fieldLabel }));
      detailLines.push(t("agentProducts.detailActionType", { action: actionLabel }));
      if (copyAction === "translate" && targetLang) {
        detailLines.push(
          t("agentProducts.detailTargetLang", {
            lang: targetLang.toUpperCase(),
          })
        );
        detailLines.push(
          copyStyle === "literal"
            ? t("agentProducts.detailModeLiteral")
            : t("agentProducts.detailModeAmazon")
        );
      }
      detailLines.push(t("agentProducts.detailCopySyncShopify"));

      return {
        draft: {
          ...draft,
          productId,
          confirmationRequired: true,
          params: {
            ...draft.params,
            copyField,
            copyAction,
            copyTargetLang: targetLang,
            copyStyle,
          },
        },
        operation,
        targetLabel: focusTitle,
        detailLines,
        executable: true,
      };
    }
    case "batch_update_product_copy": {
      const copyField = draft.params.copyField ?? "title";
      const copyAction = draft.params.copyAction ?? "translate";
      const targetLang = draft.params.copyTargetLang;
      const copyStyle = draft.params.copyStyle ?? "amazon";
      const fieldLabel = copyFieldLabel(t, copyField);
      const actionLabel = copyActionLabel(t, copyAction, targetLang);
      const operation = copyOperationLabel(t, actionLabel, fieldLabel, true);

      if (copyAction === "translate" && !targetLang) {
        return {
          draft,
          operation,
          targetLabel: t("agentProducts.targetUnspecifiedLang"),
          detailLines: [],
          executable: false,
          clarify: t("agentProducts.clarifyMissingLangBatch"),
        };
      }

      const batchResult = resolveBatchProductIds(t, draft, ctx);
      const totalCount = batchResult.ids.length;

      if (totalCount === 0) {
        return {
          draft,
          operation,
          targetLabel: batchResult.label,
          detailLines: [],
          executable: false,
          clarify: t("agentProducts.clarifyNoProductsInScope", {
            label: batchResult.label,
          }),
        };
      }

      const detailLines: string[] = [];
      detailLines.push(
        t("agentProducts.detailBatchScopeProducts", {
          label: batchResult.label,
          count: totalCount,
        })
      );
      detailLines.push(t("agentProducts.detailFieldTarget", { field: fieldLabel }));
      detailLines.push(t("agentProducts.detailActionType", { action: actionLabel }));
      if (copyAction === "translate" && targetLang) {
        detailLines.push(
          t("agentProducts.detailTargetLang", {
            lang: targetLang.toUpperCase(),
          })
        );
        detailLines.push(
          copyStyle === "literal"
            ? t("agentProducts.detailModeLiteral")
            : t("agentProducts.detailModeAmazon")
        );
      }
      detailLines.push(t("agentProducts.detailBatchCopySync"));

      return {
        draft: {
          ...draft,
          targetScope: "all",
          confirmationRequired: true,
          params: {
            ...draft.params,
            copyField,
            copyAction,
            copyTargetLang: targetLang,
            copyStyle,
            batchProductIds: batchResult.ids,
          },
        },
        operation,
        targetLabel: t("agentProducts.targetScopeCount", {
          label: batchResult.label,
          count: totalCount,
        }),
        detailLines,
        executable: true,
      };
    }
    case "batch_update_listing_price": {
      const multiplier = draft.params.batchPriceMultiplier;
      const fixedPrice = draft.params.batchPriceFixed;

      if (!multiplier && !fixedPrice) {
        return {
          draft,
          operation: t("agentProducts.opBatchUpdatePrice"),
          targetLabel: t("agentProducts.targetUnspecifiedPrice"),
          detailLines: [],
          executable: false,
          clarify: t("agentProducts.clarifyMissingPricing"),
        };
      }

      const batchResult = resolveBatchProductIds(t, draft, ctx);
      const totalCount = batchResult.ids.length;

      if (totalCount === 0) {
        return {
          draft,
          operation: t("agentProducts.opBatchUpdatePrice"),
          targetLabel: batchResult.label,
          detailLines: [],
          executable: false,
          clarify: t("agentProducts.clarifyNoProductsInScope", {
            label: batchResult.label,
          }),
        };
      }

      const detailLines: string[] = [];
      detailLines.push(
        t("agentProducts.detailBatchScopeProducts", {
          label: batchResult.label,
          count: totalCount,
        })
      );
      if (multiplier) {
        detailLines.push(
          t("agentProducts.detailPricingMultiplier", { multiplier })
        );
      } else if (fixedPrice) {
        detailLines.push(
          t("agentProducts.detailPricingFixed", { price: fixedPrice })
        );
      }
      detailLines.push(t("agentProducts.detailBatchPriceSync"));

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
        operation: t("agentProducts.opBatchUpdatePrice"),
        targetLabel: t("agentProducts.targetScopeCount", {
          label: batchResult.label,
          count: totalCount,
        }),
        detailLines,
        executable: true,
      };
    }
    case "draft_product":
      return planSingleStatusChange(
        t,
        draft,
        ctx,
        "DRAFT",
        t("agentProducts.opDraftProduct")
      );
    case "archive_product":
      return planSingleStatusChange(
        t,
        draft,
        ctx,
        "ARCHIVED",
        t("agentProducts.opArchiveProduct")
      );
    case "batch_draft_products":
      return planBatchStatusChange(
        t,
        draft,
        ctx,
        "DRAFT",
        t("agentProducts.opBatchDraft")
      );
    case "batch_archive_products":
      return planBatchStatusChange(
        t,
        draft,
        ctx,
        "ARCHIVED",
        t("agentProducts.opBatchArchive")
      );
    default:
      return {
        draft,
        operation: t("agentProducts.opUnknown"),
        targetLabel: "",
        detailLines: [],
        executable: false,
        clarify: t("agentProducts.clarifyCannotExecute"),
      };
  }
}

export function resolveCommandExecution(
  t: TranslateFn,
  plan: ProductCommandPlan
): ProductCommandExecution | null {
  if (!plan.executable) return null;
  const { draft } = plan;
  const productId = draft.productId ?? draft.params.productId;

  switch (draft.intent) {
    case "open_filter": {
      const filter = draft.params.shopFilter ?? "all";
      const action: AgentSuggestedAction = {
        kind: "set_shop_filter",
        tab: "shop",
        shopFilter: filter,
        label: filterLabel(t, filter),
      };
      return { type: "agent_action", action };
    }
    case "focus_product":
      if (!productId) return null;
      return {
        type: "agent_action",
        action: {
          kind: "focus_product",
          productId,
          label: t("agentProducts.actionFocusProduct"),
        },
      };
    case "rerun_candidate_search":
      if (!productId) return null;
      return {
        type: "agent_action",
        action: {
          kind: "open_candidate_search",
          productId,
          label: t("agentProducts.actionRerunCandidates"),
        },
      };
    case "explain_product_match": {
      const intent: ProductsIntentId =
        draft.params.matchExplain === "risk"
          ? "explain_match_risk"
          : "explain_match_reason";
      return {
        type: "agent_intent",
        intent,
        productId: draft.productId ?? draft.params.productId,
      };
    }
    case "open_pricing_editor":
      return {
        type: "agent_action",
        action: {
          kind: "open_pricing_drawer",
          label: t("agentProducts.actionPricingStrategy"),
        },
      };
    case "update_listing_price": {
      const price = draft.params.price;
      const currency = draft.params.currency ?? "USD";
      if (!productId || price == null) return null;
      const variantScope = draft.params.priceScope ?? "one";
      return {
        type: "listing_price_update",
        productId,
        productTitle: plan.targetLabel,
        price,
        currency,
        variantScope,
        variantSkuId: draft.params.variantSkuId,
      };
    }
    case "update_product_copy": {
      const copyField = draft.params.copyField ?? "title";
      const copyAction = draft.params.copyAction ?? "translate";
      if (!productId) return null;
      return {
        type: "product_copy_update",
        productId,
        productTitle: plan.targetLabel,
        copyField,
        copyAction,
        targetLang: draft.params.copyTargetLang,
        tone: draft.params.copyTone,
      };
    }
    case "batch_update_product_copy": {
      const copyField = draft.params.copyField ?? "title";
      const copyAction = draft.params.copyAction ?? "translate";
      const productIds = draft.params.batchProductIds ?? [];
      if (productIds.length === 0) return null;
      return {
        type: "batch_product_copy_update",
        productIds,
        totalCount: productIds.length,
        copyField,
        copyAction,
        targetLang: draft.params.copyTargetLang,
        tone: draft.params.copyTone,
        filterLabel: plan.targetLabel,
      };
    }
    case "batch_update_listing_price": {
      const productIds = draft.params.batchProductIds ?? [];
      if (productIds.length === 0) return null;
      return {
        type: "batch_listing_price_update",
        productIds,
        totalCount: productIds.length,
        batchPriceMultiplier: draft.params.batchPriceMultiplier,
        batchPriceFixed: draft.params.batchPriceFixed,
        filterLabel: plan.targetLabel,
      };
    }
    case "draft_product": {
      if (!productId) return null;
      return {
        type: "product_status_update",
        productId,
        productTitle: plan.targetLabel,
        targetStatus: "DRAFT",
      };
    }
    case "archive_product": {
      if (!productId) return null;
      return {
        type: "product_status_update",
        productId,
        productTitle: plan.targetLabel,
        targetStatus: "ARCHIVED",
      };
    }
    case "batch_draft_products": {
      const productIds = draft.params.batchProductIds ?? [];
      if (productIds.length === 0) return null;
      return {
        type: "batch_product_status_update",
        productIds,
        totalCount: productIds.length,
        targetStatus: "DRAFT",
        filterLabel: plan.targetLabel,
      };
    }
    case "batch_archive_products": {
      const productIds = draft.params.batchProductIds ?? [];
      if (productIds.length === 0) return null;
      return {
        type: "batch_product_status_update",
        productIds,
        totalCount: productIds.length,
        targetStatus: "ARCHIVED",
        filterLabel: plan.targetLabel,
      };
    }
    default:
      return null;
  }
}

export function commandRequiresConfirmation(plan: ProductCommandPlan): boolean {
  return (
    plan.draft.confirmationRequired ||
    plan.draft.intent === "update_listing_price" ||
    plan.draft.intent === "update_product_copy" ||
    plan.draft.intent === "batch_update_product_copy" ||
    plan.draft.intent === "batch_update_listing_price" ||
    plan.draft.intent === "draft_product" ||
    plan.draft.intent === "archive_product" ||
    plan.draft.intent === "batch_draft_products" ||
    plan.draft.intent === "batch_archive_products"
  );
}

function commandOperationLabel(
  t: TranslateFn,
  intent: ProductCommandDraft["intent"]
): string {
  switch (intent) {
    case "open_filter":
      return t("agentProducts.opOpenFilter");
    case "focus_product":
      return t("agentProducts.opFocusProduct");
    case "rerun_candidate_search":
      return t("agentProducts.opRerunSearch");
    case "explain_product_match":
      return t("agentProducts.opExplainMatch");
    case "open_pricing_editor":
      return t("agentProducts.opOpenPricing");
    case "update_listing_price":
      return t("agentProducts.opUpdatePrice");
    case "update_product_copy":
      return t("agentProducts.opUpdateCopy");
    case "batch_update_product_copy":
      return t("agentProducts.opBatchUpdateCopy");
    case "batch_update_listing_price":
      return t("agentProducts.opBatchUpdatePrice");
    case "draft_product":
      return t("agentProducts.opDraftProduct");
    case "archive_product":
      return t("agentProducts.opArchiveProduct");
    case "batch_draft_products":
      return t("agentProducts.opBatchDraft");
    case "batch_archive_products":
      return t("agentProducts.opBatchArchive");
    default:
      return t("agentProducts.opExecute");
  }
}
