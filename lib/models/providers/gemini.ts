import type { TextCompletionRequest, TextCompletionResponse } from "@/lib/models/types";
import { openAIStyleCompletion } from "@/lib/models/providers/openai";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";

export function createGeminiAdapter(): {
  completeText: (input: TextCompletionRequest) => Promise<TextCompletionResponse>;
} {
  return {
    completeText(input) {
      return openAIStyleCompletion(input, {
        providerLabel: "gemini",
        defaultBaseUrl: input.config.baseUrl ?? GEMINI_BASE_URL,
        fallbackApiKeyEnvVar: "GEMINI_API_KEY",
      });
    },
  };
}
