/**
 * Account-center shared primitives.
 *
 * Why these exist:
 * - The four account pages (shops / profile / security / balance) all repeated
 *   Card / Field / state / pagination / filter components locally. Beside the
 *   code duplication, the local copies drifted from the global tokens (e.g.
 *   `border-hairline` vs the global `border-surface-border`), so the account
 *   area looked subtly different from the rest of the app.
 * - These primitives wrap the global UI components so the account module
 *   stays consistent with token changes in `globals.css` and `ui/*`.
 *
 * Convention: all primitives use semantic tokens (text-foreground, border-surface-border,
 * bg-surface, text-muted-foreground, etc.) — no legacy `ink-*` / `hairline` aliases.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ===== Card =====

/**
 * Account section card. Wraps the global `Card` look (rounded-card, surface-bg,
 * surface-border, shadow-card) with the section padding every account page uses.
 *
 * Pass an optional `title` / `description` for the section header; children are
 * the body. If you need a fully custom layout, omit the header props and render
 * your own.
 */
export function AccountCard({
  title,
  description,
  action,
  className,
  bodyClassName,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-card)] border border-surface-border bg-surface shadow-card",
        className
      )}
    >
      {title || action ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-border px-5 py-4">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-[11px] text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={cn("px-5 py-5", bodyClassName)}>{children}</div>
    </section>
  );
}

// ===== Page header =====

/**
 * Standard account page header: h1 title + subtitle + optional actions.
 * Use at the top of every account sub-page so titles share weight and rhythm.
 */
export function AccountPageHeader({
  title,
  subtitle,
  footnote,
  actions,
}: {
  title: string;
  subtitle?: string;
  footnote?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>
        ) : null}
        {footnote ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground/80">{footnote}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

// ===== State cards =====

/** Loading placeholder — spinner + message inside a card. */
export function AccountLoadingState({ message }: { message: string }) {
  return (
    <AccountCard>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        <span>{message}</span>
      </div>
    </AccountCard>
  );
}

/** Error placeholder — retry button + message inside a card. */
export function AccountErrorState({
  title,
  message,
  retryLabel,
  onRetry,
}: {
  title: string;
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
}) {
  return (
    <AccountCard>
      <div className="flex items-start gap-2 text-xs text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="font-medium">{title}</p>
          <p className="mt-1 break-words text-muted-foreground">{message}</p>
        </div>
      </div>
      {onRetry && retryLabel ? (
        <div className="mt-3">
          <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" />
            {retryLabel}
          </Button>
        </div>
      ) : null}
    </AccountCard>
  );
}

/** Inline loading row — for refreshing a section without replacing the whole card. */
export function AccountRowLoading({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

/** Inline error row — paired with AccountRowLoading for section-level errors. */
export function AccountRowError({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="flex items-start gap-2 text-xs text-destructive">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="mt-1 break-words text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

/** Empty-state placeholder for sections with no data. */
export function AccountEmptyState({ message }: { message: string }) {
  return <p className="text-xs text-muted-foreground/80">{message}</p>;
}

/**
 * Sign-in CTA card — shown when a stale cookie leaves the user unauthenticated
 * on an account page. The page itself still renders inside the account shell,
 * so we keep this compact and on-brand.
 */
export function AccountSignInState({
  icon,
  message,
  signInLabel,
  signInHref,
  hideSignIn,
}: {
  icon?: ReactNode;
  message: string;
  signInLabel: string;
  signInHref: string;
  /** Embedded Admin: no Tangbuy login CTA. */
  hideSignIn?: boolean;
}) {
  return (
    <AccountCard>
      <div className="flex flex-col items-start gap-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          {icon}
          <span>{message}</span>
        </div>
        {!hideSignIn ? (
          <Button variant="primary" asChild>
            <Link href={signInHref}>{signInLabel}</Link>
          </Button>
        ) : null}
      </div>
    </AccountCard>
  );
}

// ===== Back to workbench link (mobile-friendly) =====

/** Compact "back" link used in the account header. */
export function AccountBackLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      {label}
    </Link>
  );
}
