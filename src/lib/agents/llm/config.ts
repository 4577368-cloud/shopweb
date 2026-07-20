/**
 * Server-only LLM env for OpenAI-compatible chat endpoints.
 * Never import this from client components.
 */

export interface LlmModelConfig {
  baseUrl: string;
  apiKey: string;
  modelId: string;
}

export function getLlmModelConfig(): LlmModelConfig | null {
  const baseUrl = process.env.LLM_MODEL_BASE_URL?.trim();
  const apiKey = process.env.LLM_MODEL_API_KEY?.trim();
  const modelId = process.env.LLM_MODEL_MODEL_ID?.trim();
  if (!baseUrl || !apiKey || !modelId) return null;
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiKey,
    modelId,
  };
}
