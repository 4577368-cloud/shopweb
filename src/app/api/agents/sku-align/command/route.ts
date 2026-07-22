import { NextResponse } from "next/server";
import { buildSkuCommandClassifySystemPrompt, parseSkuCommandDraft, classifySkuCommandByRules, type SkuCommandClassifyContext } from "@/lib/agents/sku-align/classify-command";
import type { SkuCommandClassifyResult } from "@/lib/agents/sku-align/command-schema";
import { chatCompletionJson } from "@/lib/agents/llm/openai-compatible";
import { LlmUnavailableError } from "@/lib/agents/llm/openai-compatible";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const text = body.text?.trim();
    const context = (body.context as SkuCommandClassifyContext | null) ?? null;

    if (!text) {
      return NextResponse.json(
        { confidence: "none", source: "rules", clarify: "请输入命令或简短提问。" } as SkuCommandClassifyResult,
        { status: 400 }
      );
    }

    const local = classifySkuCommandByRules(text);
    if (local.confidence === "high" && local.draft) {
      return NextResponse.json(local);
    }

    try {
      const prompt = buildSkuCommandClassifySystemPrompt(context);
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
        clarify: "无法理解您的命令，请试试其他说法。",
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
      { confidence: "none", source: "rules", clarify: "命令处理失败，请稍后重试。" } as SkuCommandClassifyResult,
      { status: 500 }
    );
  }
}