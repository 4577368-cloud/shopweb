"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AssistantToggle } from "@/components/workbench/assistant-toggle";
import { cn } from "@/lib/utils";

interface Breadcrumb {
  label: string;
  href?: string;
}

interface WorkbenchPanelProps {
  title: string;
  description?: string;
  breadcrumbs?: Breadcrumb[];
  /** Top-right header actions (buttons/links). Primary CTA goes here. */
  actions?: ReactNode;
  /**
   * When set, renders a fixed {@link AssistantToggle} after {@link actions}
   * (center header — not inside the right rail).
   */
  assistantOpen?: boolean;
  onAssistantToggle?: () => void;
  /** Optional sticky footer, e.g. <StickyActionBar />. Pinned to the bottom of the center column. */
  footer?: ReactNode;
  /** Content max width in px (centered). Prototypes sit around 1080. */
  maxWidth?: number;
  children: ReactNode;
}

/**
 * Center-column workbench scaffold (Step 3). Owns the page's header (breadcrumb + title + actions),
 * the single scroll region, and an opt-in sticky footer. Supersedes {@code PageHeader} for migrated
 * pages while keeping the same visual language. Sticky footer is a shell capability, enabled only when
 * a {@link WorkbenchPanelProps.footer} is passed (per prototype: /sku-align uses it, /authorize does not).
 */
export function WorkbenchPanel({
  title,
  description,
  breadcrumbs,
  actions,
  assistantOpen,
  onAssistantToggle,
  footer,
  maxWidth = 1080,
  children,
}: WorkbenchPanelProps) {
  const showAssistantToggle = typeof onAssistantToggle === "function";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-hairline bg-canvas/80 px-[var(--wb-gutter)] pb-3 pt-4 backdrop-blur">
        <div className="mx-auto w-full" style={{ maxWidth }}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {breadcrumbs && breadcrumbs.length > 0 ? (
                <nav className="mb-1.5 flex items-center gap-1 text-[11px] text-ink-subtle">
                  {breadcrumbs.map((item, index) => (
                    <span key={item.label} className="flex items-center gap-1">
                      {index > 0 ? <ChevronRight className="h-3 w-3" /> : null}
                      {item.href ? (
                        <Link href={item.href} className="hover:text-ink-muted">
                          {item.label}
                        </Link>
                      ) : (
                        <span className="text-ink-muted">{item.label}</span>
                      )}
                    </span>
                  ))}
                </nav>
              ) : null}
              <h1 className="text-[22px] font-semibold leading-7 tracking-tight text-ink">
                {title}
              </h1>
              {description ? (
                <p className="mt-1 max-w-3xl text-sm leading-5 text-ink-muted">
                  {description}
                </p>
              ) : null}
            </div>
            {actions || showAssistantToggle ? (
              <div className="flex shrink-0 items-center gap-2">
                {actions}
                {showAssistantToggle ? (
                  <AssistantToggle
                    open={assistantOpen ?? true}
                    onToggle={onAssistantToggle}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-[var(--wb-gutter)] py-4">
        <div className={cn("mx-auto w-full")} style={{ maxWidth }}>
          {children}
        </div>
      </div>

      {footer ? (
        <div className="shrink-0 border-t border-hairline bg-surface">
          <div className="mx-auto w-full px-[var(--wb-gutter)]" style={{ maxWidth }}>
            {footer}
          </div>
        </div>
      ) : null}
    </div>
  );
}
