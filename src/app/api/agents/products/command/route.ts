import { NextResponse } from "next/server";
import { PRODUCTS_SHORT_INPUT_MAX } from "@/lib/agents/products/classify-intent";
import { classifyProductCommand } from "@/lib/agents/products/classify-command-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/agents/products/command
 * Body: { text: string }
 * Returns structured command draft — never executes side effects.
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

  const result = await classifyProductCommand(
    text.slice(0, PRODUCTS_SHORT_INPUT_MAX)
  );
  return NextResponse.json(result);
}
