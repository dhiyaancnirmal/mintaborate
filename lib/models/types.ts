import type { ZodType } from "zod";

export type ModelProvider = "openai" | "anthropic" | "openai-compatible";

export interface ModelConfig {
  provider: ModelProvider;
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  retries: number;
  apiKey?: string;
  apiKeyEnvVar?: string;
  baseUrl?: string;
}

export interface ModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface TextCompletionRequest {
  config: ModelConfig;
  messages: ModelMessage[];
}

export interface TextCompletionResponse {
  text: string;
  usage: ModelUsage;
  latencyMs: number;
  provider: ModelProvider;
  model: string;
}

export interface JsonCompletionRequest<T> {
  config: ModelConfig;
  messages: ModelMessage[];
  schema: ZodType<T>;
}

export interface JsonCompletionResponse<T> extends TextCompletionResponse {
  parsed: T;
}

export interface ModelAdapter {
  completeText(input: TextCompletionRequest): Promise<TextCompletionResponse>;
  completeJson<T>(input: JsonCompletionRequest<T>): Promise<JsonCompletionResponse<T>>;
}
