import type { ImageSearchResult } from "@/lib/types";

/** Actionable hints when image search returns no usable candidates (C.3). */
export function buildImageSearchRecoveryHints(input: {
  result?: ImageSearchResult | null;
  hasImage: boolean;
  errorMessage?: string | null;
}): string[] {
  if (!input.hasImage) {
    return ["补充 Shopify 商品主图后再试图搜"];
  }
  if (input.errorMessage?.trim()) {
    return [
      "检查主图是否清晰、无大面积水印",
      "可尝试「手动匹配」粘贴 1688 / 商城链接",
    ];
  }
  if (input.result && input.result.items.length === 0) {
    const hints = [
      "换一张更清晰、无遮挡的商品主图后重试",
      "标题补充材质/品类关键词后再图搜",
    ];
    if (input.result.querySource === "TITLE") {
      hints.push("当前以标题召回为主，可优先优化主图质量");
    }
    hints.push("仍无结果时可用「手动匹配」直接关联货源");
    return hints;
  }
  return [];
}
