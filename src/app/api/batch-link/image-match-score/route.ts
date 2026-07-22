import { NextResponse } from "next/server";
import { chatCompletionVisionJson } from "@/lib/agents/llm/vision-completion";
import {
  applyImageUrlMatchFloor,
  exactImageUrlMatch,
  IMAGE_URL_MATCH_FLOOR,
} from "@/lib/batch-link/image-match";
import {
  hammingDistanceHex,
  hashImageUrl,
  passesPerceptualMatch,
  perceptualSimilarityFromDistance,
} from "@/lib/batch-link/perceptual-hash";
import { normalizeMatchScore } from "@/lib/agents/products/match-rank";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CandidateIn {
  productId: string;
  imageUrl?: string | null;
  similarityScore?: number | null;
}

/**
 * POST /api/batch-link/image-match-score
 * Visual similarity 0–100: API → URL floor → perceptual hash → vision LLM.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体需为 JSON" }, { status: 400 });
  }

  const shopImageUrl = String(
    (body as { shopImageUrl?: unknown }).shopImageUrl ?? ""
  ).slice(0, 500);
  const candidates = (body as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return NextResponse.json({ scores: {} });
  }

  const list = (candidates as CandidateIn[])
    .slice(0, 8)
    .map((c) => ({
      productId: String(c.productId ?? "").slice(0, 64),
      imageUrl: c.imageUrl ? String(c.imageUrl).slice(0, 500) : null,
      similarityScore: c.similarityScore ?? null,
    }))
    .filter((c) => c.productId);

  const scores: Record<string, number | null> = {};
  const needRemote: typeof list = [];

  for (const c of list) {
    const apiScore = normalizeMatchScore(c.similarityScore);
    if (apiScore != null) {
      scores[c.productId] = apiScore;
      continue;
    }
    if (exactImageUrlMatch(shopImageUrl, c.imageUrl)) {
      scores[c.productId] = IMAGE_URL_MATCH_FLOOR;
      continue;
    }
    if (!c.imageUrl?.trim() || !shopImageUrl.trim()) {
      scores[c.productId] = null;
      continue;
    }
    needRemote.push(c);
  }

  if (needRemote.length > 0 && shopImageUrl.trim()) {
    const hashCache = new Map<string, string | null>();
    const shopHash = await hashImageUrl(shopImageUrl, hashCache);
    const needVision: typeof list = [];

    for (const c of needRemote) {
      if (shopHash) {
        const candHash = await hashImageUrl(c.imageUrl, hashCache);
        if (candHash) {
          const distance = hammingDistanceHex(shopHash, candHash);
          if (distance != null && passesPerceptualMatch(distance)) {
            scores[c.productId] = perceptualSimilarityFromDistance(distance);
            applyImageUrlMatchFloor(shopImageUrl, c, scores);
            continue;
          }
        }
      }
      needVision.push(c);
    }

    if (needVision.length > 0) {
      try {
        const visionScores = await scoreWithVision(shopImageUrl, needVision);
        for (const c of needVision) {
          const raw = visionScores[c.productId];
          scores[c.productId] = raw != null ? raw : null;
          applyImageUrlMatchFloor(shopImageUrl, c, scores);
        }
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            "[image-match-score]",
            err instanceof Error ? err.message : err
          );
        }
        for (const c of needVision) {
          if (scores[c.productId] == null) {
            scores[c.productId] = exactImageUrlMatch(shopImageUrl, c.imageUrl)
              ? IMAGE_URL_MATCH_FLOOR
              : null;
          }
        }
      }
    }
  }

  return NextResponse.json({ scores });
}

async function scoreWithVision(
  shopImageUrl: string,
  candidates: Array<{ productId: string; imageUrl: string | null }>
): Promise<Record<string, number>> {
  const allowed = new Set(candidates.map((c) => c.productId));
  const parts: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [
    {
      type: "text",
      text: `店铺商品主图如下。随后每个候选 ID 对应一张候选货源主图。请仅比较视觉相似度（款式/颜色/形状/图案），忽略标题。输出 JSON：{"scores":{"<productId>": <1-100整数>}}。明显同款给高分，明显不同款给低分。`,
    },
    { type: "image_url", image_url: { url: shopImageUrl } },
  ];

  for (const c of candidates) {
    parts.push({ type: "text", text: `候选 ${c.productId}` });
    if (c.imageUrl) {
      parts.push({ type: "image_url", image_url: { url: c.imageUrl } });
    }
  }

  const raw = await chatCompletionVisionJson({
    temperature: 0.1,
    timeoutMs: 45_000,
    messages: [
      {
        role: "system",
        content:
          "你是跨境选品图像匹配评分器。只根据图片视觉相似度打分，不猜测标题。只输出 JSON scores 对象。",
      },
      { role: "user", content: parts },
    ],
  });

  return parseScores(raw, allowed);
}

function parseScores(
  raw: string,
  allowed: Set<string>
): Record<string, number> {
  const cleaned = raw.trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return {};
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1)) as {
      scores?: Record<string, unknown>;
    };
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj.scores ?? {})) {
      if (!allowed.has(k)) continue;
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n) || n <= 0) continue;
      out[k] = Math.max(1, Math.min(100, Math.round(n)));
    }
    return out;
  } catch {
    return {};
  }
}
