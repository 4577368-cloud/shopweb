import type { ProductsPageContext } from "@/lib/agents/products/page-context";
import type { ProductCommandPlan } from "@/lib/agents/products/command-schema";
import type { SuggestedActionKind } from "@/lib/agents/types";
import type { TranslateFn } from "@/i18n/server";

/** 轻量级 Skill — 第一轮不做状态机，只做命令→任务的映射和反馈包装 */
export interface ProductSkill {
  id: string;
  commandIds: string[];

  /** 根据页面上下文判断是否处于活跃状态 */
  isActive: (ctx: ProductsPageContext) => boolean;

  /** 计算 skill 当前进度（0-100），null 表示无法计算 */
  progress: (ctx: ProductsPageContext) => number | null;

  /** 生成下一步建议 */
  nextSteps: (ctx: ProductsPageContext, t: TranslateFn) => SkillNextStep[];
}

export interface SkillNextStep {
  label: string;

  /** 动作类型，对应 AgentSuggestedAction.kind，点击后直接执行 */
  kind?: SuggestedActionKind;

  /** 筛选条件，用于 set_shop_filter */
  shopFilter?: "all" | "pending" | "confirmed" | "unbound" | "new_arrivals";

  /** 标签页，用于 set_tab */
  tab?: "shop" | "catalog";

  /** 商品ID，用于 focus_product */
  productId?: string;

  /** 意图ID，用于 trigger_intent（保留给需要走 LLM 的动作） */
  intent?: string;
}

/** 命令执行后的任务反馈 */
export interface SkillExecutionFeedback {
  skillName: string;
  summary: string;
  detailLines: string[];
  progress: number | null;
  nextSteps: SkillNextStep[];
}

function skillKey(skillId: string, suffix: string) {
  return `productSkills.${skillId}.${suffix}`;
}

function skillName(t: TranslateFn, skillId: string) {
  return t(skillKey(skillId, "name"));
}

// ── Skill 1: 清理待确认 ──────────────────────────────────────────

const cleanupPendingSkill: ProductSkill = {
  id: "cleanup_pending",
  commandIds: ["open_filter", "batch_ack_pending"],

  isActive: (ctx) => ctx.pendingCount > 0,

  progress: (ctx) => {
    if (ctx.analyzedCount === 0) return null;
    const processed = ctx.analyzedCount - ctx.pendingCount;
    return Math.round((processed / ctx.analyzedCount) * 100);
  },

  nextSteps: (ctx, t) => {
    const steps: SkillNextStep[] = [];
    if (ctx.pendingCount > 0) {
      steps.push({
        label: t(skillKey("cleanup_pending", "viewPending"), {
          count: ctx.pendingCount,
        }),
        kind: "set_shop_filter",
        shopFilter: "pending",
      });
    }
    if (ctx.unboundCount > 0) {
      steps.push({
        label: t(skillKey("cleanup_pending", "handleUnbound"), {
          count: ctx.unboundCount,
        }),
        kind: "set_shop_filter",
        shopFilter: "unbound",
      });
    }
    if (steps.length === 0) {
      steps.push({
        label: t(skillKey("cleanup_pending", "discoverNew")),
        kind: "set_tab",
        tab: "catalog",
      });
    }
    return steps;
  },
};

// ── Skill 2: 批量翻译 ────────────────────────────────────────────

const batchTranslateSkill: ProductSkill = {
  id: "batch_translate",
  commandIds: ["batch_update_product_copy", "update_product_copy"],

  isActive: () => true,

  progress: () => null,

  nextSteps: (ctx, t) => {
    const steps: SkillNextStep[] = [];
    if (ctx.pendingCount > 0) {
      steps.push({
        label: t(skillKey("batch_translate", "confirmPending"), {
          count: ctx.pendingCount,
        }),
        kind: "set_shop_filter",
        shopFilter: "pending",
      });
    }
    if (!ctx.pricing.configured) {
      steps.push({
        label: t(skillKey("batch_translate", "configurePricing")),
        kind: "open_pricing_drawer",
      });
    }
    return steps;
  },
};

// ── Skill 3: 定价诊断 ────────────────────────────────────────────

const pricingDiagnosticSkill: ProductSkill = {
  id: "pricing_diagnostic",
  commandIds: ["open_pricing_editor", "update_listing_price", "batch_update_listing_price"],

  isActive: (ctx) => !ctx.pricing.configured || ctx.pricing.isDefault,

  progress: (ctx) => {
    if (ctx.pricing.configured && !ctx.pricing.isDefault) return 100;
    return 0;
  },

  nextSteps: (ctx, t) => {
    const steps: SkillNextStep[] = [];
    if (!ctx.pricing.configured || ctx.pricing.isDefault) {
      steps.push({
        label: t(skillKey("pricing_diagnostic", "openPricing")),
        kind: "open_pricing_drawer",
      });
    } else {
      steps.push({
        label: t(skillKey("pricing_diagnostic", "viewPricingSummary")),
        kind: "open_pricing_drawer",
      });
    }
    if (ctx.unboundCount > 0) {
      steps.push({
        label: t(skillKey("pricing_diagnostic", "handleUnbound"), {
          count: ctx.unboundCount,
        }),
        kind: "set_shop_filter",
        shopFilter: "unbound",
      });
    }
    return steps;
  },
};

