import { NextResponse } from "next/server";
import { chatCompletionJson } from "@/lib/agents/llm/openai-compatible";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PairIn {
  id: string;
  variantLabel?: string;
  specLabel?: string;
}

/**
 * POST /api/agents/sku-align/spec-match
 * 灰区复核：仅对结构化打分处于模糊区间的「目标规格 vs 货源规格」对，
 * 让模型判断等价置信度（跨语言/同义/单位/模糊表达）。不做全量匹配。
 * 失败一律优雅降级为空，调用方回落结构化分。
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体需为 JSON" }, { status: 400 });
  }

  const pairsRaw = (body as { pairs?: unknown }).pairs;
  if (!Array.isArray(pairsRaw) || pairsRaw.length === 0) {
    return NextResponse.json({ error: "缺少 pairs" }, { status: 400 });
  }

  const pairs = (pairsRaw as PairIn[])
    .slice(0, 12)
    .map((p) => ({
      id: String(p.id ?? "").slice(0, 120),
      target: String(p.variantLabel ?? "").slice(0, 120),
      source: String(p.specLabel ?? "").slice(0, 120),
    }))
    .filter((p) => p.id && p.target && p.source);

  if (pairs.length === 0) {
    return NextResponse.json({ scores: {} });
  }

  try {
    const raw = await chatCompletionJson({
      temperature: 0.1,
      timeoutMs: 25_000,
      messages: [
        {
          role: "system",
          content: `你是跨境电商 SKU 规格等价判定器。给定若干「目标规格 vs 货源规格」对，判断每对是否指向同一实际商品规格。
需要考虑：跨语言（Black=黑色）、同义（运动鞋=sneaker）、单位换算（US9≈EU42、256G=256GB）、模糊表达（儿童款≈6-15岁、补水≈hydrating）。
规则：
1. 只输出 JSON：{"scores":{"<id>": <整数 0-100>}}
2. id 必须来自输入，不得编造
3. 分数=等价置信度：完全等价→90-100；很可能→70-89；存疑→40-69；明显不同→0-39
4. 颜色/尺码/型号/容量有明确冲突时给低分（<40）
5. 不要输出其它键或解释`,
        },
        {
          role: "user",
          content: JSON.stringify({ pairs }),
        },
      ],
    });

    const scores = parseScores(raw, new Set(pairs.map((p) => p.id)));
    return NextResponse.json({ scores });
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[sku-align/spec-match]", err instanceof Error ? err.message : err);
    }
    return NextResponse.json({ scores: {} });
  }
}

function parseScores(raw: string, allowed: Set<string>): Record<string, number> {
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
      if (!Number.isFinite(n)) continue;
      out[k] = Math.max(0, Math.min(100, Math.round(n)));
    }
    return out;
  } catch {
    return {};
  }
}
