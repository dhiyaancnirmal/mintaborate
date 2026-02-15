import {
  type JsonCompletionRequest,
  type JsonCompletionResponse,
  type ModelAdapter,
  type TextCompletionRequest,
  type TextCompletionResponse,
} from "@/lib/models/types";
import { createAnthropicAdapter } from "@/lib/models/providers/anthropic";
import { createOpenAIAdapter } from "@/lib/models/providers/openai";
import { createOpenAICompatibleAdapter } from "@/lib/models/providers/openai-compatible";

function extractJsonCandidate(text: string): string {
  const trimmed = text.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
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

      const response = await baseAdapter.completeText({
        ...input,
        messages: [jsonInstruction, ...input.messages],
      });

      const candidate = extractJsonCandidate(response.text);
      const parsedJson = JSON.parse(candidate);
      const parsed = input.schema.parse(parsedJson);

      return {
        ...response,
        parsed,
      };
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

  return withJsonSupport(createOpenAIAdapter());
}
