import { getLlmModelConfig } from "@/lib/agents/llm/config";

export class LlmUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmUnavailableError";
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * OpenAI-compatible chat/completions (Qwen / vLLM / etc.).
 * Server-only — keys never reach the browser.
 */
export async function chatCompletionJson(opts: {
  messages: ChatMessage[];
  temperature?: number;
  timeoutMs?: number;
}): Promise<string> {
  const cfg = getLlmModelConfig();
  if (!cfg) {
    throw new LlmUnavailableError("LLM 未配置（缺少 LLM_MODEL_* 环境变量）");
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? 20_000
  );

  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.modelId,
        temperature: opts.temperature ?? 0.3,
        messages: opts.messages,
      }),
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new LlmUnavailableError(
        `LLM 请求失败（${res.status}）：${text.slice(0, 200)}`
      );
    }

    let body: {
      choices?: Array<{ message?: { content?: string } }>;
    };
    try {
      body = JSON.parse(text) as typeof body;
    } catch {
      throw new LlmUnavailableError("LLM 返回非 JSON");
    }

    const content = body.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new LlmUnavailableError("LLM 返回空内容");
    }
    return content;
  } catch (err) {
    if (err instanceof LlmUnavailableError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new LlmUnavailableError("LLM 请求超时");
    }
    throw new LlmUnavailableError(
      err instanceof Error ? err.message : "LLM 调用失败"
    );
  } finally {
    clearTimeout(timeout);
  }
}
