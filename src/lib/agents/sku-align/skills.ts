import type { SkuPageContext } from "@/lib/agents/sku-align/plan-command";
import type { SkuCommandPlan } from "@/lib/agents/sku-align/command-schema";
import type { SuggestedActionKind } from "@/lib/agents/types";
import type { SkuProductOverview } from "@/lib/types";

function isPartiallyLinked(product: SkuProductOverview): boolean {
  const active = product.variants.filter((v) => v.bound?.bindStatus === "ACTIVE").length;
  const pending = product.variants.filter((v) => v.bound?.bindStatus === "PENDING").length;
  return pending > 0 || (active > 0 && active < product.variants.length);
}

function isFullyLinked(product: SkuProductOverview): boolean {
  return product.variants.length > 0 && product.variants.every((v) => v.bound?.bindStatus === "ACTIVE");
}

export interface SkuSkill {
  id: string;
  name: string;
  description: string;
  commandIds: string[];
  isActive: (ctx: SkuPageContext) => boolean;
  progress: (ctx: SkuPageContext) => number | null;
  nextSteps: (ctx: SkuPageContext) => SkillNextStep[];
}

export interface SkillNextStep {
  label: string;
  kind?: SuggestedActionKind;
  filterMode?: "all" | "fully_linked" | "partially_linked";
  productId?: string;
}

export interface SkillExecutionFeedback {
  skillName: string;
  summary: string;
  detailLines: string[];
  progress: number | null;
  nextSteps: SkillNextStep[];
}

const confirmPendingSkill: SkuSkill = {
  id: "confirm_pending",
  name: "确认待匹配",
  description: "审核并确认 AI 自动对齐的 SKU 匹配建议",
  commandIds: ["batch_confirm_pending", "open_filter"],

  isActive: (ctx) => {
    const partiallyLinked = ctx.productCatalog.filter(isPartiallyLinked).length;
    return partiallyLinked > 0;
  },

  progress: (ctx) => {
    const total = ctx.productCatalog.length;
    if (total === 0) return null;
    const fullyLinked = ctx.productCatalog.filter(isFullyLinked).length;
    return Math.round((fullyLinked / total) * 100);
  },

  nextSteps: (ctx) => {
    const steps: SkillNextStep[] = [];
    const partiallyLinked = ctx.productCatalog.filter(isPartiallyLinked).length;
    if (partiallyLinked > 0) {
      steps.push({
        label: `查看 ${partiallyLinked} 个部分关联商品`,
        kind: "set_shop_filter",
        filterMode: "partially_linked",
      });
    }
    const fullyLinked = ctx.productCatalog.filter(isFullyLinked).length;
    if (fullyLinked > 0) {
      steps.push({
        label: `查看 ${fullyLinked} 个全部关联商品`,
        kind: "set_shop_filter",
        filterMode: "fully_linked",
      });
    }
    return steps;
  },
};

const autoAlignSkill: SkuSkill = {
  id: "auto_align",
  name: "自动对齐",
  description: "重新运行 SKU 自动对齐，优化变体与货源的映射",
  commandIds: ["rerun_auto_align"],

  isActive: () => true,

  progress: () => null,

  nextSteps: (ctx) => {
    const steps: SkillNextStep[] = [];
    if (ctx.focusProductId) {
      steps.push({
        label: "重新对齐当前商品",
      });
    }
    steps.push({
      label: "查看全部商品",
      kind: "set_shop_filter",
      filterMode: "all",
    });
    return steps;
  },
};

export const SKU_SKILLS: SkuSkill[] = [confirmPendingSkill, autoAlignSkill];

export const SKU_SKILL_MAP = new Map<string, SkuSkill>();
for (const skill of SKU_SKILLS) {
  for (const cmdId of skill.commandIds) {
    SKU_SKILL_MAP.set(cmdId, skill);
  }
}

export function findSkuSkillByCommandId(intent: string): SkuSkill | null {
  return SKU_SKILL_MAP.get(intent) ?? null;
}

export function buildSkuSkillFeedback(
  plan: SkuCommandPlan,
  ctx: SkuPageContext,
  opts?: {
    successCount?: number;
    failedCount?: number;
    totalCount?: number;
  }
): SkillExecutionFeedback | null {
  const skill = findSkuSkillByCommandId(plan.draft.intent);
  if (!skill) return null;

  const progress = skill.progress(ctx);
  const nextSteps = skill.nextSteps(ctx);
  const detailLines: string[] = [];

  switch (plan.draft.intent) {
    case "batch_confirm_pending": {
      const total = opts?.totalCount ?? plan.draft.params.batchProductIds?.length ?? 0;
      const success = opts?.successCount ?? total;
      const failed = opts?.failedCount ?? 0;
      if (total > 0) {
        detailLines.push(`已处理 ${total} 个商品`);
        if (success > 0) detailLines.push(`成功 ${success} 个`);
        if (failed > 0) detailLines.push(`失败 ${failed} 个`);
      }
      break;
    }
    case "open_filter": {
      detailLines.push(`已切换到「${plan.targetLabel}」视图`);
      break;
    }
    case "rerun_auto_align": {
      detailLines.push(plan.operation);
      break;
    }
    default:
      detailLines.push(plan.operation);
  }

  return {
    skillName: skill.name,
    summary: `${skill.name} · ${plan.operation}`,
    detailLines,
    progress,
    nextSteps,
  };
}

export function skuCommandBelongsToSkill(intent: string): boolean {
  return SKU_SKILL_MAP.has(intent);
}