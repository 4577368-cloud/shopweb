"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "@/lib/ui/icons";
import { AssistantToggle } from "@/components/workbench/assistant-toggle";
import { useEmbeddedMode } from "@/host/embedded/use-embedded-mode";
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
   * Sticky page toolbar (tabs / filters / primary CTAs). In embedded mode this
   * replaces the title row and stays outside the scroll region.
   */
  toolbar?: ReactNode;
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
  /** Extra classes for the description <p> (e.g. to tune font size per page). */
  descriptionClassName?: string;
  /** Extra classes for the title <h1> (e.g. to tune font size per page). */
  titleClassName?: string;
  /** Optional element rendered inline after the title text (e.g. badge / tag). */
  titleSuffix?: ReactNode;
  children: ReactNode;
}

/**
 * Center-column workbench scaffold (Step 3). Owns the page's header (breadcrumb + title + actions),
 * the single scroll region, and an opt-in sticky footer. Supersedes {@code PageHeader} for migrated
 * pages while keeping the same visual language. Sticky footer is a shell capability, enabled only when
 * a {@link WorkbenchPanelProps.footer} is passed (per prototype: /sku-align uses it, /authorize does not).
 *
 * Embedded: hide title/breadcrumbs (Admin nav names the page); keep sticky toolbar + actions.
 * Standalone: unchanged title + crumbs; toolbar may still sit in the sticky header when provided.
 */
export function WorkbenchPanel({
  title,
  description,
  breadcrumbs,
  actions,
  toolbar,
  assistantOpen,
  onAssistantToggle,
  footer,
  maxWidth = 1080,
  descriptionClassName,
  titleClassName,
  titleSuffix,
  children,
}: WorkbenchPanelProps) {
  const { isEmbedded } = useEmbeddedMode();
  const showAssistantToggle =
    !isEmbedded && typeof onAssistantToggle === "function";
  const showTitleBlock = !isEmbedded;
  const hasHeaderChrome =
    showTitleBlock || Boolean(toolbar) || Boolean(actions) || showAssistantToggle;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {hasHeaderChrome ? (
        <header
          className={cn(
            "shrink-0 border-b border-hairline bg-canvas/80 px-[var(--wb-gutter)] backdrop-blur",
            isEmbedded ? "py-2.5" : "pb-3 pt-4"
          )}
        >
          <div className="mx-auto w-full" style={{ maxWidth }}>
            {showTitleBlock && breadcrumbs && breadcrumbs.length > 0 ? (
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
            {showTitleBlock ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h1
                  className={cn(
                    "flex min-w-0 items-center gap-2 text-[22px] font-semibold leading-7 tracking-tight text-ink",
                    titleClassName
                  )}
                >
                  {title}
                  {titleSuffix ? (
                    <span className="inline-flex items-center">{titleSuffix}</span>
                  ) : null}
                </h1>
                {actions || showAssistantToggle ? (
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
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
            ) : null}
            {showTitleBlock && description ? (
              <p
                className={cn(
                  "mt-1 max-w-3xl text-sm leading-5 text-ink-muted",
                  descriptionClassName
                )}
              >
                {description}
              </p>
            ) : null}
            {toolbar || (!showTitleBlock && (actions || showAssistantToggle)) ? (
              <div
                className={cn(
                  "flex flex-wrap items-center gap-2",
                  showTitleBlock && (description || breadcrumbs?.length)
                    ? "mt-3"
                    : showTitleBlock
                      ? "mt-2"
                      : null
                )}
              >
                {toolbar ? (
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    {toolbar}
                  </div>
                ) : null}
                {!showTitleBlock && (actions || showAssistantToggle) ? (
                  <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
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
            ) : null}
          </div>
        </header>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-[var(--wb-gutter)] py-4 [scrollbar-gutter:stable]">
        <div className={cn("mx-auto w-full")} style={{ maxWidth }}>
          {children}
        </div>
      </div>

      {footer ? (
        <div
          className={cn(
            "shrink-0 border-t border-hairline bg-surface",
            // Leave a little air above Admin iframe edge.
            isEmbedded && "pb-1"
          )}
        >
          <div
            className="mx-auto w-full px-[var(--wb-gutter)]"
            style={{ maxWidth }}
          >
            {footer}
          </div>
        </div>
      ) : null}
    </div>
  );
}
