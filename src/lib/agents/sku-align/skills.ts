import type { TranslateFn } from "@/i18n/server";
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
  nameKey: string;
  commandIds: string[];
  isActive: (ctx: SkuPageContext) => boolean;
  progress: (ctx: SkuPageContext) => number | null;
  nextSteps: (ctx: SkuPageContext, t: TranslateFn) => SkillNextStep[];
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
  nameKey: "skuSkill.nameConfirmPending",
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

  nextSteps: (ctx, t) => {
    const steps: SkillNextStep[] = [];
    const partiallyLinked = ctx.productCatalog.filter(isPartiallyLinked).length;
    if (partiallyLinked > 0) {
      steps.push({
        label: t("skuSkill.stepViewPartial", { count: partiallyLinked }),
        kind: "set_shop_filter",
        filterMode: "partially_linked",
      });
    }
    const fullyLinked = ctx.productCatalog.filter(isFullyLinked).length;
    if (fullyLinked > 0) {
      steps.push({
        label: t("skuSkill.stepViewFullyLinked", { count: fullyLinked }),
        kind: "set_shop_filter",
        filterMode: "fully_linked",
      });
    }
    return steps;
  },
};

const autoAlignSkill: SkuSkill = {
  id: "auto_align",
  nameKey: "skuSkill.nameAutoAlign",
  commandIds: ["rerun_auto_align"],

  isActive: () => true,

  progress: () => null,

  nextSteps: (ctx, t) => {
    const steps: SkillNextStep[] = [];
    if (ctx.focusProductId) {
      steps.push({
        label: t("skuSkill.stepRealignCurrent"),
      });
    }
    steps.push({
      label: t("skuSkill.stepViewAll"),
      kind: "set_shop_filter",
      filterMode: "all",
    });
    return steps;
  },
};

const bindingOpsSkill: SkuSkill = {
  id: "binding_ops",
  nameKey: "skuSkill.nameBindingOps",
  commandIds: [
    "bind_variant",
    "unbind",
    "change_source",
    "add_supplement_source",
    "ignore_match",
    "set_manual",
    "tune_threshold",
  ],

  isActive: (ctx) => {
    const hasMutable = ctx.productCatalog.some((p) =>
      p.variants.some(
        (v) => v.bound?.bindStatus === "PENDING" || v.bound?.bindStatus === "ACTIVE" || !v.bound
      )
    );
    return hasMutable;
  },

  progress: () => null,

  nextSteps: (ctx, t) => {
    const steps: SkillNextStep[] = [];
    const target = ctx.productCatalog.find((p) =>
      p.variants.some((v) => v.bound?.bindStatus === "PENDING" || !v.bound)
    );
    if (target) {
      steps.push({
        label: t("skuSkill.stepOpenWorkbench", { title: target.title ?? "" }),
        kind: "focus_product",
        productId: target.thirdPlatformItemId,
      });
    }
    return steps;
  },
};

export const SKU_SKILLS: SkuSkill[] = [confirmPendingSkill, autoAlignSkill, bindingOpsSkill];

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
  t: TranslateFn,
  opts?: {
    successCount?: number;
    failedCount?: number;
    totalCount?: number;
  }
): SkillExecutionFeedback | null {
  const skill = findSkuSkillByCommandId(plan.draft.intent);
  if (!skill) return null;

  const skillName = t(skill.nameKey);
  const progress = skill.progress(ctx);
  const nextSteps = skill.nextSteps(ctx, t);
  const detailLines: string[] = [];

  switch (plan.draft.intent) {
    case "batch_confirm_pending": {
      const total = opts?.totalCount ?? plan.draft.params.batchProductIds?.length ?? 0;
      const success = opts?.successCount ?? total;
      const failed = opts?.failedCount ?? 0;
      if (total > 0) {
        detailLines.push(t("skuSkill.detailProcessed", { count: total }));
        if (success > 0) detailLines.push(t("skuSkill.detailSuccess", { count: success }));
        if (failed > 0) detailLines.push(t("skuSkill.detailFailed", { count: failed }));
      }
      break;
    }
    case "open_filter": {
      detailLines.push(t("skuSkill.detailSwitchedFilter", { label: plan.targetLabel }));
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
    skillName,
    summary: `${skillName} · ${plan.operation}`,
    detailLines,
    progress,
    nextSteps,
  };
}

export function skuCommandBelongsToSkill(intent: string): boolean {
  return SKU_SKILL_MAP.has(intent);
}
