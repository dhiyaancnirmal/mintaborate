import { z } from "zod";
import type { ModelConfig, ModelUsage } from "@/lib/models/types";
import { getModelAdapter } from "@/lib/models/provider-factory";
import type { CorpusChunk } from "@/lib/execution/retrieval";
import type { GeneratedTask } from "@/lib/tasks/types";

const citationSchema = z.object({
  source: z.string().min(1),
  snippetHash: z.string().optional(),
  excerpt: z.string().min(1),
  startOffset: z.number().int().nonnegative().optional(),
  endOffset: z.number().int().nonnegative().optional(),
});

const agentAnswerSchema = z.object({
  answer: z.string().min(1),
  steps: z.array(z.string().min(1)).min(1),
  citations: z.array(citationSchema),
});

export type EvidenceCitation = z.infer<typeof citationSchema>;

export interface AgentTaskAttempt {
  taskId: string;
  answer: string;
  steps: string[];
  citations: EvidenceCitation[];
  rawOutput: string;
  usage: ModelUsage;
  latencyMs: number;
  costEstimateUsd: number;
}

function estimateCostUsd(usage: ModelUsage): number {
  if (usage.inputTokens === 0 && usage.outputTokens === 0) {
    return 0;
  }

  const inputCostPerMillion = 0.5;
  const outputCostPerMillion = 2;

  return (usage.inputTokens / 1_000_000) * inputCostPerMillion +
    (usage.outputTokens / 1_000_000) * outputCostPerMillion;
}

export async function runAgentTask(input: {
  runModel: ModelConfig;
  task: GeneratedTask;
  chunks: CorpusChunk[];
}): Promise<AgentTaskAttempt> {
  const adapter = getModelAdapter(input.runModel);

  const context = input.chunks
    .map(
      (chunk, index) =>
        `[#${index + 1}] source=${chunk.sourceUrl} snippetHash=${chunk.snippetHash}\n${chunk.text}`,
    )
    .join("\n\n");

  const response = await adapter.completeJson({
    config: input.runModel,
    schema: agentAnswerSchema,
    messages: [
      {
        role: "system",
        content:
          "You are a documentation-only execution agent. Use only provided context. If the context is incomplete, explicitly say what is missing. Always provide citations.",
      },
      {
        role: "user",
        content: [
          `Task name: ${input.task.name}`,
          `Task description: ${input.task.description}`,
          `Expected signals: ${input.task.expectedSignals.join(", ")}`,
          "",
          "Context:",
          context,
          "",
          "Return JSON with keys: answer, steps, citations.",
          "Each citation should include source, snippetHash (if known), and excerpt.",
        ].join("\n"),
      },
    ],
  });

  const citations = response.parsed.citations.slice(0, 12);

  return {
    taskId: input.task.taskId,
    answer: response.parsed.answer,
    steps: response.parsed.steps,
    citations,
    rawOutput: response.text,
    usage: response.usage,
    latencyMs: response.latencyMs,
    costEstimateUsd: estimateCostUsd(response.usage),
  };
}
