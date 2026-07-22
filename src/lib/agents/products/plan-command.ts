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
  LISTING_STATUS_LABELS,
  normalizeShopStatus,
} from "@/lib/shop-product-status";

const FILTER_LABELS: Record<ProductCommandShopFilter, string> = {
  all: "全部商品",
  pending: "AI 待确认",
  unbound: "未关联",
  confirmed: "已确认",
  new_arrivals: "新入库",
};

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
        clarify: `找到多个名称相近的商品，请点选其中一个后再试：${resolved.matches
          .map((m) => `「${m.title}」`)
          .join("、")}`,
      };
    }
    return {
      productId: null,
      title: null,
      clarify: `未找到名称包含「${hint}」的商品，请先在列表中点选商品，或换个更完整的标题。`,
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
    all: opts?.activeOnly ? "全部在售商品" : "全部商品",
    pending: "待确认商品",
    confirmed: "已确认商品",
    unbound: "未匹配商品",
  };
  const label = filterLabels[filter] ?? (opts?.activeOnly ? "全部在售商品" : "全部商品");

  return { ids, label };
}

function planSingleStatusChange(
  draft: ProductCommandDraft,
  ctx: ProductsPageContext,
  targetStatus: "DRAFT" | "ARCHIVED",
  operation: string
): ProductCommandPlan {
  const resolved = resolveProductId(draft, ctx);
  const productId = resolved.productId;
  const focusTitle =
    resolved.title ??
    ctx.focusProduct?.title ??
    (productId ? `商品 ${productId.slice(-8)}` : "未选中商品");

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
      clarify:
        "请先在左侧列表中点一下目标商品，或在命令里写出商品名（如：把「拖鞋」放到草稿）。",
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
      clarify: `「${focusTitle}」已经是 ${LISTING_STATUS_LABELS[targetStatus]}，无需重复操作。`,
    };
  }

  return {
    draft: { ...draft, productId, confirmationRequired: true },
    operation,
    targetLabel: focusTitle,
    detailLines: [
      `当前状态：${currentStatus}`,
      `目标状态：${LISTING_STATUS_LABELS[targetStatus]}`,
      "确认后将同步到 Shopify",
    ],
    executable: true,
  };
}

