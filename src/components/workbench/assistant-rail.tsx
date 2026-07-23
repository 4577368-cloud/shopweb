"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Bot, Lightbulb, Send } from "lucide-react";
import type { AiPanelContent } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { useBackendHealth } from "@/hooks/use-backend-health";
import { cn } from "@/lib/utils";

/** A guided question + its fixed, state-derived answer (Phase A: no free-text LLM). */
export interface AssistantSuggestion {
  id: string;
  q: string;
  a: string;
}

interface AssistantRailProps {
  /**
   * Legacy stacked content (context + cards). Kept for pages not yet split into slots.
   * Prefer {@link assistantContent} + {@link strategyCards} for the two-layer rail.
   */
  children?: ReactNode;
  /** Upper context panel: AI advisor / analysis / next-step. Natural height. */
  assistantContent?: ReactNode;
  /**
   * Lower strategy / action cards (pricing, logistics template, …).
   * When present, sits directly under a stretched context panel (no large mid-rail gap).
   * When absent, context fills the column with no reserved empty band.
   */
  strategyCards?: ReactNode;
  /** Alias of {@link strategyCards}. */
  railCards?: ReactNode;
  className?: string;
}

/**
 * Right workspace rail: optional two-layer layout.
 *
 * - With strategy cards: context (Copilot) stretches, strategy sits directly under it.
 * - Without strategy cards: context fills the column — no empty “future card” band.
 */
export function AssistantRail({
  children,
  assistantContent,
  strategyCards,
  railCards,
  className,
}: AssistantRailProps) {
  const strategy = strategyCards ?? railCards;
  const hasStrategy = hasRailSlot(strategy);
  const useSlots = assistantContent !== undefined || strategyCards !== undefined || railCards !== undefined;

  if (!useSlots) {
    return (
      <aside
        className={cn(
          "flex h-full flex-col gap-3 overflow-y-auto border-l border-hairline bg-canvas/70 p-3",
          className
        )}
      >
        {children}
      </aside>
    );
  }

  const context = assistantContent ?? children;

  return (
    <aside
      className={cn(
        "flex h-full flex-col overflow-hidden border-l border-hairline bg-canvas/70 p-3",
        className
      )}
      data-rail-layout={hasStrategy ? "context-strategy" : "context-fill"}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        <div
          className={cn(
            "flex min-h-0 flex-col gap-2",
            "min-h-0 flex-1 overflow-y-auto [&>[data-copilot-card]]:min-h-0 [&>[data-copilot-card]]:flex-1"
          )}
        >
          {context}
        </div>
        {hasStrategy ? (
          <div className="flex shrink-0 flex-col gap-2">{strategy}</div>
        ) : null}
      </div>
    </aside>
  );
}

function hasRailSlot(node: ReactNode): boolean {
  if (node == null || node === false || node === true) return false;
  if (Array.isArray(node)) return node.some(hasRailSlot);
  return true;
}

