import type { LogisticsPageContext } from "@/lib/agents/logistics/plan-command";
import type { LogisticsCommandPlan } from "@/lib/agents/logistics/command-schema";
import type { SuggestedActionKind } from "@/lib/agents/types";

export interface LogisticsSkill {
  id: string;
  name: string;
  description: string;
  commandIds: string[];
  isActive: (ctx: LogisticsPageContext) => boolean;
  progress: (ctx: LogisticsPageContext) => number | null;
  nextSteps: (ctx: LogisticsPageContext) => SkillNextStep[];
}

export interface SkillNextStep {
  label: string;
  kind?: SuggestedActionKind;
  filterMode?: "all" | "issues";
  status?: string;
}

export interface SkillExecutionFeedback {
  skillName: string;
  summary: string;
  detailLines: string[];
  progress: number | null;
  nextSteps: SkillNextStep[];
}

const confirmReadySkill: LogisticsSkill = {
  id: "confirm_ready",
  name: "确认物流方案",
  description: "审核并确认 AI 推荐的物流方案",
  commandIds: ["accept_all_ready", "focus_issues"],

  isActive: (ctx) => {
    return ctx.readyAcceptCount > 0 || ctx.pendingCount > 0;
  },

  progress: (ctx) => {
    const total = ctx.readyAcceptCount + ctx.confirmedCount + ctx.pendingCount;
    if (total === 0) return null;
    return Math.round((ctx.confirmedCount / total) * 100);
  },

  nextSteps: (ctx) => {
    const steps: SkillNextStep[] = [];
    if (ctx.readyAcceptCount > 0) {
      steps.push({
        label: `确认 ${ctx.readyAcceptCount} 个待确认方案`,
      });
    }
    if (ctx.pendingCount > 0) {
      steps.push({
        label: `查看 ${ctx.pendingCount} 个待处理项`,
        kind: "set_shop_filter",
        filterMode: "issues",
      });
    }
    return steps;
  },
};

const fetchQuotesSkill: LogisticsSkill = {
  id: "fetch_quotes",
  name: "获取报价",
  description: "从 Tangbuy 获取线路报价",
  commandIds: ["start_estimate", "fetch_quotes"],

  isActive: () => true,

  progress: () => null,

  nextSteps: (ctx) => {
    const steps: SkillNextStep[] = [];
    if (ctx.readyAcceptCount === 0 && ctx.confirmedCount === 0) {
      steps.push({
        label: "拉取线路报价",
      });
    }
    return steps;
  },
};

const templateSkill: LogisticsSkill = {
  id: "template_config",
  name: "模板配置",
  description: "配置物流模板和销售市场",
  commandIds: ["open_template", "apply_template"],

  isActive: () => true,

  progress: () => null,

  nextSteps: () => {
    return [
      {
        label: "调整物流模板",
        kind: "open_template",
      },
    ];
  },
};

export const LOGISTICS_SKILLS: LogisticsSkill[] = [
  confirmReadySkill,
  fetchQuotesSkill,
  templateSkill,
];

export const LOGISTICS_SKILL_MAP = new Map<string, LogisticsSkill>();
for (const skill of LOGISTICS_SKILLS) {
  for (const cmdId of skill.commandIds) {
    LOGISTICS_SKILL_MAP.set(cmdId, skill);
  }
}

export function findLogisticsSkillByCommandId(intent: string): LogisticsSkill | null {
  return LOGISTICS_SKILL_MAP.get(intent) ?? null;
}

export function buildLogisticsSkillFeedback(
  plan: LogisticsCommandPlan,
  ctx: LogisticsPageContext,
  opts?: {
    successCount?: number;
    failedCount?: number;
    totalCount?: number;
  }
): SkillExecutionFeedback | null {
  const skill = findLogisticsSkillByCommandId(plan.draft.intent);
  if (!skill) return null;

  const progress = skill.progress(ctx);
  const nextSteps = skill.nextSteps(ctx);
  const detailLines: string[] = [];

  switch (plan.draft.intent) {
    case "accept_all_ready": {
      const total = opts?.totalCount ?? ctx.readyAcceptCount;
      const success = opts?.successCount ?? total;
      const failed = opts?.failedCount ?? 0;
      if (total > 0) {
        detailLines.push(`已处理 ${total} 个规格`);
        if (success > 0) detailLines.push(`成功确认 ${success} 个`);
        if (failed > 0) detailLines.push(`失败 ${failed} 个`);
      }
      break;
    }
    case "fetch_quotes": {
      detailLines.push("已刷新线路报价");
      break;
    }
    case "start_estimate": {
      detailLines.push("已启动智能预估管线");
      break;
    }
    case "open_template": {
      detailLines.push("已打开物流模板配置");
      break;
    }
    case "focus_issues": {
      detailLines.push(`已筛选 ${ctx.pendingCount} 个待处理项`);
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

export function logisticsCommandBelongsToSkill(intent: string): boolean {
  return LOGISTICS_SKILL_MAP.has(intent);
}