function planBatchStatusChange(
  draft: ProductCommandDraft,
  ctx: ProductsPageContext,
  targetStatus: "DRAFT" | "ARCHIVED",
  operation: string
): ProductCommandPlan {
  const batchResult = resolveBatchProductIds(draft, ctx, { activeOnly: true });
  const totalCount = batchResult.ids.length;

  if (totalCount === 0) {
    return {
      draft,
      operation,
      targetLabel: batchResult.label,
      detailLines: [],
      executable: false,
      clarify: `当前「${batchResult.label}」范围内没有可操作的 ACTIVE 商品。`,
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
    targetLabel: `${batchResult.label} · ${totalCount} 个`,
    detailLines: [
      `处理范围：${batchResult.label}（共 ${totalCount} 个 ACTIVE 商品）`,
      `目标状态：${LISTING_STATUS_LABELS[targetStatus]}`,
      "确认后将逐个同步到 Shopify",
    ],
    executable: true,
  };
}

export function planProductCommand(
  draft: ProductCommandDraft,
  ctx: ProductsPageContext
): ProductCommandPlan {
  const resolved = resolveProductId(draft, ctx);
  const productId = resolved.productId;
  const focusTitle =
    resolved.title ??
    ctx.focusProduct?.title ??
    (productId ? `商品 ${productId.slice(-8)}` : "未选中商品");

  if (resolved.clarify) {
    return {
      draft,
      operation: commandOperationLabel(draft.intent),
      targetLabel: focusTitle,
      detailLines: [],
      executable: false,
      clarify: resolved.clarify,
    };
  }

  switch (draft.intent) {
    case "open_filter": {
      const filter = draft.params.shopFilter ?? "all";
      return {
        draft,
        operation: "切换列表筛选",
        targetLabel: FILTER_LABELS[filter],
        detailLines: [`将切换到「${FILTER_LABELS[filter]}」视图`],
        executable: true,
      };
    }
    case "focus_product": {
      if (!productId) {
        return {
          draft,
          operation: "聚焦商品",
          targetLabel: focusTitle,
          detailLines: [],
          executable: false,
          clarify:
            "请先在列表中点选商品，或在命令里写出商品名（如：把「拖鞋」的售价改成 9.9）。",
        };
      }
      return {
        draft: { ...draft, productId },
        operation: "聚焦商品",
        targetLabel: focusTitle,
        detailLines: [`将在列表中定位：${focusTitle}`],
        executable: true,
      };
    }
    case "rerun_candidate_search": {
      if (!productId) {
        return {
          draft,
          operation: "重新搜索候选",
          targetLabel: focusTitle,
          detailLines: [],
          executable: false,
          clarify:
            "请先在列表中点选商品，或在命令里写出商品名（如：给「拖鞋」再找候选）。",
        };
      }
      return {
        draft: { ...draft, productId },
        operation: "重新搜索候选",
        targetLabel: focusTitle,
        detailLines: [`将为「${focusTitle}」打开图搜并加载候选`],
        executable: true,
      };
    }
    case "explain_product_match": {
      if (!productId) {
        return {
          draft,
          operation: "解释匹配",
          targetLabel: focusTitle,
          detailLines: [],
          executable: false,
          clarify:
            "请先在列表中点选商品，或在命令里写出商品名（如：为什么推荐「拖鞋」的货源）。",
        };
      }
      if (!ctx.focusProduct || ctx.focusProduct.productId !== productId) {
        return {
          draft: { ...draft, productId },
          operation: "解释匹配",
          targetLabel: focusTitle,
          detailLines: [`将先定位「${focusTitle}」，再说明匹配依据`],
          executable: true,
        };
      }
      const mode = draft.params.matchExplain === "risk" ? "不确定点" : "推荐依据";
      return {
        draft: { ...draft, productId },
        operation: "解释匹配",
        targetLabel: focusTitle,
        detailLines: [`将说明「${focusTitle}」的${mode}`],
        executable: true,
      };
    }
    case "open_pricing_editor": {
      const lines = ["将打开定价策略侧栏"];
      if (productId) lines.push(`当前上下文：${focusTitle}`);
      return {
        draft,
        operation: "打开定价设置",
        targetLabel: productId ? focusTitle : "店铺定价",
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
          operation: "修改商品售价",
          targetLabel: focusTitle,
          detailLines: [],
          executable: false,
          clarify:
            "请先在左侧列表中点一下目标商品（右侧会显示「已选 · 商品名」），再说「这个商品价格改为 22.9」。",
        };
      }
      if (price == null || !Number.isFinite(price) || price <= 0) {
        return {
          draft,
          operation: "修改商品售价",
          targetLabel: focusTitle,
          detailLines: [],
          executable: false,
          clarify: "请说明合法的 Shopify 售价金额，例如「把售价改成 9.9 美元」。",
        };
      }
      if (price > 1_000_000) {
        return {
          draft,
          operation: "修改商品售价",
          targetLabel: focusTitle,
          detailLines: [],
          executable: false,
          clarify: "售价超出允许范围，请检查金额是否正确。",
        };
      }
      return {
        draft: {
          ...draft,
          productId,
          confirmationRequired: true,
          params: { ...draft.params, price, currency },
        },
        operation: "修改商品售价",
        targetLabel: focusTitle,
        detailLines: [
          `新售价：${currency} ${price.toFixed(2)}`,
          "确认时将选择要修改的规格范围（全部或某一 SKU）",
        ],
        executable: true,
      };
    }
    case "update_product_copy": {
      const copyField = draft.params.copyField ?? "title";
      const copyAction = draft.params.copyAction ?? "translate";
      const targetLang = draft.params.copyTargetLang;
      const copyStyle = draft.params.copyStyle ?? "amazon";
      const fieldLabel =
        copyField === "title" ? "标题" : copyField === "description" ? "描述" : "全部文案";
      const actionLabel =
        copyAction === "translate"
          ? `本土化${targetLang ? `为 ${targetLang.toUpperCase()}` : ""}`
          : copyAction === "rewrite"
            ? "改写"
            : "优化";

      if (!productId) {
        return {
          draft,
          operation: `${actionLabel}商品${fieldLabel}`,
          targetLabel: focusTitle,
          detailLines: [],
          executable: false,
          clarify:
            "请先在左侧列表中点一下目标商品（右侧会显示「已选 · 商品名」），再说「翻译这个商品标题」。",
        };
      }

      if (copyAction === "translate" && !targetLang) {
        return {
          draft,
          operation: `${actionLabel}商品${fieldLabel}`,
          targetLabel: focusTitle,
          detailLines: [],
          executable: false,
          clarify: "请说明目标语言，例如「把标题翻译成英文」。",
        };
      }

      const detailLines: string[] = [];
      detailLines.push(`目标字段：${fieldLabel}`);
      detailLines.push(`操作类型：${actionLabel}`);
      if (copyAction === "translate" && targetLang) {
        detailLines.push(`目标语言：${targetLang.toUpperCase()}`);
        detailLines.push(
          copyStyle === "literal"
            ? "模式：直译"
            : "模式：去噪 + Amazon 结构重组（批发/跨境/营销词过滤，非直译）"
        );
      }
      detailLines.push("确认后将生成新标题并更新到 Shopify");

      return {
        draft: {
          ...draft,
          productId,
          confirmationRequired: true,
          params: { ...draft.params, copyField, copyAction, copyTargetLang: targetLang, copyStyle },
        },
        operation: `${actionLabel}商品${fieldLabel}`,
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
      const fieldLabel =
        copyField === "title" ? "标题" : copyField === "description" ? "描述" : "全部文案";
      const actionLabel =
        copyAction === "translate"
          ? `本土化${targetLang ? `为 ${targetLang.toUpperCase()}` : ""}`
          : copyAction === "rewrite"
            ? "改写"
            : "优化";

      if (copyAction === "translate" && !targetLang) {
        return {
          draft,
          operation: `批量${actionLabel}商品${fieldLabel}`,
          targetLabel: "未指定语言",
          detailLines: [],
          executable: false,
          clarify: "请说明目标语言，例如「把所有商品标题翻译成英文」。",
        };
      }

      const batchResult = resolveBatchProductIds(draft, ctx);
      const totalCount = batchResult.ids.length;

      if (totalCount === 0) {
        return {
          draft,
          operation: `批量${actionLabel}商品${fieldLabel}`,
          targetLabel: batchResult.label,
          detailLines: [],
          executable: false,
          clarify: `当前「${batchResult.label}」范围内没有商品，无法执行批量操作。`,
        };
      }

      const detailLines: string[] = [];
      detailLines.push(`处理范围：${batchResult.label}（共 ${totalCount} 个商品）`);
      detailLines.push(`目标字段：${fieldLabel}`);
      detailLines.push(`操作类型：${actionLabel}`);
      if (copyAction === "translate" && targetLang) {
        detailLines.push(`目标语言：${targetLang.toUpperCase()}`);
        detailLines.push(
          copyStyle === "literal"
            ? "模式：直译"
            : "模式：去噪 + Amazon 结构重组（批发/跨境/营销词过滤，非直译）"
        );
      }
      detailLines.push("确认后将逐个生成新标题并更新到 Shopify");

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
        operation: `批量${actionLabel}商品${fieldLabel}`,
        targetLabel: `${batchResult.label} · ${totalCount} 个`,
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
          operation: "批量修改商品售价",
          targetLabel: "未指定价格",
          detailLines: [],
          executable: false,
          clarify: "请说明定价方式，例如「所有商品定价改为采购价2倍」或「所有商品售价改成9.9」。",
        };
      }

      const batchResult = resolveBatchProductIds(draft, ctx);
      const totalCount = batchResult.ids.length;

      if (totalCount === 0) {
        return {
          draft,
          operation: "批量修改商品售价",
          targetLabel: batchResult.label,
          detailLines: [],
          executable: false,
          clarify: `当前「${batchResult.label}」范围内没有商品，无法执行批量操作。`,
        };
      }

      const detailLines: string[] = [];
      detailLines.push(`处理范围：${batchResult.label}（共 ${totalCount} 个商品）`);
      if (multiplier) {
        detailLines.push(`定价方式：采购价 × ${multiplier}`);
      } else if (fixedPrice) {
        detailLines.push(`定价方式：固定价格 ${fixedPrice}`);
      }
      detailLines.push("确认后将逐个更新商品售价到 Shopify");

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
        operation: "批量修改商品售价",
        targetLabel: `${batchResult.label} · ${totalCount} 个`,
        detailLines,
        executable: true,
      };
    }
    case "draft_product":
      return planSingleStatusChange(draft, ctx, "DRAFT", "放到草稿");
    case "archive_product":
      return planSingleStatusChange(draft, ctx, "ARCHIVED", "下架归档");
    case "batch_draft_products":
      return planBatchStatusChange(draft, ctx, "DRAFT", "批量放到草稿");
    case "batch_archive_products":
      return planBatchStatusChange(draft, ctx, "ARCHIVED", "批量下架归档");
    default:
      return {
        draft,
        operation: "未知命令",
        targetLabel: "",
        detailLines: [],
        executable: false,
        clarify: "无法执行该命令。",
      };
  }
}

