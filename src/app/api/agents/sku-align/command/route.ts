import { NextResponse } from "next/server";
import { buildSkuCommandClassifySystemPrompt, parseSkuCommandDraft, classifySkuCommandByRules, type SkuCommandClassifyContext } from "@/lib/agents/sku-align/classify-command";
import { buildResponseLanguageRule } from "@/lib/agents/runtime/response-language";
import type { SkuCommandClassifyResult } from "@/lib/agents/sku-align/command-schema";
import { chatCompletionJson } from "@/lib/agents/llm/openai-compatible";
import { LlmUnavailableError } from "@/lib/agents/llm/openai-compatible";
import { createTranslator } from "@/i18n/server";

export async function POST(req: Request) {
  const t = createTranslator(null);
  try {
    const body = await req.json();
    const text = body.text?.trim();
    const context = (body.context as SkuCommandClassifyContext | null) ?? null;
    const localized = createTranslator(body.locale);

    if (!text) {
      return NextResponse.json(
        { confidence: "none", source: "rules", clarify: localized("api.errEmptyText") } as SkuCommandClassifyResult,
        { status: 400 }
      );
    }

    const local = classifySkuCommandByRules(text);
    if (local.confidence === "high" && local.draft) {
      return NextResponse.json(local);
    }

    try {
      const prompt = buildSkuCommandClassifySystemPrompt(
        context,
        buildResponseLanguageRule(text, body.locale)
      );
      const llmResult = await chatCompletionJson({
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: text },
        ],
        temperature: 0.1,
      });

      const draft = parseSkuCommandDraft(llmResult);
      if (draft) {
        return NextResponse.json({
          confidence: "high" as const,
          source: "llm" as const,
          draft,
        } as SkuCommandClassifyResult);
      }

      return NextResponse.json({
        confidence: "none" as const,
        source: "llm" as const,
        clarify: localized("api.errCannotUnderstand"),
      } as SkuCommandClassifyResult);
    } catch (llmErr) {
      if (llmErr instanceof LlmUnavailableError) {
        return NextResponse.json(local);
      }
      throw llmErr;
    }
  } catch (err) {
    console.error("[sku-align command classify] error:", err);
    return NextResponse.json(
      { confidence: "none", source: "rules", clarify: t("api.errCommandFailed") } as SkuCommandClassifyResult,
      { status: 500 }
    );
  }
}
