import type { ShopMirrorSku } from "@/lib/types";

export type VariantTargetResolution =
  | { status: "resolved"; thirdPlatformSkuId: string; label: string }
  | { status: "ambiguous"; matches: { thirdPlatformSkuId: string; label: string }[] }
  | { status: "missing" };

export function formatVariantLabel(v: {
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
  title?: string | null;
  sku?: string | null;
  thirdPlatformSkuId?: string;
}): string {
  const parts = [v.option1, v.option2, v.option3].filter(Boolean);
  if (parts.length) return parts.join(" / ");
  if (v.title?.trim()) return v.title.trim();
  if (v.sku?.trim()) return v.sku.trim();
  const id = v.thirdPlatformSkuId ?? "";
  return id ? `变体 ${id.slice(-6)}` : "默认变体";
}

function normalizeHint(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

export function resolveVariantByLabelHint(
  hint: string,
  variants: ShopMirrorSku[]
): VariantTargetResolution {
  const q = normalizeHint(hint);
  if (!q || variants.length === 0) return { status: "missing" };

  const entries = variants.map((v) => ({
    thirdPlatformSkuId: v.thirdPlatformSkuId,
    label: formatVariantLabel(v),
  }));

  const exact = entries.filter((e) => normalizeHint(e.label) === q);
  if (exact.length === 1) {
    return {
      status: "resolved",
      thirdPlatformSkuId: exact[0]!.thirdPlatformSkuId,
      label: exact[0]!.label,
    };
  }

  const contains = entries.filter((e) => normalizeHint(e.label).includes(q));
  if (contains.length === 1) {
    return {
      status: "resolved",
      thirdPlatformSkuId: contains[0]!.thirdPlatformSkuId,
      label: contains[0]!.label,
    };
  }
  if (contains.length > 1) {
    return { status: "ambiguous", matches: contains.slice(0, 5) };
  }

  const reverse = entries.filter((e) => q.includes(normalizeHint(e.label)));
  if (reverse.length === 1) {
    return {
      status: "resolved",
      thirdPlatformSkuId: reverse[0]!.thirdPlatformSkuId,
      label: reverse[0]!.label,
    };
  }
  if (reverse.length > 1) {
    return { status: "ambiguous", matches: reverse.slice(0, 5) };
  }

  const optionHit = entries.filter((e) => {
    const v = variants.find((x) => x.thirdPlatformSkuId === e.thirdPlatformSkuId);
    if (!v) return false;
    return [v.option1, v.option2, v.option3, v.sku]
      .filter(Boolean)
      .some((part) => normalizeHint(String(part)).includes(q) || q.includes(normalizeHint(String(part))));
  });
  if (optionHit.length === 1) {
    return {
      status: "resolved",
      thirdPlatformSkuId: optionHit[0]!.thirdPlatformSkuId,
      label: optionHit[0]!.label,
    };
  }
  if (optionHit.length > 1) {
    return { status: "ambiguous", matches: optionHit.slice(0, 5) };
  }

  return { status: "missing" };
}

/** Rules-only: detect「全部规格」or a variant label hint from NL. */
export function extractListingPriceScopeHints(text: string): {
  priceScope?: "all" | "one";
  variantLabelHint?: string;
} {
  if (
    /全部|所有|每个|统一|都改|全都|各规格|各sku|各SKU/i.test(text)
  ) {
    return { priceScope: "all" };
  }

  const patterns = [
    /[「"']([^「」"']+)[」"'](?:这个)?(?:规格|尺码|颜色|款)/,
    /(?:把)?([^，,、\s]{1,20}?)(?:规格|尺码|颜色|款)(?:的)?(?:售价|价格|卖价|改|设为)/,
    /(黑色|白色|灰色|红色|蓝色|绿色|黄色|粉色|米色|卡其|M码|L码|XL码|XXL码|S码|均码|one\s*size)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    const hint = m?.[1]?.trim();
    if (!hint || hint.length < 1) continue;
    if (/^(这个|当前|该|全部|所有)$/.test(hint)) continue;
    return { priceScope: "one", variantLabelHint: hint };
  }

  return {};
}