export function resolveCommandExecution(
  plan: ProductCommandPlan
): ProductCommandExecution | null {
  if (!plan.executable) return null;
  const { draft } = plan;
  const productId = draft.productId ?? draft.params.productId;

  switch (draft.intent) {
    case "open_filter": {
      const action: AgentSuggestedAction = {
        kind: "set_shop_filter",
        tab: "shop",
        shopFilter: draft.params.shopFilter ?? "all",
        label: FILTER_LABELS[draft.params.shopFilter ?? "all"],
      };
      return { type: "agent_action", action };
    }
    case "focus_product":
      if (!productId) return null;
      return {
        type: "agent_action",
        action: { kind: "focus_product", productId, label: "聚焦商品" },
      };
    case "rerun_candidate_search":
      if (!productId) return null;
      return {
        type: "agent_action",
        action: { kind: "open_candidate_search", productId, label: "重搜候选" },
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
        action: { kind: "open_pricing_drawer", label: "定价策略" },
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

function commandOperationLabel(intent: ProductCommandDraft["intent"]): string {
  switch (intent) {
    case "open_filter":
      return "切换列表筛选";
    case "focus_product":
      return "聚焦商品";
    case "rerun_candidate_search":
      return "重新搜索候选";
    case "explain_product_match":
      return "解释匹配";
    case "open_pricing_editor":
      return "打开定价设置";
    case "update_listing_price":
      return "修改商品售价";
    case "update_product_copy":
      return "修改商品文案";
    case "batch_update_product_copy":
      return "批量修改商品文案";
    case "batch_update_listing_price":
      return "批量修改商品售价";
    case "draft_product":
      return "放到草稿";
    case "archive_product":
      return "下架归档";
    case "batch_draft_products":
      return "批量放到草稿";
    case "batch_archive_products":
      return "批量下架归档";
    default:
      return "执行命令";
  }
}
