/**
 * 灰区 LLM 复核（Phase 3）
 *
 * 定位：结构化匹配（spec-match）已处理明确匹配与明确冲突；只有**灰区**
 * （结构规格分处于模糊区间）才值得花一次 LLM 调用去判等价——跨语言、同义、
 * 单位换算、模糊语义（"儿童款≈6-15岁"、"补水≈hydrating"）。
 *
 * 全部旁路增强：LLM 不可用/超时/未配置时静默回落结构化分，主流程不受影响。
 * 纯函数（选择/混合/重排）与网络/缓存分离，便于测试。
 */
import type { SourceSkuRowRanked } from "@/lib/source-sku-matrix";

/** 结构规格分落在 [GRAY_LOW, GRAY_HIGH) 视为灰区。 */
export const GRAY_LOW = 0.5;
export const GRAY_HIGH = 0.85;

/**
 * 长尾地板：跨脚本（如中文规格 vs 英文改名）且结构化分落在
 * [LONGTAIL_LOW, GRAY_LOW) 的配对，也送 LLM 复核——这部分结构化匹配
 * 系统性欠分（翻译表覆盖不到的异名），正是"脚本异构长尾"。
 */
export const LONGTAIL_LOW = 0.2;

/** 归一化配对缓存键。 */
export function pairKey(variantLabel: string, specLabel: string): string {
  const n = (s: string) => s.toLowerCase().replace(/\s+/g, "").trim();
  return `${n(variantLabel)}||${n(specLabel)}`;
}

/** 是否含 CJK（中日韩统一表意文字）。 */
export function hasCJK(s: string): boolean {
  return /[一-鿿㐀-䶿豈-﫿]/.test(s);
}

/** 是否含拉丁字母（a-z/A-Z）。 */
export function hasLatin(s: string): boolean {
  return /[a-zA-Z]/.test(s);
}

/**
 * 跨脚本判定：两侧使用不同书写系统（一侧 CJK、另一侧拉丁）。
 * 这正是 Tangbuy/1688 中文规格 ↔ 商家英文改名的核心现象，是长尾召回的目标。
 */
export function isCrossScript(a: string, b: string): boolean {
  const aCjk = hasCJK(a);
  const bCjk = hasCJK(b);
  if (aCjk === bCjk) return false; // 同侧或无 CJK
  return aCjk ? hasLatin(b) : hasLatin(a);
}

/**
 * 从排序结果中挑出需要 LLM 复核的行。
 * - 常规灰区：specScore ∈ [GRAY_LOW, GRAY_HIGH)
 * - 跨脚本长尾：variantLabel 与 specLabel 跨脚本 且 specScore ∈ [LONGTAIL_LOW, GRAY_LOW)
 * 二者合并后取前 topN。LLM 不可用时代码路径仍安全（调用方 fire-and-forget）。
 */
export function grayZoneRows(
  variantLabel: string,
  ranked: SourceSkuRowRanked[],
  topN = 12
): SourceSkuRowRanked[] {
  const cross = isCrossScript(variantLabel, rankedLabelPreview(ranked));
  return ranked
    .filter((r) => {
      if (r.specScore >= GRAY_LOW && r.specScore < GRAY_HIGH) return true;
      if (
        cross &&
        r.specScore >= LONGTAIL_LOW &&
        r.specScore < GRAY_LOW
      ) {
        return true;
      }
      return false;
    })
    .slice(0, topN);
}

/** 取首个非空 specLabel 作为跨脚本判定的"货源侧"代表（配对级信号）。 */
function rankedLabelPreview(ranked: SourceSkuRowRanked[]): string {
  return ranked.find((r) => r.specLabel?.trim())?.specLabel ?? "";
}

/** 结构规格分与 LLM 置信度（0-1）混合：LLM 主导，保留结构信息。 */
export function blendSpecWithLlm(specScore: number, llmConf: number): number {
  return Math.max(0, Math.min(1, specScore * 0.4 + llmConf * 0.6));
}

/** LLM 置信度达到此阈值即视为"语义召回"（SEMANTIC），用于回写标记。 */
export const SEMANTIC_THRESHOLD = 0.6;

/** 该配对是否被 LLM 以高置信度确认为等价（用于回写 matchSource=SEMANTIC）。 */
export function isSemanticLlmBoost(conf: number | undefined): boolean {
  return conf != null && conf >= SEMANTIC_THRESHOLD;
}

/**
 * 将 LLM 置信度（按 pairKey 索引，0-1）融入排序结果并重排。
 * 仅调整命中 LLM 的行；matchScore 随 specScore 变化等量平移（spec 权重 0.7）。
 */
export function applyLlmToRanked(
  variantLabel: string,
  ranked: SourceSkuRowRanked[],
  llmByKey: Record<string, number>
): SourceSkuRowRanked[] {
  if (!Object.keys(llmByKey).length) return ranked;
  const out = ranked.map((r) => {
    const conf = llmByKey[pairKey(variantLabel, r.specLabel)];
    if (conf == null) return r;
    const spec2 = blendSpecWithLlm(r.specScore, conf);
    const match2 = Math.max(0, Math.min(1, r.matchScore + (spec2 - r.specScore) * 0.7));
    return { ...r, specScore: spec2, matchScore: match2 };
  });
  return out.sort(
    (a, b) => b.matchScore - a.matchScore || a.specLabel.localeCompare(b.specLabel)
  );
}

// ── 网络 + 内存缓存 ────────────────────────────────────────
const cache = new Map<string, number>(); // pairKey → confidence 0-1

export interface LlmPairRequest {
  variantLabel: string;
  specLabel: string;
}

/**
 * 批量取灰区配对的 LLM 等价置信度（0-1），按 pairKey 索引。
 * 命中缓存的不重复请求；网络失败静默返回已有缓存部分。
 */
export async function fetchSpecMatchLlm(
  pairs: LlmPairRequest[]
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const uncached: Array<{ id: string; variantLabel: string; specLabel: string }> = [];
  const seen = new Set<string>();
  for (const p of pairs) {
    const key = pairKey(p.variantLabel, p.specLabel);
    if (cache.has(key)) {
      out[key] = cache.get(key)!;
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    uncached.push({ id: key, variantLabel: p.variantLabel, specLabel: p.specLabel });
  }
  if (!uncached.length) return out;

  try {
    const res = await fetch("/api/agents/sku-align/spec-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairs: uncached.slice(0, 12) }),
    });
    if (res.ok) {
      const body = (await res.json()) as { scores?: Record<string, number> };
      for (const [id, raw] of Object.entries(body.scores ?? {})) {
        const conf = Math.max(0, Math.min(1, raw / 100));
        cache.set(id, conf);
        out[id] = conf;
      }
    }
  } catch {
    /* 静默回落结构化分 */
  }
  return out;
}
