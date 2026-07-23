import { NextResponse } from "next/server";
import { PRODUCTS_SHORT_INPUT_MAX } from "@/lib/agents/products/classify-intent";
import { classifyProductCommand } from "@/lib/agents/products/classify-command-service";
import type { CommandClassifyContext } from "@/lib/agents/products/classify-command";
import { createTranslator } from "@/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/agents/products/command
 * Body: { text: string, context?: CommandClassifyContext, locale?: string }
 * Returns structured command draft — never executes side effects.
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

  const context = (body as { context?: CommandClassifyContext }).context ?? null;

  const result = await classifyProductCommand(
    text.slice(0, PRODUCTS_SHORT_INPUT_MAX),
    context,
    typeof locale === "string" ? locale : null
  );
  return NextResponse.json(result);
}
