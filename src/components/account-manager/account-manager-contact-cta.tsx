"use client";

import Image from "next/image";
import {
  accountManagerWhatsAppHref,
  ACCOUNT_MANAGER_CTA_I18N,
  primaryAccountManager,
  type AccountManagerContext,
} from "@/lib/account-manager/config";
import { useT } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

export interface AccountManagerContactCtaProps {
  context: AccountManagerContext;
  variant?: "inline" | "rail";
  className?: string;
}

/**
 * 客户经理 WhatsApp 入口：占位头像 + 场景文案（商品关联 / SKU / 物流）。
 */
export function AccountManagerContactCta({
  context,
  variant = "inline",
  className,
}: AccountManagerContactCtaProps) {
  const t = useT();
  const manager = primaryAccountManager();
  const href = accountManagerWhatsAppHref(context, manager);
  const railLabel = t(ACCOUNT_MANAGER_CTA_I18N[context]);
  const inlineLabel = t("accountManager.contactService");
  const title = t("accountManager.contactTitle");

  if (variant === "rail") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "flex items-center gap-2.5 rounded-[var(--radius-card)] border border-hairline bg-surface p-2.5 shadow-card transition-colors hover:border-brand/30 hover:bg-brand-soft/30",
          className,
        )}
        title={title}
      >
        <AccountManagerAvatar size={40} src={manager.avatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium text-ink-subtle">{t("accountManager.railLabel")}</p>
          <p className="line-clamp-2 text-[11px] font-semibold leading-snug text-ink">{railLabel}</p>
        </div>
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border border-hairline bg-surface px-1.5 py-0.5 text-[11px] font-medium text-ink shadow-sm transition-colors hover:border-brand/40 hover:bg-brand-soft/40",
        className,
      )}
      title={title}
      onClick={(e) => e.stopPropagation()}
    >
      <AccountManagerAvatar size={22} src={manager.avatarUrl} />
      <span className="whitespace-nowrap">{inlineLabel}</span>
    </a>
  );
}

function AccountManagerAvatar({ size, src }: { size: number; src: string }) {
  return (
    <span
      className="relative shrink-0 overflow-hidden rounded-full border border-hairline bg-surface-muted"
      style={{ width: size, height: size }}
    >
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        className="h-full w-full object-cover"
      />
    </span>
  );
}

export function AccountManagerRailFooter({
  context,
}: {
  context: AccountManagerContext;
}) {
  return <AccountManagerContactCta context={context} variant="rail" />;
}
