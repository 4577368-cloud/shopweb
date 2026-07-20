import { NextResponse } from "next/server";
import { chatCompletionJson } from "@/lib/agents/llm/openai-compatible";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CandidateIn {
  productId: string;
  title?: string;
  imageUrl?: string | null;
}

/**
 * POST /api/agents/products/match-score
 * When image-search similarity is missing, ask the model for 0–100 visual/product match scores.
 * Does not invent catalog data — only scores given candidates.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体需为 JSON" }, { status: 400 });
  }

  const shopTitle = String((body as { shopTitle?: unknown }).shopTitle ?? "").slice(
    0,
    200
  );
  const shopImageUrl = String(
    (body as { shopImageUrl?: unknown }).shopImageUrl ?? ""
  ).slice(0, 500);
  const candidates = (body as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return NextResponse.json({ error: "缺少 candidates" }, { status: 400 });
  }

  const list = (candidates as CandidateIn[])
    .slice(0, 8)
    .map((c) => ({
      productId: String(c.productId ?? "").slice(0, 64),
      title: String(c.title ?? "").slice(0, 160),
      imageUrl: c.imageUrl ? String(c.imageUrl).slice(0, 500) : null,
    }))
    .filter((c) => c.productId);

  if (list.length === 0) {
    return NextResponse.json({ scores: {} });
  }

  try {
    const raw = await chatCompletionJson({
      temperature: 0.1,
      timeoutMs: 25_000,
      messages: [
        {
          role: "system",
          content: `你是跨境选品匹配评分器。根据店铺商品与候选货源的标题/图片 URL，给出 0–100 的视觉与商品相似度分数。
规则：
1. 只输出 JSON：{"scores":{"<productId>": <number>}}
2. 每个 productId 必须来自输入列表，不得编造 id
3. 分数为整数 1–100；明显同款偏高，无关偏低
4. 不要输出其它键或解释`,
        },
        {
          role: "user",
          content: JSON.stringify({
            shop: { title: shopTitle, imageUrl: shopImageUrl || null },
            candidates: list,
          }),
        },
      ],
    });

    const scores = parseScores(raw, new Set(list.map((c) => c.productId)));
    return NextResponse.json({ scores });
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[match-score]",
        err instanceof Error ? err.message : err
      );
    }
    return NextResponse.json({ scores: {} });
  }
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
