"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link2, Loader2 } from "@/lib/ui/icons";
import { useT } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

export function ShopDomainConnectField({
  value,
  onChange,
  onConnect,
  disabled,
  connecting,
  buttonLabel,
  inputClassName,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onConnect: () => void;
  disabled?: boolean;
  connecting?: boolean;
  buttonLabel?: ReactNode;
  inputClassName?: string;
  className?: string;
}) {
  const t = useT();

  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-stretch", className)}>
      <div
        className={cn(
          "flex min-w-0 flex-1 overflow-hidden rounded-[var(--radius-control)] border border-hairline bg-surface shadow-xs focus-within:border-brand-accent/40 focus-within:ring-2 focus-within:ring-brand-accent/15",
          inputClassName
        )}
      >
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onConnect();
          }}
          placeholder={t("install.domainPlaceholder")}
          className="min-w-0 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
          aria-label={t("install.domainAria")}
          disabled={disabled || connecting}
          autoComplete="off"
          spellCheck={false}
        />
        <span className="flex shrink-0 items-center border-l border-hairline bg-surface-muted px-2.5 text-xs font-medium text-ink-muted">
          {t("install.domainSuffix")}
        </span>
      </div>
      <Button
        type="button"
        className="shrink-0 sm:min-w-[10.5rem]"
        onClick={onConnect}
        disabled={disabled || connecting}
      >
        {connecting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Link2 className="h-4 w-4" />
        )}
        {buttonLabel ?? t("install.connectButton")}
      </Button>
    </div>
  );
}

/** Display-only handle from a full myshopify.com domain (for prefill). */
export function shopHandleFromDomain(domain: string): string {
  const normalized = domain.trim().toLowerCase();
  return normalized.replace(/\.myshopify\.com$/i, "");
}
