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
    intent === "update_listing_price"
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
    default:
      return null;
  }
}

export function commandRequiresConfirmation(plan: ProductCommandPlan): boolean {
  return (
    plan.draft.confirmationRequired ||
    plan.draft.intent === "update_listing_price"
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
    default:
      return "执行命令";
  }
}
