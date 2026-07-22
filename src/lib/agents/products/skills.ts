import type { ProductsPageContext } from "@/lib/agents/products/page-context";
import type { ProductCommandPlan } from "@/lib/agents/products/command-schema";
import type { SuggestedActionKind } from "@/lib/agents/types";

/** 轻量级 Skill — 第一轮不做状态机，只做命令→任务的映射和反馈包装 */
export interface ProductSkill {
  id: string;
  name: string;
  description: string;

  /** 哪些命令属于这个 skill */
  commandIds: string[];

  /** 根据页面上下文判断是否处于活跃状态 */
  isActive: (ctx: ProductsPageContext) => boolean;

  /** 计算 skill 当前进度（0-100），null 表示无法计算 */
  progress: (ctx: ProductsPageContext) => number | null;

  /** 生成下一步建议 */
  nextSteps: (ctx: ProductsPageContext) => SkillNextStep[];
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

// ── Skill 1: 清理待确认 ──────────────────────────────────────────

const cleanupPendingSkill: ProductSkill = {
  id: "cleanup_pending",
  name: "清理待确认",
  description: "审核并确认 AI 自动关联的货源绑定",
  commandIds: ["open_filter", "batch_ack_pending"],

  isActive: (ctx) => ctx.pendingCount > 0,

  progress: (ctx) => {
    if (ctx.analyzedCount === 0) return null;
    const processed = ctx.analyzedCount - ctx.pendingCount;
    return Math.round((processed / ctx.analyzedCount) * 100);
  },

  nextSteps: (ctx) => {
    const steps: SkillNextStep[] = [];
    if (ctx.pendingCount > 0) {
      steps.push({
        label: `查看 ${ctx.pendingCount} 个待确认商品`,
        kind: "set_shop_filter",
        shopFilter: "pending",
      });
    }
    if (ctx.unboundCount > 0) {
      steps.push({
        label: `处理 ${ctx.unboundCount} 个未匹配`,
        kind: "set_shop_filter",
        shopFilter: "unbound",
      });
    }
    if (steps.length === 0) {
      steps.push({
        label: "去添加新品",
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
  name: "批量翻译",
  description: "批量翻译商品标题或描述到目标语言",
  commandIds: ["batch_update_product_copy", "update_product_copy"],

  isActive: () => true,

  progress: () => null,

  nextSteps: (ctx) => {
    const steps: SkillNextStep[] = [];
    if (ctx.pendingCount > 0) {
      steps.push({
        label: `确认 ${ctx.pendingCount} 个待关联`,
        kind: "set_shop_filter",
        shopFilter: "pending",
      });
    }
    if (!ctx.pricing.configured) {
      steps.push({
        label: "配置定价策略",
        kind: "open_pricing_drawer",
      });
    }
    steps.push({
      label: "检查商品列表",
      kind: "set_shop_filter",
      shopFilter: "all",
    });
    return steps;
  },
};

// ── Skill 3: 定价诊断 ────────────────────────────────────────────

const pricingDiagnosticSkill: ProductSkill = {
  id: "pricing_diagnostic",
  name: "定价诊断",
  description: "检查和优化店铺定价策略配置",
  commandIds: ["open_pricing_editor", "update_listing_price", "batch_update_listing_price"],

  isActive: (ctx) => !ctx.pricing.configured || ctx.pricing.isDefault,

  progress: (ctx) => {
    if (ctx.pricing.configured && !ctx.pricing.isDefault) return 100;
    return 0;
  },

  nextSteps: (ctx) => {
    const steps: SkillNextStep[] = [];
    if (!ctx.pricing.configured || ctx.pricing.isDefault) {
      steps.push({
        label: "打开定价设置",
        kind: "open_pricing_drawer",
      });
    } else {
      steps.push({
        label: "查看定价摘要",
        kind: "open_pricing_drawer",
      });
    }
    if (ctx.unboundCount > 0) {
      steps.push({
        label: `处理 ${ctx.unboundCount} 个未匹配`,
        kind: "set_shop_filter",
        shopFilter: "unbound",
      });
    }
    return steps;
  },
};

// ── Skill 注册表 ─────────────────────────────────────────────────

export const PRODUCT_SKILLS: ProductSkill[] = [
  cleanupPendingSkill,
  batchTranslateSkill,
  pricingDiagnosticSkill,
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

/** 生成命令执行后的任务反馈 */
export function buildSkillFeedback(
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
  const nextSteps = skill.nextSteps(ctx);
  const detailLines: string[] = [];

  // 根据命令类型生成摘要
  switch (plan.draft.intent) {
    case "batch_update_product_copy": {
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
    case "update_product_copy": {
      detailLines.push(`已更新「${plan.targetLabel}」的文案`);
      break;
    }
    case "update_listing_price": {
      detailLines.push(
        `已将「${plan.targetLabel}」售价更新为 ${plan.draft.params.currency} ${plan.draft.params.price}`
      );
      break;
    }
    case "batch_update_listing_price": {
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

/** 判断某个命令是否属于已知的 skill */
export function commandBelongsToSkill(intent: string): boolean {
  return SKILL_MAP.has(intent);
}
