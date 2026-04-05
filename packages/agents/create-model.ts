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
  if (!config.apiKey) {
    throw new Error(
      `Agent config for "${config.agentType}" is missing apiKey — ensure an API key is saved for this agent type or for another global config with provider "${config.modelProvider}".`
    );
  }

  const provider = createOpenAI({
    baseURL: config.baseUrl ?? undefined,
    apiKey: config.apiKey,
  });

  return provider(config.modelName);
}
