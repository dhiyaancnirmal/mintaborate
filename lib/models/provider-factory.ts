import {
  type JsonCompletionRequest,
  type JsonCompletionResponse,
  type ModelAdapter,
  type TextCompletionRequest,
  type TextCompletionResponse,
} from "@/lib/models/types";
import { createAnthropicAdapter } from "@/lib/models/providers/anthropic";
import { createGeminiAdapter } from "@/lib/models/providers/gemini";
import { createOpenAIAdapter } from "@/lib/models/providers/openai";
import { createOpenAICompatibleAdapter } from "@/lib/models/providers/openai-compatible";
import { createOpenRouterAdapter } from "@/lib/models/providers/openrouter";

function trimToLikelyJsonBoundary(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (trimmed.startsWith("{")) {
    const end = trimmed.lastIndexOf("}");
    if (end > 0) {
      return trimmed.slice(0, end + 1);
    }
  }

  if (trimmed.startsWith("[")) {
    const end = trimmed.lastIndexOf("]");
    if (end > 0) {
      return trimmed.slice(0, end + 1);
    }
  }

  return trimmed;
}

function extractJsonCandidate(text: string): string {
  const trimmed = trimToLikelyJsonBoundary(text);

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const objectStart = trimmed.indexOf("{");
  const arrayStart = trimmed.indexOf("[");
  const hasObject = objectStart >= 0;
  const hasArray = arrayStart >= 0;

  const start =
    hasObject && hasArray
      ? Math.min(objectStart, arrayStart)
      : hasObject
        ? objectStart
        : arrayStart;

  if (start >= 0) {
    const open = trimmed[start];
    const close = open === "[" ? "]" : "}";
    const end = trimmed.lastIndexOf(close);
    if (end > start) {
      return trimmed.slice(start, end + 1).trim();
    }
  }

  return trimmed;
}

function withJsonSupport(baseAdapter: {
  completeText: (input: TextCompletionRequest) => Promise<TextCompletionResponse>;
}): ModelAdapter {
  return {
    completeText: baseAdapter.completeText,
    async completeJson<T>(input: JsonCompletionRequest<T>): Promise<JsonCompletionResponse<T>> {
      const jsonInstruction = {
        role: "system" as const,
        content:
          "Respond with strict JSON only. Do not include markdown, commentary, or surrounding text.",
      };
      const maxJsonAttempts = Math.max(1, Math.min(3, input.config.retries + 1));
      let lastError: unknown = null;
      let lastResponse: TextCompletionResponse | null = null;

      for (let attempt = 0; attempt < maxJsonAttempts; attempt += 1) {
        const messages =
          attempt === 0
            ? [jsonInstruction, ...input.messages]
            : [
                jsonInstruction,
                ...input.messages,
                {
                  role: "user" as const,
                  content: [
                    "Your previous response was invalid JSON for the requested schema.",
                    `Parser error: ${
                      lastError instanceof Error ? lastError.message : "invalid_json"
                    }`,
                    "Rewrite your prior response as valid JSON only.",
                    "Do not include markdown fences or commentary.",
                    "",
                    "Previous response:",
                    lastResponse?.text.slice(0, 6000) ?? "",
                  ].join("\n"),
                },
              ];

        const response = await baseAdapter.completeText({
          ...input,
          messages,
        });

        try {
          const candidate = extractJsonCandidate(response.text);
          const parsedJson = JSON.parse(candidate);
          const parsed = input.schema.parse(parsedJson);

          return {
            ...response,
            parsed,
          };
        } catch (error) {
          lastError = error;
          lastResponse = response;
        }
      }

      const rawPreview = lastResponse?.text.slice(0, 400) ?? "";
      const reason = lastError instanceof Error ? lastError.message : "Unknown JSON parse error";
      throw new Error(`Model returned invalid JSON after retries: ${reason}. Preview: ${rawPreview}`);
    },
  };
}

export function getModelAdapter(config: TextCompletionRequest["config"]): ModelAdapter {
  if (config.provider === "anthropic") {
    return withJsonSupport(createAnthropicAdapter());
  }

  if (config.provider === "openai-compatible") {
    return withJsonSupport(createOpenAICompatibleAdapter());
  }

  if (config.provider === "gemini") {
    return withJsonSupport(createGeminiAdapter());
  }

  if (config.provider === "openrouter") {
    return withJsonSupport(createOpenRouterAdapter());
  }

  return withJsonSupport(createOpenAIAdapter());
}
