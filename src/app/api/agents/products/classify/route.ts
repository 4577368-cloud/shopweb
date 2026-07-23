import { NextResponse } from "next/server";
import { PRODUCTS_SHORT_INPUT_MAX } from "@/lib/agents/products/classify-intent";
import { classifyProductsIntent } from "@/lib/agents/products/classify-service";
import { createTranslator } from "@/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/agents/products/classify
 * Body: { text: string, locale?: string }
 * Returns IntentClassifyResult — intent is always from the fixed enum.
 */
export async function POST(request: Request) {
  const t = createTranslator(null);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("api.errJsonBody") }, { status: 400 });
  }

  const locale = (body as { locale?: unknown }).locale;
  const localized = createTranslator(
    typeof locale === "string" ? locale : null
  );

  const text = (body as { text?: unknown }).text;
  if (typeof text !== "string") {
    return NextResponse.json({ error: localized("api.errMissingText") }, { status: 400 });
  }

  const result = await classifyProductsIntent(
    text.slice(0, PRODUCTS_SHORT_INPUT_MAX),
    typeof locale === "string" ? locale : null
  );
  return NextResponse.json(result);
}
