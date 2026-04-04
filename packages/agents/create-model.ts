import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { ResolvedAgentConfig } from "./index.js";

/**
 * Creates a Vercel AI SDK LanguageModel from a resolved agent config.
 *
 * Uses the OpenAI-compatible provider by default, which works with:
 *   - OpenAI directly
 *   - OpenRouter (set baseUrl to https://openrouter.ai/api/v1)
 *   - Local Ollama (set baseUrl to http://localhost:11434/v1)
 *   - Any other OpenAI-compatible endpoint
 *
 * Anthropic-native support can be layered in by checking modelProvider === "anthropic"
 * and using @ai-sdk/anthropic when that package is added.
 */
export function createModelFromConfig(config: ResolvedAgentConfig): LanguageModel {
  const provider = createOpenAI({
    baseURL: config.baseUrl ?? undefined,
    apiKey: config.apiKey ?? "placeholder",
  });

  return provider(config.modelName);
}
