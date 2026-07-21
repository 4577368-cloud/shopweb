"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  classifyProductsShortInput,
  fetchProductsAgentResponse,
  type ClientAgentResponse,
} from "@/lib/agents/products/client";
import { PRODUCTS_SHORT_INPUT_MAX } from "@/lib/agents/products/classify-intent";
import {
  ActiveTaskCard,
  ProductsIntentResult,
  StatusFactSummary,
} from "@/components/select/products-intent-results";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ProductsAgentPanelProps {
  context: ProductsPageContext;
  pendingMinis?: ShopProductMini[];
  unboundMinis?: ShopProductMini[];
  /** External trigger (e.g. product card explain links). */
  intentRequest?: AgentIntentRequest | null;
  onIntentRequestConsumed?: () => void;
  onApplySuggestedAction?: (action: AgentSuggestedAction) => void;
  onFocusProduct?: (productId: string, opts?: { openSearch?: boolean }) => void;
  className?: string;
}

/**
 * Rail hierarchy:
 * 1) Active priority (one CTA)
 * 2) Task chips (exclude priority intent, ≤3 + more)
 * 3) Short input
 * 4) Status facts (no CTA)
 * 5) Intent execution UI
 */
export function ProductsAgentPanel({
  context,
  pendingMinis = [],
  unboundMinis = [],
  intentRequest = null,
  onIntentRequestConsumed,
  onApplySuggestedAction,
  onFocusProduct,
  className,
}: ProductsAgentPanelProps) {
  const [activeIntent, setActiveIntent] = useState<ProductsIntentId | null>(
    null
  );
  const [response, setResponse] = useState<ClientAgentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [clarify, setClarify] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const requestSeq = useRef(0);
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

  const dispatchAction = (action: AgentSuggestedAction) => {
    onApplySuggestedAction?.(action);
  };

  const runIntent = (id: ProductsIntentId) => {
    // Pricing chip: open drawer directly — no verbose execution card.
    if (id === "explain_pricing" || id === "configure_pricing") {
      setMoreOpen(false);
      setClarify(null);
      dispatchAction({ kind: "open_pricing_drawer", label: "定价策略" });
      setActiveIntent(id);
      setResponse(null);
      return;
    }
    const seq = ++requestSeq.current;
    setActiveIntent(id);
    setClarify(null);
    setMoreOpen(false);
    setLoading(true);
    setResponse(null);
    void fetchProductsAgentResponse(id, context)
      .then((result) => {
        if (requestSeq.current !== seq) return;
        setResponse(result);
      })
      .finally(() => {
        if (requestSeq.current === seq) setLoading(false);
      });
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
    void classifyProductsShortInput(text)
      .then(async (classified) => {
        if (requestSeq.current !== seq) return;
        if (classified.confidence === "none") {
          setActiveIntent(null);
          setClarify(classified.clarify ?? "请换个说法或点击上方任务。");
          setLoading(false);
          return;
        }
        setInput("");
        setActiveIntent(classified.intent);
        const result = await fetchProductsAgentResponse(
          classified.intent,
          context
        );
        if (requestSeq.current !== seq) return;
        setResponse(result);
        setLoading(false);
      })
      .catch(() => {
        if (requestSeq.current !== seq) return;
        setClarify("分类暂时不可用，请点击上方任务芯片。");
        setLoading(false);
      });
  };

  const chipLabel = (id: ProductsIntentId) =>
    PRODUCTS_INTENTS.find((i) => i.id === id)?.label ?? id;

  const suppressPrimary =
    activeIntent != null &&
    shouldSuppressResultPrimaryCta(activeTask.intent, activeIntent);

  return (
    <div className={cn("flex min-h-0 flex-col gap-2.5", className)}>
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
        </p>
      ) : null}

      {primary.length > 0 || more.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {primary.map((id) => {
            const active = activeIntent === id;
            return (
              <button
                key={id}
                type="button"
                disabled={loading}
                onClick={() => runIntent(id)}
                className={chipClass(active)}
              >
                {chipLabel(id)}
              </button>
            );
          })}
          {more.length > 0 ? (
            <div className="relative">
              <button
                type="button"
                disabled={loading}
                onClick={() => setMoreOpen((v) => !v)}
                className={cn(chipClass(false), "inline-flex items-center gap-0.5")}
              >
                更多
                <ChevronDown className="h-2.5 w-2.5" />
              </button>
              {moreOpen ? (
                <div className="absolute right-0 z-20 mt-0.5 min-w-[7.5rem] rounded-md border border-slate-200 bg-white py-0.5 shadow-md">
                  {more.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className="block w-full px-2 py-1 text-left text-[10px] text-slate-700 hover:bg-slate-50"
                      onClick={() => runIntent(id)}
                    >
                      {chipLabel(id)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

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
          placeholder="补充提问…"
          onChange={(e) => setInput(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none disabled:opacity-60"
          aria-label="短命令输入"
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={loading || !input.trim()}
          className="h-8 w-8 shrink-0 px-0"
          title="发送"
          aria-label="发送短命令"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </form>

      <StatusFactSummary
        context={context}
        onExpand={() => runIntent("summarize_shop_status")}
      />

      {clarify ? (
        <p className="rounded-md border border-amber-200/80 bg-amber-50/80 px-2.5 py-2 text-xs text-amber-900">
          {clarify}
        </p>
      ) : null}

      {loading ? (
        <p className="text-[11px] text-slate-400">正在切换任务…</p>
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
