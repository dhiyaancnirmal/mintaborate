import type { TextCompletionRequest, TextCompletionResponse } from "@/lib/models/types";

const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1/messages";

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function getApiKey(input: TextCompletionRequest): string {
  if (input.config.apiKey) {
    return input.config.apiKey;
  }

  const envVar = input.config.apiKeyEnvVar ?? "ANTHROPIC_API_KEY";
  const key = process.env[envVar];

  if (!key) {
    throw new Error(`Missing Anthropic API key. Expected env var ${envVar}.`);
  }

  return key;
}

export function createAnthropicAdapter(): {
  completeText: (input: TextCompletionRequest) => Promise<TextCompletionResponse>;
} {
  return {
    async completeText(input: TextCompletionRequest): Promise<TextCompletionResponse> {
      const apiKey = getApiKey(input);
      const retries = Math.max(0, input.config.retries);

      const system = input.messages
        .filter((message) => message.role === "system")
        .map((message) => message.content)
        .join("\n\n");

      const messages = input.messages
        .filter((message) => message.role !== "system")
        .map((message) => ({ role: message.role, content: message.content }));

      let lastError: unknown;

      for (let attempt = 0; attempt <= retries; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), input.config.timeoutMs);
        const startedAt = Date.now();

        try {
          const response = await fetch(ANTHROPIC_BASE_URL, {
            method: "POST",
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: input.config.model,
              system,
              messages,
              temperature: input.config.temperature,
              max_tokens: input.config.maxTokens,
            }),
            signal: controller.signal,
          });

          const json = (await response.json()) as {
            error?: { message?: string };
            content?: Array<{ type: string; text?: string }>;
            usage?: { input_tokens?: number; output_tokens?: number };
          };

          if (!response.ok) {
            throw new Error(
              json.error?.message ?? `Anthropic request failed with status ${response.status}`,
            );
          }

          const text = json.content?.find((item) => item.type === "text")?.text?.trim();
          if (!text) {
            throw new Error("Anthropic returned an empty response.");
          }

          clearTimeout(timeout);

          return {
            text,
            usage: {
              inputTokens: json.usage?.input_tokens ?? 0,
              outputTokens: json.usage?.output_tokens ?? 0,
            },
            latencyMs: Date.now() - startedAt,
            provider: "anthropic",
            model: input.config.model,
          };
        } catch (error) {
          clearTimeout(timeout);
          lastError = error;
          if (attempt < retries) {
            await sleep(300 * (attempt + 1));
          }
        }
      }

      throw lastError instanceof Error ? lastError : new Error("Unknown Anthropic model error");
    },
  };
}
