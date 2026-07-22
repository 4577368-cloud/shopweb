"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Send } from "lucide-react";
import type { AgentSuggestedAction } from "@/lib/agents/types";
import {
  PRODUCTS_INTENTS,
  type ProductsIntentId,
} from "@/lib/agents/products/intents";
import type { ProductsPageContext } from "@/lib/agents/products/page-context";
import type { AgentIntentRequest } from "@/components/select/shop-products-panel";
import {
  computeActiveTask,
  railTaskChips,
  shouldSuppressResultPrimaryCta,
  splitProductChips,
} from "@/lib/agents/products/active-task";
import type { ShopProductMini } from "@/lib/agents/products/shop-minis";
import { classifyProductsShortInput, fetchProductsAgentResponse, type ClientAgentResponse } from "@/lib/agents/products/client";
import { classifyProductCommandInput } from "@/lib/agents/products/command-client";
import type { CommandClassifyContext } from "@/lib/agents/products/classify-command";
import { readableError } from "@/lib/api";
import {
  commandRequiresConfirmation,
  planProductCommand,
  resolveCommandExecution,
} from "@/lib/agents/products/plan-command";
import type { ProductCommandExecution, ProductCommandPlan } from "@/lib/agents/products/command-schema";
import { getCommandUIConfig } from "@/lib/agents/products/command-ui-config";
import type { ConfirmPreviewResult } from "@/components/select/command-confirm-card";
import { ExecutionPipeline, type ExecutionStep, type BatchProgress } from "@/components/select/execution-pipeline";
import type { SkillExecutionFeedback } from "@/lib/agents/products/skills";
import { buildSkillFeedback, commandBelongsToSkill } from "@/lib/agents/products/skills";
import { ProductCommandCard } from "@/components/select/product-command-card";
import { ListingPriceConfirmCard } from "@/components/select/listing-price-confirm-card";
import { BatchLinkProgressCard } from "@/components/select/batch-link-progress-card";
import type { BatchLinkProgress } from "@/lib/batch-link/types";
import { PRODUCTS_SHORT_INPUT_MAX } from "@/lib/agents/products/classify-intent";
import {
  ActiveTaskCard,
  ProductsIntentResult,
} from "@/components/select/products-intent-results";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PreviewGenerator = (
  plan: ProductCommandPlan,
  shopName: string
) => Promise<ConfirmPreviewResult>;

export type CommandExecutor = (payload: Record<string, unknown>) => Promise<void>;

export interface ProductsAgentPanelProps {
  context: ProductsPageContext;
  pendingMinis?: ShopProductMini[];
  unboundMinis?: ShopProductMini[];
  intentRequest?: AgentIntentRequest | null;
  onIntentRequestConsumed?: () => void;
  onApplySuggestedAction?: (action: AgentSuggestedAction) => void;
  onFocusProduct?: (productId: string, opts?: { openSearch?: boolean }) => void;
  onRequestAgentIntent?: (
    intent: ProductsIntentId,
    productId: string
  ) => void;
  previewGenerators?: Record<string, PreviewGenerator>;
  commandExecutors?: Record<string, CommandExecutor>;
  batchLinkProgress?: BatchLinkProgress | null;
  className?: string;
}

/**
 * Rail hierarchy:
 * 1) Active priority (one CTA)
 * 2) Quick action bar (pricing / translate / pending / unbound)
 * 3) Short input + example chips
 * 4) Compact context summary (one-line + expand)
 * 5) Execution pipeline / confirm cards / Skill feedback
 * 6) Intent execution UI
 */
