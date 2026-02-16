import {
  type TextCompletionRequest,
  type TextCompletionResponse,
  type ModelProvider,
} from "@/lib/models/types";

const OPENAI_BASE_URL = "https://api.openai.com/v1";

type OpenAIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function resolveApiKey(input: TextCompletionRequest, fallbackEnvVar = "OPENAI_API_KEY"): string {
  const explicit = input.config.apiKey;
  if (explicit) {
    return explicit;
  }

  const envVar = input.config.apiKeyEnvVar ?? fallbackEnvVar;
  const envValue = process.env[envVar];

  if (!envValue) {
    throw new Error(`Missing API key for ${input.config.provider}. Expected env var ${envVar}.`);
  }

  return envValue;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function openAIStyleCompletion(
  input: TextCompletionRequest,
  options?: {
    providerLabel?: ModelProvider;
    defaultBaseUrl?: string;
    fallbackApiKeyEnvVar?: string;
    extraHeaders?: Record<string, string>;
  },
): Promise<TextCompletionResponse> {
  const providerLabel = options?.providerLabel ?? "openai";
  const baseUrl = input.config.baseUrl ?? options?.defaultBaseUrl ?? OPENAI_BASE_URL;
  const apiKey = resolveApiKey(input, options?.fallbackApiKeyEnvVar ?? "OPENAI_API_KEY");
  const retries = Math.max(0, input.config.retries);

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.config.timeoutMs);
    const startedAt = Date.now();

    try {
      const payload = {
        model: input.config.model,
        messages: input.messages satisfies OpenAIMessage[],
        temperature: input.config.temperature,
        max_tokens: input.config.maxTokens,
      };

      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...(options?.extraHeaders ?? {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const json = (await response.json()) as {
        error?: { message?: string };
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      if (!response.ok) {
        throw new Error(json.error?.message ?? `Model call failed with status ${response.status}`);
      }

      const text = json.choices?.[0]?.message?.content?.trim();
      if (!text) {
        throw new Error("Model returned an empty response.");
      }

      clearTimeout(timeout);

      return {
        text,
        usage: {
          inputTokens: json.usage?.prompt_tokens ?? 0,
          outputTokens: json.usage?.completion_tokens ?? 0,
        },
        latencyMs: Date.now() - startedAt,
        provider: providerLabel,
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

  throw lastError instanceof Error ? lastError : new Error("Unknown model error");
}

export function createOpenAIAdapter(): {
  completeText: (input: TextCompletionRequest) => Promise<TextCompletionResponse>;
} {
  return {
    completeText(input) {
      return openAIStyleCompletion(input, {
        providerLabel: "openai",
        defaultBaseUrl: OPENAI_BASE_URL,
        fallbackApiKeyEnvVar: "OPENAI_API_KEY",
      });
    },
  };
}
