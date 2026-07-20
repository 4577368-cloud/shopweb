"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import type { AgentResponse } from "@/lib/agents/types";
import type {
  IntentClassifyResult,
  PageIntentDef,
} from "@/lib/agents/runtime/types";
import type { ClientAgentResponse } from "@/lib/agents/runtime/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PageAgentPanelAutoRun<TIntent extends string> {
  /** When true and key changes, run intent once */
  enabled: boolean;
  /** Dedup key (e.g. shopName) */
  key: string;
  intent: TIntent;
}

export interface PageAgentPanelProps<TIntent extends string> {
  intents: PageIntentDef<TIntent>[];
  /** Ordered chip ids to show */
  chipIds: TIntent[];
  maxInputLength: number;
  inputPlaceholder?: string;
  subtitle?: string;
  /** Map agentId → short badge label */
  agentBadge?: (agentId: string) => string;
  fetchResponse: (intent: TIntent) => Promise<ClientAgentResponse>;
  classifyInput: (text: string) => Promise<IntentClassifyResult<TIntent>>;
  autoRun?: PageAgentPanelAutoRun<TIntent>;
  onApplyAction?: (response: AgentResponse) => void;
  className?: string;
}

/**
 * Reusable constrained task panel: chips + short input + single suggestion card.
 * Page packs supply intents / fetch / classify — this owns only the UI shell.
 */
export function PageAgentPanel<TIntent extends string>({
  intents,
  chipIds,
  maxInputLength,
  inputPlaceholder = "补充提问或短命令",
  subtitle = "点击任务，或输入简短命令（映射到固定意图，非开放聊天）",
  agentBadge = defaultAgentBadge,
  fetchResponse,
  classifyInput,
  autoRun,
  onApplyAction,
  className,
}: PageAgentPanelProps<TIntent>) {
  const [activeIntent, setActiveIntent] = useState<TIntent | null>(null);
  const [response, setResponse] = useState<ClientAgentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [clarify, setClarify] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const autoKey = useRef<string | null>(null);

  const intentLabel = (id: TIntent) =>
    intents.find((i) => i.id === id)?.label ?? id;

  const runIntent = (id: TIntent) => {
    const seq = ++requestSeq.current;
    setActiveIntent(id);
    setClarify(null);
    setLoading(true);
    setResponse(null);
    void fetchResponse(id)
      .then((result) => {
        if (requestSeq.current !== seq) return;
        setResponse(result);
      })
      .finally(() => {
        if (requestSeq.current === seq) setLoading(false);
      });
  };

  useEffect(() => {
    if (!autoRun?.enabled) return;
    if (autoKey.current === autoRun.key) return;
    autoKey.current = autoRun.key;
    runIntent(autoRun.intent);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot per autoRun.key
  }, [autoRun?.enabled, autoRun?.key, autoRun?.intent]);

  const submitShortInput = () => {
    const text = input.trim();
    if (!text || loading) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    setClarify(null);
    setResponse(null);
    void classifyInput(text)
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
        const result = await fetchResponse(classified.intent);
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

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
          任务建议
        </p>
        <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {chipIds.map((id) => {
          const active = activeIntent === id;
          return (
            <button
              key={id}
              type="button"
              disabled={loading}
              onClick={() => runIntent(id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-left text-xs transition-colors disabled:opacity-60",
                active
                  ? "border-slate-800 bg-slate-800 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              )}
            >
              {intentLabel(id)}
            </button>
          );
        })}
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
          maxLength={maxInputLength}
          disabled={loading}
          placeholder={inputPlaceholder}
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

      {clarify ? (
        <p className="rounded-md border border-amber-200/80 bg-amber-50/80 px-2.5 py-2 text-xs text-amber-900">
          {clarify}
        </p>
      ) : null}

      {loading ? (
        <p className="text-xs text-slate-400">正在生成建议…</p>
      ) : response ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              {response.summary}
            </h3>
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">
              {agentBadge(response.agentId)}
              {response.copySource === "template" ? " · 模板" : null}
            </span>
          </div>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed text-slate-600">
            {response.explanation.map((line, i) => (
              <li key={`${i}-${line.slice(0, 24)}`}>· {line}</li>
            ))}
          </ul>
          {response.nextSteps.length > 0 ? (
            <div className="mt-2 border-t border-slate-200/80 pt-2">
              <p className="text-[11px] font-medium text-slate-500">下一步</p>
              <ul className="mt-1 space-y-0.5 text-xs text-slate-700">
                {response.nextSteps.map((s, i) => (
                  <li key={`${i}-${s.slice(0, 24)}`}>→ {s}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {response.suggestedAction.kind !== "none" &&
          response.suggestedAction.label ? (
            <Button
              size="sm"
              className="mt-3 w-full"
              onClick={() => onApplyAction?.(response)}
            >
              {response.suggestedAction.label}
            </Button>
          ) : null}
        </div>
      ) : !clarify ? (
        <p className="text-xs text-slate-400">
          点击上方任务，或输入简短命令查看建议。
        </p>
      ) : null}
    </div>
  );
}

function defaultAgentBadge(agentId: string): string {
  if (agentId === "pricing_strategist") return "Pricing";
  if (agentId === "sourcing_advisor") return "Sourcing";
  return agentId;
}