export function ProductsAgentPanel({
  context,
  pendingMinis = [],
  unboundMinis = [],
  intentRequest = null,
  onIntentRequestConsumed,
  onApplySuggestedAction,
  onFocusProduct,
  onRequestAgentIntent,
  previewGenerators = {},
  commandExecutors = {},
  batchLinkProgress = null,
  className,
}: ProductsAgentPanelProps) {
  const [activeIntent, setActiveIntent] = useState<ProductsIntentId | null>(
    null
  );
  const [response, setResponse] = useState<ClientAgentResponse | null>(null);
  const [commandPlan, setCommandPlan] = useState<ProductCommandPlan | null>(null);
  const [commandExecuting, setCommandExecuting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [clarify, setClarify] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [preview, setPreview] = useState<ConfirmPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [execStep, setExecStep] = useState<ExecutionStep | null>(null);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [skillFeedback, setSkillFeedback] = useState<SkillExecutionFeedback | null>(null);
  const requestSeq = useRef(0);
  const previewSeq = useRef(0);
  const autoKey = useRef<string | null>(null);

  const activeTask = useMemo(() => computeActiveTask(context), [context]);

  const orderedChips = useMemo(
    () => railTaskChips(context, activeTask.intent),
    [context, activeTask.intent]
  );
  const { primary, more } = useMemo(
    () => splitProductChips(orderedChips, 2),
    [orderedChips]
  );

  const chipClass = (active: boolean) =>
    cn(
      "rounded border px-1.5 py-0.5 text-[10px] font-medium leading-4 transition-colors disabled:opacity-50",
      active
        ? "border-slate-400 bg-slate-100 text-slate-800"
        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
    );

  // 快速动作栏用到的示例命令
  const exampleCommands = useMemo(() => {
    const examples: string[] = [];
    if (context.pendingCount > 0) examples.push("确认全部待关联");
    if (context.unboundCount > 0) examples.push("重搜未匹配");
    examples.push("改价为9.9", "翻译标题", "只看待确认");
    return examples.slice(0, 4);
  }, [context.pendingCount, context.unboundCount]);

  const dispatchAction = (action: AgentSuggestedAction) => {
    onApplySuggestedAction?.(action);
  };

  const runAgentIntent = (id: ProductsIntentId) => {
    const seq = ++requestSeq.current;
    setActiveIntent(id);
    setClarify(null);
    setMoreOpen(false);
    setLoading(true);
    setResponse(null);
    setCommandPlan(null);
    setPreview(null);
    void fetchProductsAgentResponse(id, context)
      .then((result) => {
        if (requestSeq.current !== seq) return;
        setResponse(result);
      })
      .finally(() => {
        if (requestSeq.current === seq) setLoading(false);
      });
  };

  const executeCommand = async (plan: ProductCommandPlan) => {
    const execution = resolveCommandExecution(plan);
    if (!execution) {
      setClarify(plan.clarify ?? "无法执行该命令。");
      return;
    }
    setCommandExecuting(true);
    setCommandPlan(null);
    setPreview(null);
    setClarify(null);
    setSkillFeedback(null);
    try {
      await applyCommandExecution(plan, execution);
      // L1 直接执行命令也生成 skill feedback
      if (commandBelongsToSkill(plan.draft.intent)) {
        const feedback = buildSkillFeedback(plan, context);
        if (feedback) setSkillFeedback(feedback);
      }
    } catch (err) {
      setClarify(readableError(err) || "命令执行失败，请稍后重试。");
    } finally {
      setCommandExecuting(false);
    }
  };

  const applyCommandExecution = async (
    plan: ProductCommandPlan,
    execution: ProductCommandExecution
  ) => {
    const productId = plan.draft.productId ?? plan.draft.params.productId;

    if (execution.type === "agent_action") {
      if (
        productId &&
        execution.action.kind !== "set_shop_filter" &&
        execution.action.kind !== "open_pricing_drawer"
      ) {
        onFocusProduct?.(
          productId,
          execution.action.kind === "open_candidate_search"
            ? { openSearch: true }
            : undefined
        );
      }
      dispatchAction(execution.action);
      setActiveIntent(null);
      setResponse(null);
      return;
    }
    if (execution.type === "agent_intent") {
      if (productId) {
        onRequestAgentIntent?.(execution.intent, productId);
        return;
      }
      runAgentIntent(execution.intent);
      return;
    }
    // 需要预览的命令走 confirm card 路径，不在此处直接执行
  };

  const uiConfig = useMemo(() => {
    if (!commandPlan) return null;
    return getCommandUIConfig(commandPlan.draft.intent);
  }, [commandPlan]);

  const generatePreview = useCallback(async () => {
    if (!commandPlan || !uiConfig?.requiresPreview) return;
    const generator = previewGenerators[commandPlan.draft.intent];
    if (!generator) {
      setPreviewError("该命令暂无预览生成器");
      setPreviewLoading(false);
      setExecStep("error");
      return;
    }
    const seq = ++previewSeq.current;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreview(null);
    setExecStep("executing");
    try {
      const result = await generator(commandPlan, context.shopName);
      if (previewSeq.current !== seq) return;
      setPreview(result);
      setExecStep("preview_ready");
    } catch (err) {
      if (previewSeq.current !== seq) return;
      setPreviewError(readableError(err) || "预览生成失败");
      setExecStep("error");
    } finally {
      if (previewSeq.current === seq) setPreviewLoading(false);
    }
  }, [commandPlan, uiConfig, previewGenerators, context.shopName]);

  useEffect(() => {
    if (commandPlan && uiConfig?.requiresPreview) {
      void generatePreview();
    }
  }, [commandPlan, uiConfig, generatePreview]);

  const handleConfirmWithPreview = useCallback(async (payload: Record<string, unknown>) => {
    if (!commandPlan) return;
    const executor = commandExecutors[commandPlan.draft.intent];
    if (!executor) {
      setClarify("该命令暂无执行器");
      setExecStep("error");
      return;
    }

    const isBatch = commandPlan.draft.intent === "batch_update_product_copy" || commandPlan.draft.intent === "batch_update_listing_price";
    const belongsToSkill = commandBelongsToSkill(commandPlan.draft.intent);

    setCommandExecuting(true);
    setClarify(null);
    setBatchProgress(null);
    setSkillFeedback(null);

    if (isBatch) {
      setExecStep("batch_running");
    } else {
      setExecStep("applying");
    }

    try {
      const payloadWithProgress = isBatch
        ? {
            ...payload,
            onProgress: (current: number, total: number, success: number, failed: number) => {
              setBatchProgress({ current, total, success, failed });
            },
          }
        : payload;

      await executor(payloadWithProgress);
      setExecStep("done");

      // 生成 skill feedback，不自动消失
      if (belongsToSkill) {
        const feedback = buildSkillFeedback(commandPlan, context, {
          successCount: isBatch ? batchProgress?.success : undefined,
          failedCount: isBatch ? batchProgress?.failed : undefined,
          totalCount: isBatch ? (payload.totalCount as number) : undefined,
        });
        if (feedback) {
          setSkillFeedback(feedback);
          // 延迟清理执行管道状态，但保留 skill feedback
          setTimeout(() => {
            setCommandPlan(null);
            setPreview(null);
            setExecStep(null);
            setBatchProgress(null);
          }, 800);
        }
      } else {
        // 不属于 skill 的命令，沿用旧行为
        setTimeout(() => {
          setCommandPlan(null);
          setPreview(null);
          setExecStep(null);
          setBatchProgress(null);
          setActiveIntent(null);
          setResponse(null);
        }, 1200);
      }
    } catch (err) {
      setClarify(readableError(err) || "命令执行失败，请稍后重试。");
      setExecStep("error");
    } finally {
      setCommandExecuting(false);
    }
  }, [commandPlan, commandExecutors, context, batchProgress]);

  const handleCustomConfirm = useCallback(async (intent: string, execution: any) => {
    const executor = commandExecutors[intent];
    if (!executor) {
      setClarify("该命令暂无执行器");
      return;
    }
    setCommandExecuting(true);
    setClarify(null);
    setSkillFeedback(null);
    try {
      await executor(execution as Record<string, unknown>);
      // 高敏感命令（update_listing_price）也属于 pricing_diagnostic skill
      if (commandPlan && commandBelongsToSkill(intent)) {
        const feedback = buildSkillFeedback(commandPlan, context);
        if (feedback) setSkillFeedback(feedback);
      }
      if (!skillFeedback) {
        setCommandPlan(null);
        setPreview(null);
        setActiveIntent(null);
        setResponse(null);
      }
    } catch (err) {
      setClarify(readableError(err) || "命令执行失败，请稍后重试。");
    } finally {
      setCommandExecuting(false);
    }
  }, [commandExecutors, commandPlan, context, skillFeedback]);

  const handleCommandClassified = async (text: string, seq: number) => {
    // 构建页面上下文，让 LLM 理解当前页面状态
    const classifyCtx: CommandClassifyContext = {
      focusProductTitle: context.focusProduct?.title ?? null,
      focusProductPrice: context.focusProduct?.shopPrice
        ? `${context.focusProduct.shopPrice} ${context.focusProduct.shopCurrency ?? ""}`
        : null,
      focusProductBindState: context.focusProduct?.bindState
        ? context.focusProduct.bindState === "confirmed"
          ? "已确认"
          : context.focusProduct.bindState === "pending"
            ? "待确认"
            : "未匹配"
        : null,
      pricingConfigured: context.pricing?.configured ?? null,
      pricingSummary: context.pricing?.summaryLine ?? null,
      currentTab: context.tab === "shop" ? "Shopify 商品" : "选品发现",
      currentFilter: context.shopFilter
        ? context.shopFilter === "all"
          ? "全部"
          : context.shopFilter === "pending"
            ? "待确认"
            : context.shopFilter === "confirmed"
              ? "已确认"
              : context.shopFilter === "unbound"
                ? "未匹配"
                : "新入库"
        : null,
      pendingCount: context.pendingCount,
      unboundCount: context.unboundCount,
      analyzedCount: context.analyzedCount,
    };
    const classified = await classifyProductCommandInput(text, classifyCtx);
    if (requestSeq.current !== seq) return;

    if (classified.confidence === "high" && classified.draft) {
      const plan = planProductCommand(classified.draft, context);
      if (!plan.executable) {
        setCommandPlan(null);
        setPreview(null);
        setClarify(plan.clarify ?? "无法执行该命令。");
        setLoading(false);
        return;
      }
      setInput("");
      if (commandRequiresConfirmation(plan)) {
        setCommandPlan(plan);
        setClarify(null);
        setExecStep(null);
        setLoading(false);
        return;
      }
      setActiveIntent(null);
      setResponse(null);
      await executeCommand(plan);
      if (requestSeq.current === seq) setLoading(false);
      return;
    }

    const qa = await classifyProductsShortInput(text);
    if (requestSeq.current !== seq) return;
    if (qa.confidence === "none") {
      setCommandPlan(null);
      setPreview(null);
      setClarify(
        classified.clarify ?? qa.clarify ?? "请换个说法或点击上方任务。"
      );
      setLoading(false);
      return;
    }
    setInput("");
    setCommandPlan(null);
    setPreview(null);
    setActiveIntent(qa.intent);
    const result = await fetchProductsAgentResponse(qa.intent, context);
    if (requestSeq.current !== seq) return;
    setResponse(result);
    setLoading(false);
  };

  const runIntent = (id: ProductsIntentId) => {
    setCommandPlan(null);
    if (id === "configure_pricing") {
      setMoreOpen(false);
      setClarify(null);
      dispatchAction({ kind: "open_pricing_drawer", label: "定价策略" });
      setActiveIntent(id);
      setResponse(null);
      return;
    }
    if (id === "explain_pricing" && !context.pricing.configured) {
      setMoreOpen(false);
      setClarify(null);
      dispatchAction({ kind: "open_pricing_drawer", label: "定价策略" });
      setActiveIntent(id);
      setResponse(null);
      return;
    }
    runAgentIntent(id);
  };

  // First ready: auto-load shop status (includes scan handoff when present).
  useEffect(() => {
    if (!context.authorized || !context.analysisReady) return;
    const key = `${context.shopName}:${context.scanHandoff?.at ?? "steady"}`;
    if (autoKey.current === key) return;
    autoKey.current = key;
    runIntent("summarize_shop_status");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    context.authorized,
    context.analysisReady,
    context.shopName,
    context.scanHandoff?.at,
  ]);

  useEffect(() => {
    if (!intentRequest) return;
    if (context.focusProductId !== intentRequest.productId) return;
    if (!context.focusProduct) return;
    runIntent(intentRequest.intent);
    onIntentRequestConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intentRequest, context.focusProductId, context.focusProduct]);

  const submitShortInput = () => {
    const text = input.trim();
    if (!text || loading) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    setClarify(null);
    setResponse(null);
    setCommandPlan(null);
    setSkillFeedback(null);
    void handleCommandClassified(text, seq).catch(() => {
      if (requestSeq.current !== seq) return;
      setClarify("命令识别暂时不可用，请点击上方任务芯片。");
      setLoading(false);
    });
  };

  const chipLabel = (id: ProductsIntentId) =>
    PRODUCTS_INTENTS.find((i) => i.id === id)?.label ?? id;

  const suppressPrimary =
    activeIntent != null &&
    shouldSuppressResultPrimaryCta(activeTask.intent, activeIntent);

  const showBatchProgress =
    batchLinkProgress != null &&
    (batchLinkProgress.active || batchLinkProgress.done);

  return (
    <div className={cn("flex min-h-0 flex-col gap-2.5", className)}>
      {showBatchProgress ? (
        <BatchLinkProgressCard batchLinkProgress={batchLinkProgress} />
      ) : null}

      <ActiveTaskCard
        title={activeTask.title}
        reason={activeTask.reason}
        action={activeTask.action}
        onAction={(a) => {
          dispatchAction(a);
          // Do not open a duplicate execution card for the same primary intent
          // unless it's useful (e.g. configure still shows tip). Prefer navigate only.
          if (
            activeTask.intent !== "go_discover" &&
            activeTask.intent !== "configure_pricing"
          ) {
            runIntent(activeTask.intent);
          }
        }}
      />

      {context.focusProduct ? (
        <p className="line-clamp-1 text-[10px] text-slate-500">
          <span className="text-slate-400">已选</span>
          <span className="mx-1 text-slate-300">·</span>
          {context.focusProduct.title}
          <span className="ml-1 text-slate-400">（可说「这个商品…」）</span>
        </p>
      ) : (
        <p className="text-[10px] leading-snug text-slate-400">
          未选中商品：请点列表中的商品，或在命令里写商品名（如「把拖鞋的售价改成 9.9」）
        </p>
      )}

      {/* 快速动作栏 - 统一圆角按钮风格 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() =>
            onApplySuggestedAction?.({
              kind: "open_pricing_drawer",
              label: "定价设置",
            })
          }
          className={cn(
            "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
            context.pricing.configured
              ? "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              : "border-amber-200 bg-amber-50/80 text-amber-800 hover:bg-amber-100/80"
          )}
        >
          <span className="text-slate-400">⚙</span>
          <span>
            {context.pricing.configured
              ? `定价 ${context.pricing.targetCurrency}`
              : "配置定价"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setInput("所有商品标题翻译成英文");
            setTimeout(() => submitShortInput(), 50);
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50"
        >
          <span className="text-slate-400">📝</span>
          <span>翻译</span>
        </button>

        {context.pendingCount > 0 ? (
          <button
            type="button"
            onClick={() =>
              onApplySuggestedAction?.({
                kind: "set_shop_filter",
                shopFilter: "pending",
                label: `待确认 ${context.pendingCount}`,
              })
            }
            className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50/80 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100/80"
          >
            <span>待确认</span>
            <span className="rounded-full bg-amber-200/80 px-1.5 py-0.5 text-[10px]">
              {context.pendingCount}
            </span>
          </button>
        ) : null}

        {context.unboundCount > 0 ? (
          <button
            type="button"
            onClick={() =>
              onApplySuggestedAction?.({
                kind: "set_shop_filter",
                shopFilter: "unbound",
                label: `未匹配 ${context.unboundCount}`,
              })
            }
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50"
          >
            <span>未匹配</span>
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px]">
              {context.unboundCount}
            </span>
          </button>
        ) : null}
      </div>

      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          submitShortInput();
        }}
      >
        <input
          type="text"
          value={input}
          maxLength={PRODUCTS_SHORT_INPUT_MAX}
          disabled={loading}
          placeholder="输入命令或提问…"
          onChange={(e) => setInput(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none disabled:opacity-60"
          aria-label="短命令输入"
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={loading || !input.trim()}
          className="h-9 w-9 shrink-0 rounded-lg px-0"
          title="发送"
          aria-label="发送短命令"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>

      {/* 示例命令 - 改用下划线 chip 样式 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-slate-400">试试：</span>
        {exampleCommands.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => {
              setInput(text);
              setTimeout(() => submitShortInput(), 50);
            }}
            className="rounded-md border-b border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600 hover:border-slate-400 hover:text-slate-800"
          >
            {text}
          </button>
        ))}
      </div>

      {/* 状态指示器 - 批量关联时由上方任务卡替代 */}
      {!showBatchProgress ? (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/40 px-3 py-1.5">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-500">
            <span className="text-slate-400">已分析</span> {context.analyzedCount}
          </span>
          {context.pendingCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400"></span>
              待确认 {context.pendingCount}
            </span>
          )}
          {context.unboundCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-600">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-300"></span>
              未匹配 {context.unboundCount}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => runIntent("summarize_shop_status")}
          className="shrink-0 text-[10px] font-medium text-slate-500 hover:text-slate-700"
        >
          详情
        </button>
      </div>
      ) : null}

      {clarify ? (
        <p className="rounded-md border border-amber-200/80 bg-amber-50/80 px-2.5 py-2 text-xs text-amber-900">
          {clarify}
        </p>
      ) : null}

      {commandPlan ? (
        uiConfig?.renderMode === "generic" ? (
          <ExecutionPipeline
            plan={commandPlan}
            theme={uiConfig.theme ?? "sky"}
            step={execStep ?? "executing"}
            preview={preview}
            error={previewError}
            sensitivity={uiConfig.sensitivity ?? "low"}
            batchProgress={batchProgress}
            onAutoApply={handleConfirmWithPreview}
            onCancel={() => {
              setCommandPlan(null);
              setPreview(null);
              setExecStep(null);
              setBatchProgress(null);
              setSkillFeedback(null);
            }}
          />
        ) : commandPlan.draft.intent === "update_listing_price" ? (
          <ListingPriceConfirmCard
            plan={commandPlan}
            shopName={context.shopName}
            executing={commandExecuting}
            onConfirm={(execution) => void handleCustomConfirm("update_listing_price", execution)}
            onCancel={() => {
              setCommandPlan(null);
              setSkillFeedback(null);
            }}
          />
        ) : (
          <ProductCommandCard
            plan={commandPlan}
            executing={commandExecuting}
            onConfirm={() => void executeCommand(commandPlan)}
            onCancel={() => {
              setCommandPlan(null);
              setSkillFeedback(null);
            }}
          />
        )
      ) : null}

      {/* Skill 任务反馈卡片 */}
      {skillFeedback && !commandPlan ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50/80 px-2.5 py-2">
          <div className="flex items-center gap-1.5">
            <span className="text-emerald-600">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-700/80">
              {skillFeedback.skillName}
            </span>
          </div>
          <h3 className="mt-0.5 text-xs font-semibold text-emerald-950">
            {skillFeedback.summary}
          </h3>

          {skillFeedback.progress != null ? (
            <div className="mt-1.5">
              <div className="flex items-center justify-between text-[10px] text-emerald-800/70">
                <span>总体进度</span>
                <span>{skillFeedback.progress}%</span>
              </div>
              <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-emerald-200/60">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${skillFeedback.progress}%` }}
                />
              </div>
            </div>
          ) : null}

          {skillFeedback.detailLines.length > 0 ? (
            <div className="mt-1.5 space-y-0.5">
              {skillFeedback.detailLines.map((line, i) => (
                <p key={i} className="text-[11px] text-emerald-900/80">
                  {line}
                </p>
              ))}
            </div>
          ) : null}

          {skillFeedback.nextSteps.length > 0 ? (
            <div className="mt-2">
              <p className="text-[10px] font-medium text-emerald-800/60">下一步</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {skillFeedback.nextSteps.map((step, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      if (step.kind && onApplySuggestedAction) {
                        onApplySuggestedAction({
                          kind: step.kind,
                          shopFilter: step.shopFilter,
                          tab: step.tab,
                          productId: step.productId,
                          label: step.label,
                        });
                      } else if (step.intent && onRequestAgentIntent) {
                        onRequestAgentIntent(step.intent as ProductsIntentId, step.productId ?? context.focusProductId ?? "");
                      }
                      setSkillFeedback(null);
                    }}
                    className="rounded border border-emerald-300/60 bg-emerald-100/60 px-2 py-0.5 text-[10px] text-emerald-800 hover:bg-emerald-200/60 transition-colors"
                  >
                    {step.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setSkillFeedback(null)}
              className="text-[10px] text-emerald-700/60 hover:text-emerald-800"
            >
              关闭
            </button>
          </div>
        </div>
      ) : null}

      {loading && !commandPlan ? (
        <p className="text-[11px] text-slate-400">正在识别…</p>
      ) : response && activeIntent ? (
        <ProductsIntentResult
          intent={activeIntent}
          response={response}
          context={context}
          pendingMinis={pendingMinis}
          unboundMinis={unboundMinis}
          suppressPrimaryCta={suppressPrimary}
          onAction={dispatchAction}
          onFocusProduct={(id, opts) => onFocusProduct?.(id, opts)}
        />
      ) : null}
    </div>
  );
}
