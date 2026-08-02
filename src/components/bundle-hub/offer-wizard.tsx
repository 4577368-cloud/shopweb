"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/LocaleProvider";
import { SameProductComboPanel } from "@/components/select/same-product-combo-panel";
import { GiftRuleDrawer } from "@/components/select/gift-rule-drawer";
import type { ImageBindingView, ShopMirrorProduct } from "@/lib/types";
import { cn } from "@/lib/utils";

type OfferKind = "combo" | "gift";

/** Product-offer play: same-product combo or gift — reuses existing panels. */
export function OfferWizard({
  shopName,
  product,
  catalog,
  bindings,
  onClose,
  onSaved,
}: {
  shopName: string;
  product: ShopMirrorProduct;
  catalog: ShopMirrorProduct[];
  bindings: Record<string, ImageBindingView>;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const t = useT();
  const [kind, setKind] = useState<OfferKind | null>(null);
  const [giftOpen, setGiftOpen] = useState(false);

  if (kind === "combo") {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-semibold text-ink">{t("bundleHub.offerCombo")}</p>
          <Button type="button" size="sm" variant="secondary" onClick={() => setKind(null)}>
            {t("bundleHub.back")}
          </Button>
        </div>
        <SameProductComboPanel
          shopName={shopName}
          productId={product.thirdPlatformItemId}
          currency={product.currency || "USD"}
          onCancel={() => setKind(null)}
          onSaved={(msg) => {
            onSaved(msg);
            onClose();
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <p className="text-[12px] text-ink-muted">{t("bundleHub.offerPickHint")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          className={cn(
            "rounded-lg border border-hairline px-3 py-3 text-left hover:border-brand-accent/40"
          )}
          onClick={() => setKind("combo")}
        >
          <p className="text-[13px] font-semibold">{t("bundleHub.offerCombo")}</p>
          <p className="mt-1 text-[11px] text-ink-muted">{t("bundleHub.offerComboDesc")}</p>
        </button>
        <button
          type="button"
          className={cn(
            "rounded-lg border border-hairline px-3 py-3 text-left hover:border-brand-accent/40"
          )}
          onClick={() => setGiftOpen(true)}
        >
          <p className="text-[13px] font-semibold">{t("bundleHub.offerGift")}</p>
          <p className="mt-1 text-[11px] text-ink-muted">{t("bundleHub.offerGiftDesc")}</p>
        </button>
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="secondary" onClick={onClose}>
          {t("bundleHub.cancel")}
        </Button>
      </div>
      <GiftRuleDrawer
        open={giftOpen}
        shopName={shopName}
        triggerProduct={product}
        catalog={catalog}
        bindings={bindings}
        onClose={() => setGiftOpen(false)}
        onSaved={(message) => {
          setGiftOpen(false);
          onSaved(message);
          onClose();
        }}
      />
    </div>
  );
}
