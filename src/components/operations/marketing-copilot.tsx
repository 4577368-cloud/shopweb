// 右栏 · 营销 Copilot（设计 §6 / 原型）：消息流 + 建议指令 chips + 输入框 + 免责声明。
// v1 静态（不接真实 LLM，零成本、可预测），沿用订单中心确定性 command 范式。
"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Send, Sparkles } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

export interface CopilotMsg {
  id: string;
  role: "user" | "bot";
  text: string;
}

/** 当前分析对象的真实字段（由页面从详情抽屉注入，让 Copilot 引用真实数据）。 */
export interface CopilotContext {
  title: string;
  price: string;
  platform: string;
  likes: string;
  cta: string;
}

interface MarketingCopilotProps {
  messages: CopilotMsg[];
  onSend: (text: string) => void;
  context?: CopilotContext | null;
}

const CHIP_KEYS = [
  { key: "hooks", text: "ops.copilot.chips.hooks" },
  { key: "rewrite", text: "ops.copilot.chips.rewrite" },
  { key: "compare", text: "ops.copilot.chips.compare" },
] as const;

export function MarketingCopilot({ messages, onSend, context }: MarketingCopilotProps) {
  const t = useT();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const submit = (text: string) => {
    const v = text.trim();
    if (!v) return;
    onSend(v);
    setInput("");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles className="h-4 w-4 text-brand-accent" />
        <h3 className="text-[13px] font-semibold text-ink">{t("ops.copilot.title")}</h3>
      </div>

      {/* 真实字段引用卡（引用真实字段分析） */}
      {context && (
        <div className="mb-2 rounded-[var(--radius-card)] border border-brand/30 bg-brand-soft/60 px-3 py-2">
          <p className="truncate text-[12px] font-semibold text-ink">{context.title}</p>
          <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-ink-muted">
            <span>{t("ops.detail.price")}: <b className="text-ink">{context.price}</b></span>
            <span>{t("ops.detail.platform")}: <b className="text-ink">{context.platform}</b></span>
            <span>{t("ops.creatives.card.likes")}: <b className="text-ink">{context.likes}</b></span>
            <span>{t("ops.detail.cta")}: <b className="text-ink">{context.cta}</b></span>
          </div>
        </div>
      )}

      {/* 消息流 */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "max-w-[92%] rounded-[var(--radius-card)] px-3 py-2 text-[12px] leading-relaxed",
              m.role === "user"
                ? "ml-auto bg-brand-soft text-brand-accent"
                : "bg-surface-muted text-ink"
            )}
          >
            {m.text}
          </div>
        ))}
      </div>

      {/* 建议指令 chips */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {CHIP_KEYS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => submit(t(c.text))}
            className="rounded-full border border-hairline bg-surface px-2.5 py-1 text-[11px] text-ink-muted transition-colors hover:border-brand/40 hover:text-ink"
          >
            {t(c.text)}
          </button>
        ))}
      </div>

      {/* 输入框 */}
      <div className="mt-2 flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit(input)}
          placeholder={t("ops.copilot.inputPlaceholder")}
          className="h-9 min-w-0 flex-1 rounded-[var(--radius-control)] border border-hairline bg-surface px-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand"
        />
        <Button variant="primary" size="sm" onClick={() => submit(input)} disabled={!input.trim()}>
          <Send className="h-3.5 w-3.5" />
          {t("ops.copilot.send")}
        </Button>
      </div>

      <p className="mt-2 text-[10px] leading-snug text-ink-subtle">{t("ops.copilot.disclaimer")}</p>
    </div>
  );
}
