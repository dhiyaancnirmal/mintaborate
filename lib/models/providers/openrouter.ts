import OpenAI from "openai";
import type {
  ModelMessage,
  TextCompletionRequest,
  TextCompletionResponse,
} from "@/lib/models/types";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function resolveApiKey(input: TextCompletionRequest): string {
  if (input.config.apiKey) {
    return input.config.apiKey;
  }

  const envVar = input.config.apiKeyEnvVar ?? "OPENROUTER_API_KEY";
  const key = process.env[envVar];

  if (!key) {
    throw new Error(`Missing OpenRouter API key. Expected env var ${envVar}.`);
  }

  return key;
}

function toContent(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part && typeof part === "object" && "text" in part && typeof part.text === "string"
          ? part.text
          : "",
      )
      .join("\n")
      .trim();
  }

  return "";
}

function mapMessage(message: ModelMessage): OpenAI.Chat.Completions.ChatCompletionMessageParam {
  if (message.role === "assistant") {
    return {
      role: "assistant",
      content: message.content,
      ...(message.reasoningDetails !== undefined
        ? { reasoning_details: message.reasoningDetails }
        : {}),
    } as OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam;
  }

  if (message.role === "system") {
    return {
      role: "system",
      content: message.content,
    };
  }

  return {
    role: "user",
    content: message.content,
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function createOpenRouterAdapter(): {
  completeText: (input: TextCompletionRequest) => Promise<TextCompletionResponse>;
} {
  return {
    async completeText(input) {
      const baseUrl = input.config.baseUrl ?? OPENROUTER_BASE_URL;
      const apiKey = resolveApiKey(input);
      const retries = Math.max(0, input.config.retries);

      const client = new OpenAI({
        baseURL: baseUrl,
        apiKey,
        defaultHeaders: {
          ...(process.env.OPENROUTER_APP_URL
            ? { "HTTP-Referer": process.env.OPENROUTER_APP_URL }
            : {}),
          ...(process.env.OPENROUTER_APP_NAME ? { "X-Title": process.env.OPENROUTER_APP_NAME } : {}),
        },
      });

      let lastError: unknown;

      for (let attempt = 0; attempt <= retries; attempt += 1) {
        const startedAt = Date.now();

        try {
          const body = {
            model: input.config.model,
            messages: input.messages.map(mapMessage),
            temperature: input.config.temperature,
            max_tokens: input.config.maxTokens,
            stream: false,
          } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;

          const response = await client.chat.completions.create(
            body,
            {
              timeout: input.config.timeoutMs,
            },
          );

          const firstChoice = response.choices[0];
          const text = toContent(firstChoice?.message?.content);
          if (!text) {
            throw new Error("OpenRouter returned an empty response.");
          }

          return {
            text,
            usage: {
              inputTokens: response.usage?.prompt_tokens ?? 0,
              outputTokens: response.usage?.completion_tokens ?? 0,
            },
            latencyMs: Date.now() - startedAt,
            provider: "openrouter",
            model: response.model ?? input.config.model,
            reasoningDetails:
              (firstChoice?.message as { reasoning_details?: unknown } | undefined)
                ?.reasoning_details,
          };
        } catch (error) {
          lastError = error;
          if (attempt < retries) {
            await sleep(300 * (attempt + 1));
          }
        }
      }

      throw lastError instanceof Error ? lastError : new Error("Unknown OpenRouter model error");
    },
  };
}
