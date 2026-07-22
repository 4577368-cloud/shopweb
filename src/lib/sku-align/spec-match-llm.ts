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

/** 归一化配对缓存键。 */
export function pairKey(variantLabel: string, specLabel: string): string {
  const n = (s: string) => s.toLowerCase().replace(/\s+/g, "").trim();
  return `${n(variantLabel)}||${n(specLabel)}`;
}

/** 从排序结果中挑出需要 LLM 复核的灰区行（默认取前 topN）。 */
export function grayZoneRows(
  ranked: SourceSkuRowRanked[],
  topN = 3
): SourceSkuRowRanked[] {
  return ranked
    .filter((r) => r.specScore >= GRAY_LOW && r.specScore < GRAY_HIGH)
    .slice(0, topN);
}

/** 结构规格分与 LLM 置信度（0-1）混合：LLM 主导，保留结构信息。 */
export function blendSpecWithLlm(specScore: number, llmConf: number): number {
  return Math.max(0, Math.min(1, specScore * 0.4 + llmConf * 0.6));
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