interface CopilotCardProps {
  content: AiPanelContent;
  /** Header label; defaults to "AI 助手". Pages can specialize it, e.g. "AI 运营顾问". */
  heading?: string;
  /** Tighter layout + primary CTA for onboarding / authorize rail. */
  variant?: "default" | "onboarding";
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
  className?: string;
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
  heading = "AI 助手",
  variant = "default",
  onAlertClick,
  onNextAction,
  highlightedAlertId,
  suggestions,
  suggestionsKey,
  className,
}: CopilotCardProps) {
  const next = content.nextAction;
  const backendHealth = useBackendHealth();
  const backendOk = backendHealth === "ok";
  const onboarding = variant === "onboarding";
  const metrics = content.metrics ?? [];
  const showBullets = content.bullets.length > 0 && metrics.length === 0;
  return (
    <section
      data-copilot-card
      className={cn(
        "flex flex-col rounded-[var(--radius-card)] border border-hairline bg-surface shadow-card",
        className
      )}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-hairline px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand-strong">
            <Bot className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold text-ink">{heading}</span>
        </div>
        <span
          className="flex items-center"
          title={backendOk ? "plugin:ok" : "plugin:down"}
          aria-label={backendOk ? "Backend reachable" : "Backend unreachable"}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              backendOk ? "bg-brand" : "bg-amber-400"
            )}
          />
        </span>
      </div>

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto",
          onboarding ? "space-y-3 px-3 py-3" : "space-y-2.5 px-3.5 py-2.5"
        )}
      >
        {content.title ? (
          <p
            className={cn(
              onboarding
                ? "text-sm font-semibold tracking-tight text-ink"
                : "text-[11px] font-medium text-ink-subtle"
            )}
          >
            {content.title}
          </p>
        ) : null}
        {content.summary ? (
          <p
            className={cn(
              onboarding
                ? "text-xs leading-5 text-ink-muted"
                : "text-xs leading-5 text-ink-muted"
            )}
          >
            {content.summary}
          </p>
        ) : null}

        {metrics.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 rounded-[var(--radius-control)] border border-hairline/80 bg-surface-muted/50 p-2.5">
            {metrics.map((item) => (
              <div key={item.label} className="min-w-0">
                <p className="text-[10px] text-ink-subtle">{item.label}</p>
                <p className="mt-0.5 truncate text-xs font-medium text-ink">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {showBullets ? (
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
          <div
            className={cn(
              "rounded-[var(--radius-control)] border px-2.5 py-2.5",
              onboarding
                ? "border-brand/20 bg-brand-soft/40"
                : "border-hairline bg-surface-muted"
            )}
          >
            <p className="text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
              下一步
            </p>
            <p className="mt-1 text-xs leading-5 text-ink">
              {next.disabled && next.disabledReason
                ? next.disabledReason
                : next.description ?? `前往「${next.label}」继续。`}
            </p>
            <div className="mt-2">
              {next.href && !next.disabled ? (
                <Link href={next.href} className="block">
                  <Button
                    className="h-8 w-full text-xs"
                    variant={onboarding ? "primary" : "secondary"}
                  >
                    {next.label}
                  </Button>
                </Link>
              ) : next.action && onNextAction ? (
                <Button
                  className="h-8 w-full text-xs"
                  variant={onboarding ? "primary" : "secondary"}
                  disabled={next.disabled}
                  onClick={() => onNextAction(next.action!)}
                >
                  {next.label}
                </Button>
              ) : (
                <Button className="h-8 w-full text-xs" variant="secondary" disabled>
                  {next.label}
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {suggestions && suggestions.length > 0 ? (
        <GuidedComposer
          key={suggestionsKey}
          suggestions={suggestions}
          variant={variant}
        />
      ) : (
        /* Visual composer stub — not wired to any chat backend on pages without guided input. */
        <div className="mt-auto shrink-0 border-t border-hairline p-2.5">
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
function GuidedComposer({
  suggestions,
  variant = "default",
}: {
  suggestions: AssistantSuggestion[];
  variant?: "default" | "onboarding";
}) {
  const [active, setActive] = useState<AssistantSuggestion | null>(null);
  const onboarding = variant === "onboarding";

  return (
    <div
      className={cn(
        "mt-auto shrink-0 border-t border-hairline",
        onboarding ? "space-y-2 p-3" : "space-y-2 p-2.5"
      )}
    >
      <p className="text-[10px] font-medium text-ink-subtle">常见问题</p>

      <div className={cn("flex gap-1.5", onboarding ? "flex-col" : "flex-wrap")}>
        {suggestions.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActive((cur) => (cur?.id === s.id ? null : s))}
            className={cn(
              "rounded-[var(--radius-control)] border text-left transition-colors",
              onboarding
                ? "w-full px-2.5 py-1.5 text-xs leading-snug"
                : "rounded-full px-2.5 py-1 text-[11px]",
              active?.id === s.id
                ? "border-brand bg-brand-soft text-ink"
                : "border-hairline bg-surface text-ink-muted hover:border-brand/40 hover:text-ink"
            )}
          >
            {s.q}
          </button>
        ))}
      </div>

      {active ? (
        <div className="flex gap-2 rounded-[var(--radius-control)] border border-emerald-100 bg-brand-soft/60 px-2.5 py-2">
          <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-strong" />
          <p className="text-xs leading-5 text-ink-muted">{active.a}</p>
        </div>
      ) : null}

      <div className="flex items-center gap-2 rounded-[var(--radius-control)] border border-hairline bg-surface-muted px-2.5 py-1.5">
        <input
          disabled
          placeholder="点选上方问题查看解答"
          className="min-w-0 flex-1 bg-transparent text-[11px] text-ink placeholder:text-ink-subtle focus:outline-none"
        />
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand text-white">
          <Send className="h-3 w-3" />
        </span>
      </div>
    </div>
  );
}
