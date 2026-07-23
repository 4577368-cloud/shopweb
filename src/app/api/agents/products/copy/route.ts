import { NextResponse } from "next/server";
import { PRODUCTS_INTENTS, type ProductsIntentId } from "@/lib/agents/products/intents";
import type { ProductsPageContext } from "@/lib/agents/products/page-context";
import { resolveProductsAgentResponse } from "@/lib/agents/products/enrich-copy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTENT_IDS = new Set(PRODUCTS_INTENTS.map((i) => i.id));

/**
 * POST /api/agents/products/copy
 * Body: { intent, context }
 * Returns AgentResponse with LLM-enriched copy fields (or template fallback).
 * Deterministic action fields always come from routeProductsIntent.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体需为 JSON" }, { status: 400 });
  }

  const intent = (body as { intent?: unknown }).intent;
  const context = (body as { context?: unknown }).context;

  if (typeof intent !== "string" || !INTENT_IDS.has(intent as ProductsIntentId)) {
    return NextResponse.json({ error: "无效 intent" }, { status: 400 });
  }
  if (!isProductsPageContext(context)) {
    return NextResponse.json({ error: "无效 page context" }, { status: 400 });
  }

  const result = await resolveProductsAgentResponse(
    intent as ProductsIntentId,
    context,
    {
      userText:
        typeof (body as { userText?: unknown }).userText === "string"
          ? (body as { userText: string }).userText
          : undefined,
      locale:
        typeof (body as { locale?: unknown }).locale === "string"
          ? (body as { locale: string }).locale
          : null,
    }
  );
  return NextResponse.json(result);
}

function isProductsPageContext(v: unknown): v is ProductsPageContext {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    o.page === "products" &&
    typeof o.authorized === "boolean" &&
    typeof o.shopName === "string" &&
    typeof o.analyzedCount === "number" &&
    typeof o.pendingCount === "number" &&
    typeof o.unboundCount === "number" &&
    o.pricing != null &&
    typeof o.pricing === "object"
  );
}
