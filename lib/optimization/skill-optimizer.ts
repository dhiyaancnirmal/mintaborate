import { z } from "zod";
import { createHash } from "node:crypto";
import { getModelAdapter } from "@/lib/models/provider-factory";
import type { ModelConfig } from "@/lib/models/types";
import type { TaskEvaluationResult } from "@/lib/scoring/types";
import type { GeneratedTask } from "@/lib/tasks/types";

const optimizationSchema = z.object({
  optimizedSkillMarkdown: z.string().min(40),
  optimizationNotes: z.union([
    z.array(z.string().min(1)).min(1),
    z.string().min(1).transform((value) => [value]),
  ]),
});

export interface SkillOptimizationInput {
  model: ModelConfig;
  docsUrl: string;
  existingSkillText?: string;
  tasks: GeneratedTask[];
  failedEvaluations: TaskEvaluationResult[];
}

export interface SkillOptimizationOutput {
  optimizedSkillMarkdown: string;
  optimizationNotes: string[];
  contentHash: string;
}

export async function generateOptimizedSkill(input: SkillOptimizationInput): Promise<SkillOptimizationOutput> {
  const adapter = getModelAdapter(input.model);

  const taskMap = new Map(input.tasks.map((task) => [task.taskId, task]));
  const failureSummary = input.failedEvaluations
    .map((evaluation, index) => {
      const task = taskMap.get(evaluation.taskId);
      return [
        `${index + 1}. Task: ${task?.name ?? evaluation.taskId}`,
        `Failure class: ${evaluation.failureClass ?? "unknown"}`,
        `Rationale: ${evaluation.rationale}`,
        `Scores: ${JSON.stringify(evaluation.criterionScores)}`,
      ].join("\n");
    })
    .join("\n\n");

  const existingSkill = input.existingSkillText?.trim() || "(No existing skill.md available)";

  const response = await adapter.completeJson({
    config: input.model,
    schema: optimizationSchema,
    messages: [
      {
        role: "system",
        content:
          "You are improving documentation agent skills based on concrete failed task evaluations. Keep guidance grounded, concise, and implementation-oriented.",
      },
      {
        role: "user",
        content: [
          `Docs URL: ${input.docsUrl}`,
          "",
          "Current skill.md:",
          existingSkill,
          "",
          "Failed task evidence:",
          failureSummary,
          "",
          "Produce an improved skill.md focused on fixing these failures.",
          "Constraints:",
          "- Include sections: # Purpose, # Retrieval Strategy, # Critical Workflows, # Failure Prevention, # Verification Checklist.",
          "- Keep content actionable and deterministic.",
          "- Do not invent undocumented APIs; instruct agent to call out missing docs explicitly.",
          "Return JSON with keys: optimizedSkillMarkdown, optimizationNotes.",
        ].join("\n"),
      },
    ],
  });

  const markdown = response.parsed.optimizedSkillMarkdown.trim();

  return {
    optimizedSkillMarkdown: markdown,
    optimizationNotes: response.parsed.optimizationNotes,
    contentHash: createHash("sha256").update(markdown).digest("hex"),
  };
}
