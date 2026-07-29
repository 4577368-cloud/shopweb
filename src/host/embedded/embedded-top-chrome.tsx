"use client";

import { Loader2, RefreshCw, Search, X } from "@/lib/ui/icons";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { SidebarUserMenu } from "@/components/workbench/sidebar-user-menu";
import { AssistantToggle } from "@/components/workbench/assistant-toggle";
import { Button } from "@/components/ui/button";
import { useEmbeddedPageChromeState } from "@/host/embedded/embedded-page-chrome-context";

/**
 * Compact account + locale + page search/refresh/assistant strip for Admin iframe.
 * Shares the same centered content column as WorkbenchPanel so left edges align.
 */
export function EmbeddedTopChrome() {
  const chrome = useEmbeddedPageChromeState();
  const maxWidth = chrome?.maxWidth ?? 1080;
  const search = chrome?.search ?? null;
  const refresh = chrome?.refresh ?? null;
  const assistant = chrome?.assistant ?? null;

  return (
    <div className="relative z-50 flex shrink-0 border-b border-hairline bg-canvas/90 px-[var(--wb-gutter)] py-2 backdrop-blur">
      <div
        className="mx-auto flex w-full min-w-0 items-center gap-2"
        style={{ maxWidth }}
      >
        <SidebarUserMenu className="max-w-[14rem]" menuPlacement="down" />
        <LanguageSwitcher className="shrink-0" menuPlacement="down" />

        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2">
          {search ? (
            <div className="relative min-w-[10rem] max-w-[16rem] flex-1 sm:w-52 sm:flex-none">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
              <input
                type="text"
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                placeholder={search.placeholder}
                className="h-7 w-full rounded-[var(--radius-control)] border border-hairline bg-surface pl-7 pr-8 text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand-soft"
              />
              {search.value ? (
                <button
                  type="button"
                  onClick={() => search.onChange("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                  aria-label="Clear search"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </div>
          ) : null}
          {refresh ? (
            <Button
              size="sm"
              variant="secondary"
              className="h-7 w-7 shrink-0 px-0"
              onClick={refresh.onClick}
              disabled={refresh.busy}
              title={refresh.title}
              aria-label={refresh.ariaLabel}
            >
              {refresh.busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          ) : null}
          {assistant ? (
            <AssistantToggle
              open={assistant.open}
              onToggle={assistant.onToggle}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
