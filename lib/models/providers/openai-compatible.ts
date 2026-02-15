import type { TextCompletionRequest, TextCompletionResponse } from "@/lib/models/types";
import { openAIStyleCompletion } from "@/lib/models/providers/openai";

const DEFAULT_COMPATIBLE_BASE_URL = "https://api.openai.com/v1";

export function createOpenAICompatibleAdapter(): {
  completeText: (input: TextCompletionRequest) => Promise<TextCompletionResponse>;
} {
  return {
    completeText(input) {
      return openAIStyleCompletion(input, {
        providerLabel: "openai-compatible",
        defaultBaseUrl: input.config.baseUrl ?? DEFAULT_COMPATIBLE_BASE_URL,
        fallbackApiKeyEnvVar: "OPENAI_COMPATIBLE_API_KEY",
      });
    },
  };
}
