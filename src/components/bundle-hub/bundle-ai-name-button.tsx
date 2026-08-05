"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { Loader2, Sparkles } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

export type BundleAiNameKind =
  | "fixed_kit_title"
  | "mix_title"
  | "byob_title"
  | "byob_slot"
  | "gift_label"
  | "combo_label";

/** Small AI icon — one-click fill a merchant-facing name field. */
export function BundleAiNameButton({
  kind,
  context,
  onNamed,
  onError,
  disabled,
  className,
}: {
  kind: BundleAiNameKind;
  context: Record<string, unknown>;
  onNamed: (name: string) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const t = useT();
  const locale = useLocale();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      // Same auth as plugin /api calls — cookie-only fetch misses TANGBUY_TOKEN /
      // embedded Bearer and the BFF returns bare "Unauthorized".
      const { resolveAuthStrategyFromLocation } = await import(
        "@/host/adapters/auth-transport"
      );
      const strategy = resolveAuthStrategyFromLocation();
      const auth = await strategy.prepareRequest();
      const res = await fetch("/api/agents/bundle/name", {
        method: "POST",
        credentials: auth.credentials,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...auth.headers,
        },
        body: JSON.stringify({ kind, locale, context }),
      });
      const data = (await res.json().catch(() => null)) as
        | { name?: string; error?: string }
        | null;
      if (!res.ok || !data?.name?.trim()) {
        const raw = data?.error?.trim() || "";
        if (res.status === 401 || /unauthorized/i.test(raw)) {
          throw new Error(t("bundleHub.aiNameUnauthorized"));
        }
        throw new Error(raw || t("bundleHub.aiNameFailed"));
      }
      onNamed(data.name.trim());
    } catch (err) {
      onError?.(err instanceof Error ? err.message : t("bundleHub.aiNameFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      className={cn("h-7 w-7 px-0", className)}
      title={t("bundleHub.aiName")}
      aria-label={t("bundleHub.aiName")}
      disabled={disabled || busy}
      onClick={() => void run()}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Sparkles className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}
