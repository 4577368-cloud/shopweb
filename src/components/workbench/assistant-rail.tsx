"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Bot, Lightbulb, Send } from "lucide-react";
import type { AiPanelContent } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A guided question + its fixed, state-derived answer (Phase A: no free-text LLM). */
export interface AssistantSuggestion {
  id: string;
  q: string;
  a: string;
}

interface AssistantRailProps {
  /** Stacked cards, e.g. <CopilotCard /> then contextual <InfoCard />s. */
  children: ReactNode;
}

/**
 * Right rail container (Step 3): a vertical, scrollable stack that holds the AI copilot card plus any
 * page-specific contextual cards (tips, rule explainer, safety). Layout only — pages compose the cards.
 */
export function AssistantRail({ children }: AssistantRailProps) {
  return (
    <aside className="flex h-full flex-col gap-3 overflow-y-auto border-l border-hairline bg-canvas/70 p-3">
      {children}
    </aside>
  );
}

interface CopilotCardProps {
  content: AiPanelContent;
  onAlertClick?: (targetId: string) => void;
  onNextAction?: (action: string) => void;
  highlightedAlertId?: string;
  /**
   * Phase A guided input. When provided, the footer becomes clickable suggestion chips that reveal a
   * fixed, state-derived answer (no free-text LLM). When omitted, the footer is a disabled stub.
   */
  suggestions?: AssistantSuggestion[];
  /** Changing this key resets the revealed answer (e.g. when the page's auth state changes). */
  suggestionsKey?: string;
}

/**
 * The AI copilot card. Renders the same {@link AiPanelContent} contract as the legacy AiAssistant
 * (summary + key bullets + alerts + next action) so existing pages keep working unchanged, and adds
 * the prototype's copilot chrome: an "online" header and a visual composer input.
 *
 * The composer is a Step-3 visual stub only — it is disabled and wired to no chat backend.
 */
export function CopilotCard({
  content,
  onAlertClick,
  onNextAction,
  highlightedAlertId,
  suggestions,
  suggestionsKey,
}: CopilotCardProps) {
  const next = content.nextAction;
  return (
    <section className="flex flex-col rounded-[var(--radius-card)] border border-hairline bg-surface shadow-card">
      <div className="flex items-center justify-between border-b border-hairline px-3.5 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand-strong">
            <Bot className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold text-ink">AI 助手</span>
        </div>
        <span className="flex items-center gap-1 text-[11px] text-ink-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          在线
        </span>
      </div>

      <div className="space-y-3 px-3.5 py-3">
        {content.title ? (
          <p className="text-[11px] font-medium text-ink-subtle">{content.title}</p>
        ) : null}
        {content.summary ? (
          <p className="text-xs leading-5 text-ink-muted">{content.summary}</p>
        ) : null}

        {content.bullets.length > 0 ? (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-ink-subtle">
              <Lightbulb className="h-3 w-3" />
              关键说明
            </div>
            <ul className="space-y-1.5">
              {content.bullets.map((item) => (
                <li key={item} className="flex gap-2 text-xs leading-5 text-ink-muted">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-subtle" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {content.alerts && content.alerts.length > 0 ? (
          <div className="rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-2.5 py-2">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-amber-800">
              <AlertTriangle className="h-3 w-3" />
              需注意
            </div>
            <ul className="space-y-1.5">
              {content.alerts.map((alert) => {
                const clickable = Boolean(alert.targetId && onAlertClick);
                return (
                  <li key={alert.id}>
                    {clickable ? (
                      <button
                        type="button"
                        onClick={() => onAlertClick?.(alert.targetId!)}
                        className={cn(
                          "w-full rounded px-1.5 py-1 text-left text-[11px] leading-4 text-amber-900 transition-colors hover:bg-amber-100/80",
                          highlightedAlertId === alert.id &&
                            "bg-amber-100 ring-1 ring-amber-300"
                        )}
                      >
                        <span className="font-medium text-amber-800">定位 → </span>
                        {alert.text}
                      </button>
                    ) : (
                      <p className="text-[11px] leading-4 text-amber-800">{alert.text}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {next ? (
          <div className="rounded-[var(--radius-control)] border border-hairline bg-surface-muted px-2.5 py-2.5">
            <p className="text-[11px] font-medium text-ink-subtle">下一步</p>
            <p className="mt-1 text-xs leading-5 text-ink-muted">
              {next.disabled && next.disabledReason
                ? next.disabledReason
                : `执行「${next.label}」继续当前步骤。`}
            </p>
            <div className="mt-2">
              {next.href && !next.disabled ? (
                <Link href={next.href} className="block">
                  <Button className="w-full" variant="secondary">
                    {next.label}
                  </Button>
                </Link>
              ) : next.action && onNextAction ? (
                <Button
                  className="w-full"
                  variant="secondary"
                  disabled={next.disabled}
                  onClick={() => onNextAction(next.action!)}
                >
                  {next.label}
                </Button>
              ) : (
                <Button className="w-full" variant="secondary" disabled>
                  {next.label}
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {suggestions && suggestions.length > 0 ? (
        <GuidedComposer key={suggestionsKey} suggestions={suggestions} />
      ) : (
        /* Visual composer stub — not wired to any chat backend on pages without guided input. */
        <div className="border-t border-hairline p-2.5">
          <div className="flex items-center gap-2 rounded-[var(--radius-control)] border border-hairline bg-surface-muted px-2.5 py-1.5">
            <input
              disabled
              placeholder="输入你的问题…"
              className="min-w-0 flex-1 bg-transparent text-xs text-ink placeholder:text-ink-subtle focus:outline-none"
            />
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/40 text-white">
              <Send className="h-3 w-3" />
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Phase A guided composer: suggestion chips + a revealed fixed answer. Not a free-text LLM — the
 * disabled input signals that open chat is coming later. Remounted (via key) to reset on state change.
 */
function GuidedComposer({ suggestions }: { suggestions: AssistantSuggestion[] }) {
  const [active, setActive] = useState<AssistantSuggestion | null>(null);

  return (
    <div className="space-y-2 border-t border-hairline p-2.5">
      {active ? (
        <div className="flex gap-2 rounded-[var(--radius-control)] border border-emerald-100 bg-brand-soft px-2.5 py-2">
          <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-strong" />
          <p className="text-[11px] leading-5 text-ink-muted">{active.a}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActive(s)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
              active?.id === s.id
                ? "border-brand bg-surface text-ink"
                : "border-hairline bg-surface text-ink-muted hover:border-brand hover:text-ink"
            )}
          >
            {s.q}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 rounded-[var(--radius-control)] border border-hairline bg-surface-muted px-2.5 py-1.5">
        <input
          disabled
          placeholder="点击上方问题获取解答 · 自由对话即将上线"
          className="min-w-0 flex-1 bg-transparent text-xs text-ink placeholder:text-ink-subtle focus:outline-none"
        />
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/40 text-white">
          <Send className="h-3 w-3" />
        </span>
      </div>
    </div>
  );
}
