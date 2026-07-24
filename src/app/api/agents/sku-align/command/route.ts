import { NextResponse } from "next/server";
import { buildSkuCommandClassifySystemPrompt, parseSkuCommandResponse, classifySkuCommandByRules, type SkuCommandClassifyContext } from "@/lib/agents/sku-align/classify-command";
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

    // LLM-first: the model is the authority for natural-language mapping.
    // Deterministic rules are kept only as an offline fallback when the LLM
    // is unavailable, so the rail still works during outages.
    const local = classifySkuCommandByRules(text);
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

      const parsed = parseSkuCommandResponse(llmResult);
      if (parsed?.kind === "draft") {
        return NextResponse.json({
          confidence: "high" as const,
          source: "llm" as const,
          draft: parsed.draft,
        } as SkuCommandClassifyResult);
      }
      if (parsed?.kind === "steps") {
        return NextResponse.json({
          confidence: "high" as const,
          source: "llm" as const,
          steps: parsed.steps,
        } as SkuCommandClassifyResult);
      }
      if (parsed?.kind === "clarify") {
        // LLM reachable but the instruction is ambiguous: return a structured
        // clarification with candidate intents instead of a plain error.
        return NextResponse.json({
          confidence: "none" as const,
          source: "llm" as const,
          clarify: parsed.clarify,
        } as SkuCommandClassifyResult);
      }

      // LLM reachable but could not map to a known intent: surface its
      // "cannot understand" answer instead of silently falling back to rules
      // (which would otherwise misclassify free-form text as a rule match).
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
