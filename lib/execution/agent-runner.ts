import { z } from "zod";
import type { ModelConfig, ModelUsage } from "@/lib/models/types";
import { getModelAdapter } from "@/lib/models/provider-factory";
import type { CorpusChunk } from "@/lib/execution/retrieval";
import type { GeneratedTask } from "@/lib/tasks/types";
import type { AgentMemoryState } from "@/lib/runs/types";

const citationSchema = z.object({
  source: z.string().min(1).default("unknown"),
  snippetHash: z.string().optional(),
  excerpt: z.string().default(""),
  startOffset: z.number().int().nonnegative().optional(),
  endOffset: z.number().int().nonnegative().optional(),
});

const agentAnswerSchema = z.object({
  answer: z.string().min(1),
  steps: z.array(z.string().min(1)).min(1),
  citations: z.array(citationSchema).default([]),
});

const planItemSchema = z
  .union([z.string(), z.record(z.string(), z.unknown())])
  .transform((value) => {
    if (typeof value === "string") {
      return value.trim();
    }

    const keys = ["item", "action", "step", "details", "title"];
    for (const key of keys) {
      const field = value[key];
      if (typeof field === "string" && field.trim()) {
        return field.trim();
      }
    }

    return JSON.stringify(value).slice(0, 280);
  })
  .pipe(z.string().min(1));

const planStepSchema = z.object({
  planItems: z.array(planItemSchema).default(["Gather required documentation evidence."]),
  rationale: z.string().default(""),
});

const actStepSchema = z.object({
  answer: z.string().default(""),
  stepOutput: z.string().default(""),
  citations: z.array(citationSchema).default([]),
  done: z.boolean().default(false),
  doneReason: z.string().optional(),
  discoveredFacts: z.array(z.string()).default([]),
});

const reflectStepSchema = z.object({
  shouldContinue: z.boolean().default(false),
  summary: z.string().default(""),
  planUpdates: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0),
  stopReason: z.string().optional(),
});

export type EvidenceCitation = z.infer<typeof citationSchema>;

export interface AgentTaskAttempt {
  taskId: string;
  answer: string;
  steps: string[];
  citations: EvidenceCitation[];
  rawOutput: string;
  model: string;
  usage: ModelUsage;
  latencyMs: number;
  costEstimateUsd: number;
}

export interface AgentPhaseResponse<T> {
  parsed: T;
  text: string;
  model: string;
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

function formatContext(chunks: CorpusChunk[]): string {
  return chunks
    .map(
      (chunk, index) =>
        `[#${index + 1}] source=${chunk.sourceUrl} snippetHash=${chunk.snippetHash}\n${chunk.text}`,
    )
    .join("\n\n");
}

export async function runPlanningStep(input: {
  runModel: ModelConfig;
  task: GeneratedTask;
  memory: AgentMemoryState;
  chunks: CorpusChunk[];
}): Promise<AgentPhaseResponse<z.infer<typeof planStepSchema>>> {
  const adapter = getModelAdapter(input.runModel);
  const context = formatContext(input.chunks);

  const response = await adapter.completeJson({
    config: input.runModel,
    schema: planStepSchema,
    messages: [
      {
        role: "system",
        content:
          "You are a deterministic documentation agent planner. Build concrete actionable plan items grounded in context.",
      },
      {
        role: "user",
        content: [
          `Task: ${input.task.name}`,
          `Task description: ${input.task.description}`,
          `Expected signals: ${input.task.expectedSignals.join(", ")}`,
          "Current memory:",
          JSON.stringify(input.memory),
          "",
          "Context:",
          context,
          "",
          "Return JSON with planItems and rationale.",
        ].join("\n"),
      },
    ],
  });

  return {
    parsed: response.parsed,
    text: response.text,
    model: response.model,
    usage: response.usage,
    latencyMs: response.latencyMs,
    costEstimateUsd: estimateCostUsd(response.usage),
  };
}

export async function runActStep(input: {
  runModel: ModelConfig;
  task: GeneratedTask;
  memory: AgentMemoryState;
  chunks: CorpusChunk[];
  stepIndex: number;
}): Promise<AgentPhaseResponse<z.infer<typeof actStepSchema>>> {
  const adapter = getModelAdapter(input.runModel);
  const context = formatContext(input.chunks);

  const response = await adapter.completeJson({
    config: input.runModel,
    schema: actStepSchema,
    messages: [
      {
        role: "system",
        content:
          "You are a documentation-only execution agent. Use only provided context. Always provide citations. Mark done=true only when the output is implementation-complete and runnable for the task requirements.",
      },
      {
        role: "user",
        content: [
          `Task: ${input.task.name}`,
          `Step: ${input.stepIndex}`,
          `Current plan: ${input.memory.plan.map((item) => `${item.done ? "[x]" : "[ ]"} ${item.item}`).join("; ")}`,
          `Known facts: ${input.memory.facts.map((fact) => fact.fact).join(" | ") || "none"}`,
          "",
          "Context:",
          context,
          "",
          "If evidence is missing, provide a concrete next step and keep done=false.",
          "Return JSON keys: answer, stepOutput, citations, done, doneReason, discoveredFacts.",
        ].join("\n"),
      },
    ],
  });

  return {
    parsed: response.parsed,
    text: response.text,
    model: response.model,
    usage: response.usage,
    latencyMs: response.latencyMs,
    costEstimateUsd: estimateCostUsd(response.usage),
  };
}

export async function runReflectStep(input: {
  runModel: ModelConfig;
  task: GeneratedTask;
  memory: AgentMemoryState;
  latestActOutput: z.infer<typeof actStepSchema>;
}): Promise<AgentPhaseResponse<z.infer<typeof reflectStepSchema>>> {
  const adapter = getModelAdapter(input.runModel);

  const response = await adapter.completeJson({
    config: input.runModel,
    schema: reflectStepSchema,
    messages: [
      {
        role: "system",
        content:
          "You are a strict progress evaluator for documentation task execution. Decide whether to continue based on evidence and task requirements.",
      },
      {
        role: "user",
        content: [
          `Task: ${input.task.name}`,
          `Task description: ${input.task.description}`,
          `Expected signals: ${input.task.expectedSignals.join(", ")}`,
          "Current memory:",
          JSON.stringify(input.memory),
          "Latest act output:",
          JSON.stringify(input.latestActOutput),
          "Return JSON keys: shouldContinue, summary, planUpdates, confidence, stopReason.",
        ].join("\n"),
      },
    ],
  });

  return {
    parsed: response.parsed,
    text: response.text,
    model: response.model,
    usage: response.usage,
    latencyMs: response.latencyMs,
    costEstimateUsd: estimateCostUsd(response.usage),
  };
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
    model: response.model,
    usage: response.usage,
    latencyMs: response.latencyMs,
    costEstimateUsd: estimateCostUsd(response.usage),
  };
}
