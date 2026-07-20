import { NextResponse } from "next/server";
import { PRODUCTS_SHORT_INPUT_MAX } from "@/lib/agents/products/classify-intent";
import { classifyProductsIntent } from "@/lib/agents/products/classify-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/agents/products/classify
 * Body: { text: string }
 * Returns IntentClassifyResult — intent is always from the fixed enum.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体需为 JSON" }, { status: 400 });
  }

  const text = (body as { text?: unknown }).text;
  if (typeof text !== "string") {
    return NextResponse.json({ error: "缺少 text" }, { status: 400 });
  }

  const result = await classifyProductsIntent(
    text.slice(0, PRODUCTS_SHORT_INPUT_MAX)
  );
  return NextResponse.json(result);
}
