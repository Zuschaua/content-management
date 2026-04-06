import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import type { ResolvedAgentConfig } from "./index.js";

/**
 * Creates a Vercel AI SDK LanguageModel from a resolved agent config.
 *
 * Routes to the correct SDK provider based on `config.modelProvider`:
 *   - "anthropic" → @ai-sdk/anthropic
 *   - "openai" / "custom" / default → @ai-sdk/openai (OpenAI-compatible)
 */
export function createModelFromConfig(config: ResolvedAgentConfig): LanguageModel {
  if (!config.apiKey) {
    throw new Error(
      `Agent config for "${config.agentType}" is missing apiKey — ensure an API key is saved for this agent type or for another global config with provider "${config.modelProvider}".`
    );
  }

  switch (config.modelProvider) {
    case "anthropic": {
      const provider = createAnthropic({
        apiKey: config.apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      });
      return provider(config.modelName);
    }
    case "openai":
    case "custom":
    default: {
      const provider = createOpenAI({
        baseURL: config.baseUrl ?? undefined,
        apiKey: config.apiKey,
      });
      return provider(config.modelName);
    }
  }
}
