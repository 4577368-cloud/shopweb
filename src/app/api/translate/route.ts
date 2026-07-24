import { NextResponse } from "next/server";
import {
  detectTranslateSourceLang,
  normalizeTranslateLang,
} from "@/lib/translate/lang-codes";
import {
  localizeProductTitle,
  type TitleLocalizationStyle,
} from "@/lib/translate/localize-product-title";

export const runtime = "nodejs";

interface TranslateRequest {
  text: string;
  targetLang?: string;
  sourceLang?: string;
  style?: TitleLocalizationStyle;
}

interface TranslateResponse {
  success: boolean;
  translatedText?: string;
  sourceLang?: string;
  targetLang?: string;
  engine?: "llm" | "mymemory";
  error?: string;
  unchanged?: boolean;
}

export async function POST(req: Request) {
  try {
    const body: TranslateRequest = await req.json();
    const { text } = body;

    if (!text || !text.trim()) {
      return NextResponse.json<TranslateResponse>({
        success: false,
        error: "文本不能为空",
      });
    }

    const sourceLang = normalizeTranslateLang(
      body.sourceLang ?? detectTranslateSourceLang(text)
    );
    const targetLang = normalizeTranslateLang(body.targetLang ?? "en");
    const style = body.style ?? "amazon";

    const result = await localizeProductTitle({
      text,
      targetLang,
      sourceLang,
      style,
    });

    if (!result.success) {
      return NextResponse.json<TranslateResponse>(
        {
          success: false,
          error: result.error ?? "翻译失败",
          sourceLang: result.sourceLang,
          targetLang: result.targetLang,
          unchanged: result.unchanged,
        },
        { status: 500 }
      );
    }

    return NextResponse.json<TranslateResponse>({
      success: true,
      translatedText: result.text,
      sourceLang: result.sourceLang,
      targetLang: result.targetLang,
      engine: result.engine,
      unchanged: result.unchanged,
    });
  } catch (err) {
    console.error("[translate] error:", err);
    return NextResponse.json<TranslateResponse>(
      {
        success: false,
        error: err instanceof Error ? err.message : "翻译失败",
      },
      { status: 500 }
    );
  }
}
