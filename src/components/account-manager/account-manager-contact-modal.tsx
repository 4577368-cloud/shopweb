"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useT } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import {
  accountManagerWhatsAppHref,
  primaryAccountManager,
  type AccountManagerContext,
  type AccountManagerPrefillVariant,
} from "@/lib/account-manager/config";
import { cn } from "@/lib/utils";

export interface AccountManagerContactModalProps {
  open: boolean;
  onClose: () => void;
  context: AccountManagerContext;
  /** weak = low similarity; failed = no reliable recall */
  imageSearchReason?: "weak" | "failed" | null;
  productTitle?: string | null;
  className?: string;
}

export function AccountManagerContactModal({
  open,
  onClose,
  context,
  imageSearchReason = null,
  productTitle,
  className,
}: AccountManagerContactModalProps) {
  const t = useT();
  const manager = primaryAccountManager();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const prefillVariant: AccountManagerPrefillVariant =
    imageSearchReason === "failed"
      ? "image_search_failed"
      : imageSearchReason === "weak"
        ? "image_search_weak"
        : "default";

  const href = accountManagerWhatsAppHref(context, manager, {
    productTitle,
    prefillVariant: imageSearchReason ? prefillVariant : "default",
  });

  const titleKey =
    imageSearchReason != null
      ? "accountManager.imageSearchModal.title"
      : "accountManager.contactModal.title";
  const bodyKey =
    imageSearchReason != null
      ? "accountManager.imageSearchModal.body"
      : "accountManager.contactModal.body";

  return (
    <div
      className={cn(
        "fixed inset-0 z-[70] flex items-center justify-center p-4",
        className,
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-manager-modal-title"
    >
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md rounded-[var(--radius-card)] border border-hairline bg-surface p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <AccountManagerAvatar size={52} src={manager.avatarUrl} />
          <div className="min-w-0 flex-1">
            <p
              id="account-manager-modal-title"
              className="text-sm font-semibold text-ink"
            >
              {t(titleKey)}
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
              {t(bodyKey)}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-subtle">
              {t("accountManager.imageSearchModal.manualHint")}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("accountManager.imageSearchModal.later")}
          </Button>
          <Button variant="primary" size="sm" asChild>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
            >
              {t("accountManager.imageSearchModal.contactNow")}
            </a>
          </Button>
        </div>
      </div>
    </div>
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
