import type { ReactNode } from "react";
import { Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

export type InfoCardTone = "default" | "brand" | "warning";

const toneMap: Record<InfoCardTone, { card: string; title: string }> = {
  default: { card: "border-hairline bg-surface", title: "text-ink" },
  brand: { card: "border-emerald-100 bg-brand-soft", title: "text-brand-strong" },
  warning: { card: "border-amber-100 bg-amber-50", title: "text-amber-800" },
};

interface InfoCardProps {
  title: string;
  icon?: ReactNode;
  tone?: InfoCardTone;
  /** Optional footer link/action row. */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Contextual card for the right rail (prototype: 小贴士 / 匹配规则说明 / 数据安全). Light, restrained,
 * optional tint. Building block for the assistant rail — pages stack these under the CopilotCard.
 */
export function InfoCard({
  title,
  icon,
  tone = "default",
  footer,
  children,
  className,
}: InfoCardProps) {
  const t = toneMap[tone];
  return (
    <section
      className={cn(
        "rounded-[var(--radius-card)] border px-3.5 py-3 shadow-card",
        t.card,
        className
      )}
    >
      <div className={cn("mb-2 flex items-center gap-1.5 text-sm font-semibold", t.title)}>
        {icon}
        {title}
      </div>
      <div className="text-xs leading-5 text-ink-muted">{children}</div>
      {footer ? <div className="mt-2.5 text-xs">{footer}</div> : null}
    </section>
  );
}

interface TipCardProps {
  title?: string;
  /** Bullet list of tips. */
  tips: string[];
  footer?: ReactNode;
  className?: string;
}

/** Preset InfoCard for the recurring 💡 "小贴士" pattern. */
export function TipCard({ title = "小贴士", tips, footer, className }: TipCardProps) {
  return (
    <InfoCard
      title={title}
      icon={<Lightbulb className="h-3.5 w-3.5 text-amber-500" />}
      footer={footer}
      className={className}
    >
      <ul className="space-y-1.5">
        {tips.map((tip) => (
          <li key={tip} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-subtle" />
            <span>{tip}</span>
          </li>
        ))}
      </ul>
    </InfoCard>
  );
}
