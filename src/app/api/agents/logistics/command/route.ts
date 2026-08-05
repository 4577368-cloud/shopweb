import { NextResponse } from "next/server";
import { rejectUnlessAppSession } from "@/lib/auth/require-app-session";
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
import { canonicalizeCommandToZh } from "@/lib/agents/shared/canonicalize-command-text";

export async function POST(req: Request) {
  const denied = rejectUnlessAppSession(req);
  if (denied) return denied;

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

    const { original, canonicalZh, translated } =
      await canonicalizeCommandToZh(text);
    const classifyText = canonicalZh;

    const local = classifyLogisticsCommandByRules(classifyText, context);

    try {
      const prompt = buildLogisticsClassifyPrompt(
        localized,
        classifyText,
        context,
        buildResponseLanguageRule(original, body.locale)
      );
      const llmResult = await chatCompletionJson({
        messages: [
          { role: "system", content: prompt },
          {
            role: "user",
            content: translated
              ? JSON.stringify({
                  userText: original,
                  canonicalZh: classifyText,
                  note: "canonicalZh is Simplified Chinese rewrite; prefer it for intent mapping.",
                })
              : original,
          },
        ],
        temperature: 0.1,
      });

      const parsed = parseLogisticsCommandDraft(llmResult);
      if (parsed) {
        const draft = normalizeLogisticsCommandDraft(parsed);
        const confidence = calibrateLogisticsLlmConfidence(
          classifyText,
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
        if (translated && local.confidence !== "high") {
          return NextResponse.json(
            classifyLogisticsCommandByRules(original, context)
          );
        }
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
