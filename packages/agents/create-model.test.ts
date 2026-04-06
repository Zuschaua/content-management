import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ResolvedAgentConfig } from "./index.js";

vi.mock("@ai-sdk/openai", () => {
  const factory = vi.fn().mockReturnValue({ provider: "openai", modelId: "gpt-4o" });
  return { createOpenAI: vi.fn().mockReturnValue(factory) };
});

vi.mock("@ai-sdk/anthropic", () => {
  const factory = vi.fn().mockReturnValue({ provider: "anthropic", modelId: "claude-sonnet-4-20250514" });
  return { createAnthropic: vi.fn().mockReturnValue(factory) };
});

import { createModelFromConfig } from "./create-model.js";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";

function makeConfig(overrides: Partial<ResolvedAgentConfig> = {}): ResolvedAgentConfig {
  return {
    agentType: "suggestion_engine",
    clientId: "test-client",
    displayName: "Test Agent",
    systemPrompt: "You are a test agent.",
    modelProvider: "openai",
    modelName: "gpt-4o",
    baseUrl: null,
    apiKey: "test-api-key",
    temperature: 0.7,
    maxTokens: 4000,
    ...overrides,
  };
}

describe("createModelFromConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes openai provider to createOpenAI", () => {
    const config = makeConfig({ modelProvider: "openai" });
    createModelFromConfig(config);

    expect(createOpenAI).toHaveBeenCalledWith({
      baseURL: undefined,
      apiKey: "test-api-key",
    });
    const factory = vi.mocked(createOpenAI).mock.results[0].value;
    expect(factory).toHaveBeenCalledWith("gpt-4o");
    expect(createAnthropic).not.toHaveBeenCalled();
  });

  it("routes anthropic provider to createAnthropic", () => {
    const config = makeConfig({
      modelProvider: "anthropic",
      modelName: "claude-sonnet-4-20250514",
      apiKey: "sk-ant-test",
    });
    createModelFromConfig(config);

    expect(createAnthropic).toHaveBeenCalledWith({
      apiKey: "sk-ant-test",
    });
    const factory = vi.mocked(createAnthropic).mock.results[0].value;
    expect(factory).toHaveBeenCalledWith("claude-sonnet-4-20250514");
    expect(createOpenAI).not.toHaveBeenCalled();
  });

  it("routes custom provider to createOpenAI", () => {
    const config = makeConfig({
      modelProvider: "custom",
      baseUrl: "https://openrouter.ai/api/v1",
    });
    createModelFromConfig(config);

    expect(createOpenAI).toHaveBeenCalledWith({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: "test-api-key",
    });
    expect(createAnthropic).not.toHaveBeenCalled();
  });

  it("passes baseURL to anthropic when configured", () => {
    const config = makeConfig({
      modelProvider: "anthropic",
      baseUrl: "https://proxy.example.com",
      apiKey: "sk-ant-proxy",
    });
    createModelFromConfig(config);

    expect(createAnthropic).toHaveBeenCalledWith({
      apiKey: "sk-ant-proxy",
      baseURL: "https://proxy.example.com",
    });
  });

  it("throws descriptive error when apiKey is missing", () => {
    const config = makeConfig({ apiKey: null });

    expect(() => createModelFromConfig(config)).toThrowError(/missing apiKey/);
    expect(createOpenAI).not.toHaveBeenCalled();
    expect(createAnthropic).not.toHaveBeenCalled();
  });

  it("falls back to openai for unknown provider values", () => {
    const config = makeConfig({ modelProvider: "google" });
    createModelFromConfig(config);

    expect(createOpenAI).toHaveBeenCalled();
    expect(createAnthropic).not.toHaveBeenCalled();
  });
});
