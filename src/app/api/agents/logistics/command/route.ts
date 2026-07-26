import { NextResponse } from "next/server";
import {
  buildLogisticsClassifyPrompt,
  parseLogisticsCommandDraft,
  classifyLogisticsCommandByRules,
  normalizeLogisticsCommandDraft,
  type LogisticsCommandClassifyContext,
} from "@/lib/agents/logistics/classify-command";
import {
  calibrateLogisticsLlmConfidence,
} from "@/lib/agents/logistics/llm-classify-calibration";
import { buildResponseLanguageRule } from "@/lib/agents/runtime/response-language";
import type { LogisticsCommandClassifyResult } from "@/lib/agents/logistics/command-schema";
import { chatCompletionJson } from "@/lib/agents/llm/openai-compatible";
import { LlmUnavailableError } from "@/lib/agents/llm/openai-compatible";
import { createTranslator } from "@/i18n/server";

export async function POST(req: Request) {
  const t = createTranslator(null);
  try {
    const body = await req.json();
    const text = body.text?.trim();
    const context = (body.context as LogisticsCommandClassifyContext | null) ?? null;
    const localized = createTranslator(body.locale);

    if (!text) {
      return NextResponse.json(
        { confidence: "none", source: "rules", clarify: localized("api.errEmptyText") } as LogisticsCommandClassifyResult,
        { status: 400 }
      );
    }

    const local = classifyLogisticsCommandByRules(text, context);

    try {
      const prompt = buildLogisticsClassifyPrompt(
        localized,
        text,
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

      const parsed = parseLogisticsCommandDraft(llmResult);
      if (parsed) {
        const draft = normalizeLogisticsCommandDraft(parsed);
        const confidence = calibrateLogisticsLlmConfidence(
          text,
          draft,
          local,
          context
        );
        if (confidence === "none") {
          return NextResponse.json({
            confidence: "none" as const,
            source: "llm" as const,
            clarify: localized("api.errCannotUnderstand"),
          } as LogisticsCommandClassifyResult);
        }
        return NextResponse.json({
          confidence,
          source: "llm" as const,
          draft,
        } as LogisticsCommandClassifyResult);
      }

      return NextResponse.json({
        confidence: "none" as const,
        source: "llm" as const,
        clarify: localized("api.errCannotUnderstand"),
      } as LogisticsCommandClassifyResult);
    } catch (llmErr) {
      if (llmErr instanceof LlmUnavailableError) {
        return NextResponse.json(local);
      }
      throw llmErr;
    }
  } catch (err) {
    console.error("[logistics command classify] error:", err);
    return NextResponse.json(
      { confidence: "none", source: "rules", clarify: t("api.errCommandFailed") } as LogisticsCommandClassifyResult,
      { status: 500 }
    );
  }
}
