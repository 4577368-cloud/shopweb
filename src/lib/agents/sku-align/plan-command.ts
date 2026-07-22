import type {
  SkuCommandDraft,
  SkuCommandExecution,
  SkuCommandPlan,
  SkuFilterMode,
} from "@/lib/agents/sku-align/command-schema";
import type { SkuProductOverview } from "@/lib/types";

const FILTER_LABELS: Record<SkuFilterMode, string> = {
  all: "全部商品",
  fully_linked: "全部关联",
  partially_linked: "部分关联",
};

export interface SkuPageContext {
  productCatalog: SkuProductOverview[];
  focusProductId?: string | null;
  focusProduct?: SkuProductOverview | null;
  currentFilter?: string | null;
}

function needsFocusProduct(intent: SkuCommandDraft["intent"]): boolean {
  return (
    intent === "rerun_auto_align" ||
    intent === "explain_sku_match" ||
    intent === "open_sku_detail"
  );
}

function resolveProductId(
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
        clarify: `找到多个名称相近的商品，请点选其中一个后再试：${matches
          .slice(0, 5)
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

function resolveBatchProductIds(
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
    all: "全部商品",
    partially_linked: "部分关联商品",
  };
  const label = filterLabels[filter] ?? "全部商品";

  return { ids, label };
}

export function planSkuCommand(
  draft: SkuCommandDraft,
  ctx: SkuPageContext
): SkuCommandPlan {
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
      const filter = draft.params.filterMode ?? "all";
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
            "请先在列表中点选商品，或在命令里写出商品名（如：看「拖鞋」的详情）。",
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
    case "rerun_auto_align": {
      if (draft.targetScope === "all") {
        const batchResult = resolveBatchProductIds(draft, ctx);
        const totalCount = batchResult.ids.length;
        if (totalCount === 0) {
          return {
            draft,
            operation: "批量重新对齐",
            targetLabel: batchResult.label,
            detailLines: [],
            executable: false,
            clarify: `当前「${batchResult.label}」范围内没有商品，无法执行批量对齐。`,
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
          operation: "批量重新对齐",
          targetLabel: `${batchResult.label} · ${totalCount} 个`,
          detailLines: [
            `处理范围：${batchResult.label}（共 ${totalCount} 个商品）`,
            "将为每个商品重新运行自动对齐，查找 SKU 候选",
          ],
          executable: true,
        };
      }
      if (!productId) {
        return {
          draft,
          operation: "重新对齐",
          targetLabel: focusTitle,
          detailLines: [],
          executable: false,
          clarify:
            "请先在列表中点选商品，或在命令里写出商品名（如：重新对齐「拖鞋」）。",
        };
      }
      return {
        draft: { ...draft, productId },
        operation: "重新对齐",
        targetLabel: focusTitle,
        detailLines: [`将为「${focusTitle}」重新运行自动对齐，查找 SKU 候选`],
        executable: true,
      };
    }
    case "explain_sku_match": {
      if (!productId) {
        return {
          draft,
          operation: "解释匹配",
          targetLabel: focusTitle,
          detailLines: [],
          executable: false,
          clarify:
            "请先在列表中点选商品，或在命令里写出商品名（如：解释「拖鞋」的匹配）。",
        };
      }
      return {
        draft: { ...draft, productId },
        operation: "解释匹配",
        targetLabel: focusTitle,
        detailLines: [`将说明「${focusTitle}」的 SKU 匹配依据和置信度`],
        executable: true,
      };
    }
    case "open_sku_detail": {
      if (!productId) {
        return {
          draft,
          operation: "打开详情",
          targetLabel: focusTitle,
          detailLines: [],
          executable: false,
          clarify:
            "请先在列表中点选商品，或在命令里写出商品名（如：打开「拖鞋」的详情）。",
        };
      }
      return {
        draft: { ...draft, productId },
        operation: "打开详情",
        targetLabel: focusTitle,
        detailLines: [`将打开「${focusTitle}」的 SKU 映射详情`],
        executable: true,
      };
    }
    case "batch_confirm_pending": {
      const batchResult = resolveBatchProductIds(draft, ctx);
      const totalCount = batchResult.ids.length;

      if (totalCount === 0) {
        return {
          draft,
          operation: "批量确认待匹配",
          targetLabel: batchResult.label,
          detailLines: [],
          executable: false,
          clarify: `当前「${batchResult.label}」范围内没有待确认的变体，无法执行批量确认。`,
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
        operation: "批量确认待匹配",
        targetLabel: `${batchResult.label} · ${totalCount} 个`,
        detailLines: [
          `处理范围：${batchResult.label}（共 ${totalCount} 个商品）`,
          "将接受 AI 建议的 SKU 匹配，自动绑定为已对齐状态",
        ],
        executable: true,
      };
    }
    default:
      return {
        draft,
        operation: "执行命令",
        targetLabel: focusTitle,
        detailLines: [],
        executable: false,
        clarify: "该命令暂未实现",
      };
  }
}

export function commandRequiresConfirmation(plan: SkuCommandPlan): boolean {
  return (
    plan.draft.confirmationRequired ||
    plan.draft.intent === "batch_confirm_pending"
  );
}

export function commandOperationLabel(intent: SkuCommandDraft["intent"]): string {
  switch (intent) {
    case "open_filter":
      return "切换筛选";
    case "focus_product":
      return "聚焦商品";
    case "batch_confirm_pending":
      return "批量确认待匹配";
    case "rerun_auto_align":
      return "重新对齐";
    case "explain_sku_match":
      return "解释匹配";
    case "open_sku_detail":
      return "打开详情";
    default:
      return "执行命令";
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
    default:
      return null;
  }
}