// ── Skill 4: 商品上下架 ────────────────────────────────────────────

const listingStatusSkill: ProductSkill = {
  id: "listing_status",
  commandIds: [
    "draft_product",
    "archive_product",
    "batch_draft_products",
    "batch_archive_products",
  ],

  isActive: () => true,
  progress: () => null,

  nextSteps: (_ctx, t) => [
    {
      label: t(skillKey("listing_status", "viewAll")),
      kind: "set_shop_filter",
      shopFilter: "all",
    },
  ],
};

export const PRODUCT_SKILLS: ProductSkill[] = [
  cleanupPendingSkill,
  batchTranslateSkill,
  pricingDiagnosticSkill,
  listingStatusSkill,
];

export const SKILL_MAP = new Map<string, ProductSkill>();
for (const skill of PRODUCT_SKILLS) {
  for (const cmdId of skill.commandIds) {
    SKILL_MAP.set(cmdId, skill);
  }
}

/** 根据命令 intent 查找对应的 skill */
export function findSkillByCommandId(intent: string): ProductSkill | null {
  return SKILL_MAP.get(intent) ?? null;
}

function appendBatchOutcomeLines(
  t: TranslateFn,
  detailLines: string[],
  opts?: { successCount?: number; failedCount?: number; totalCount?: number }
) {
  const total = opts?.totalCount ?? 0;
  const success = opts?.successCount ?? total;
  const failed = opts?.failedCount ?? 0;
  if (total <= 0) return;
  detailLines.push(t("productSkills.common.processed", { count: total }));
  if (success > 0) {
    detailLines.push(t("productSkills.common.success", { count: success }));
  }
  if (failed > 0) {
    detailLines.push(t("productSkills.common.failed", { count: failed }));
  }
}

/** 生成命令执行后的任务反馈 */
export function buildSkillFeedback(
  t: TranslateFn,
  plan: ProductCommandPlan,
  ctx: ProductsPageContext,
  opts?: {
    successCount?: number;
    failedCount?: number;
    totalCount?: number;
  }
): SkillExecutionFeedback | null {
  const skill = findSkillByCommandId(plan.draft.intent);
  if (!skill) return null;

  const progress = skill.progress(ctx);
  const nextSteps = skill.nextSteps(ctx, t);
  const detailLines: string[] = [];

  switch (plan.draft.intent) {
    case "batch_update_product_copy":
      appendBatchOutcomeLines(t, detailLines, {
        totalCount: opts?.totalCount ?? plan.draft.params.batchProductIds?.length ?? 0,
        successCount: opts?.successCount,
        failedCount: opts?.failedCount,
      });
      break;
    case "update_product_copy":
      detailLines.push(
        t(skillKey("batch_translate", "updatedCopy"), {
          title: plan.targetLabel,
        })
      );
      break;
    case "update_listing_price":
      detailLines.push(
        t(skillKey("pricing_diagnostic", "updatedPrice"), {
          title: plan.targetLabel,
          currency: plan.draft.params.currency ?? "",
          price: plan.draft.params.price ?? "",
        })
      );
      break;
    case "batch_update_listing_price":
      appendBatchOutcomeLines(t, detailLines, {
        totalCount: opts?.totalCount ?? plan.draft.params.batchProductIds?.length ?? 0,
        successCount: opts?.successCount,
        failedCount: opts?.failedCount,
      });
      break;
    case "draft_product":
    case "archive_product":
      detailLines.push(
        t(skillKey("listing_status", "updatedStatus"), {
          title: plan.targetLabel,
        })
      );
      break;
    case "batch_draft_products":
    case "batch_archive_products":
      appendBatchOutcomeLines(t, detailLines, {
        totalCount: opts?.totalCount ?? plan.draft.params.batchProductIds?.length ?? 0,
        successCount: opts?.successCount,
        failedCount: opts?.failedCount,
      });
      break;
    case "open_filter":
      detailLines.push(
        t(skillKey("cleanup_pending", "switchedFilter"), {
          filter: plan.targetLabel,
        })
      );
      break;
    default:
      if (plan.operation.trim()) detailLines.push(plan.operation);
  }

  const localizedSkillName = skillName(t, skill.id);

  return {
    skillName: localizedSkillName,
    summary: t("productSkills.summary", {
      skill: localizedSkillName,
      operation: plan.operation,
    }),
    detailLines,
    progress,
    nextSteps,
  };
}

/** 判断某个命令是否属于已知的 skill */
export function commandBelongsToSkill(intent: string): boolean {
  return SKILL_MAP.has(intent);
}
