import { NextResponse } from "next/server";
import { classifyLogisticsCommandByRules, buildLogisticsClassifyPrompt, parseLogisticsCommandDraft, type LogisticsCommandClassifyContext } from "@/lib/agents/logistics/classify-command";
import type { LogisticsCommandClassifyResult } from "@/lib/agents/logistics/command-schema";
import { chatCompletionJson } from "@/lib/agents/llm/openai-compatible";
import { LlmUnavailableError } from "@/lib/agents/llm/openai-compatible";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const text = body.text?.trim();
    const context = (body.context as LogisticsCommandClassifyContext | null) ?? null;

    if (!text) {
      return NextResponse.json(
        { confidence: "none", source: "rules", clarify: "请输入命令或简短提问。" } as LogisticsCommandClassifyResult,
        { status: 400 }
      );
    }

    const local = classifyLogisticsCommandByRules(text);
    if (local.confidence === "high" && local.draft) {
      return NextResponse.json(local);
    }

    try {
      const prompt = buildLogisticsClassifyPrompt(text, context);
      const llmResult = await chatCompletionJson({
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: text },
        ],
        temperature: 0.1,
      });

      const draft = parseLogisticsCommandDraft(llmResult);
      if (draft) {
        return NextResponse.json({
          confidence: "high" as const,
          source: "llm" as const,
          draft,
        } as LogisticsCommandClassifyResult);
      }

      return NextResponse.json({
        confidence: "none" as const,
        source: "llm" as const,
        clarify: "无法理解您的命令，请试试其他说法。",
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
      { confidence: "none", source: "rules", clarify: "命令处理失败，请稍后重试。" } as LogisticsCommandClassifyResult,
      { status: 500 }
    );
  }
}