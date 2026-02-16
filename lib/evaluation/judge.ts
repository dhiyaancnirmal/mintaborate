import { z } from "zod";
import { getModelAdapter } from "@/lib/models/provider-factory";
import type { ModelConfig } from "@/lib/models/types";
import type { CorpusChunk } from "@/lib/execution/retrieval";
import type { AgentTaskAttempt } from "@/lib/execution/agent-runner";
import type { GeneratedTask } from "@/lib/tasks/types";
import { PASS_THRESHOLD, alignmentSchema, rubricScoreSchema } from "@/lib/evaluation/rubric";
import { classifyFailureClass } from "@/lib/evaluation/failure-classifier";
import type { CriterionScores, TaskEvaluationResult } from "@/lib/scoring/types";
import type { DeterministicGuards } from "@/lib/evaluation/deterministic-checks";

const scoreShapeSchema = z.object({
  completeness: z.number().min(0).max(10),
  correctness: z.number().min(0).max(10),
  groundedness: z.number().min(0).max(10),
  actionability: z.number().min(0).max(10),
});

function averageScores(scores: Omit<CriterionScores, "average">): number {
  return (
    (scores.completeness + scores.correctness + scores.groundedness + scores.actionability) /
    4
  );
}

function applyGuardrails(input: {
  rawScores: Omit<CriterionScores, "average">;
  attempt: AgentTaskAttempt;
  unsupportedClaims: string[];
  deterministicGuards?: DeterministicGuards;
}): CriterionScores {
  const next = { ...input.rawScores };

  if (input.attempt.citations.length === 0) {
    next.groundedness = Math.min(next.groundedness, 4);
  }

  if (input.attempt.steps.length < 2) {
    next.actionability = Math.min(next.actionability, 6);
  }

  if (input.unsupportedClaims.length > 0) {
    next.correctness = Math.min(next.correctness, 6);
    next.groundedness = Math.min(next.groundedness, 5);
  }

  if (input.deterministicGuards?.groundednessCap !== undefined) {
    next.groundedness = Math.min(next.groundedness, input.deterministicGuards.groundednessCap);
  }

  if (input.deterministicGuards?.correctnessCap !== undefined) {
    next.correctness = Math.min(next.correctness, input.deterministicGuards.correctnessCap);
  }

  if (input.deterministicGuards?.completenessCap !== undefined) {
    next.completeness = Math.min(next.completeness, input.deterministicGuards.completenessCap);
  }

  if (input.deterministicGuards?.actionabilityCap !== undefined) {
    next.actionability = Math.min(next.actionability, input.deterministicGuards.actionabilityCap);
  }

  return {
    ...next,
    average: averageScores(next),
  };
}

async function evaluateAlignment(input: {
  judgeModel: ModelConfig;
  task: GeneratedTask;
  attempt: AgentTaskAttempt;
  chunks: CorpusChunk[];
}): Promise<z.infer<typeof alignmentSchema>> {
  const adapter = getModelAdapter(input.judgeModel);
  const evidenceBlock = input.chunks
    .slice(0, 12)
    .map(
      (chunk, index) =>
        `[#${index + 1}] source=${chunk.sourceUrl} snippetHash=${chunk.snippetHash}\n${chunk.text}`,
    )
    .join("\n\n");

  const response = await adapter.completeJson({
    config: input.judgeModel,
    schema: alignmentSchema,
    messages: [
      {
        role: "system",
        content:
          "You are validating whether an answer is supported by provided documentation evidence. Be strict and concise.",
      },
      {
        role: "user",
        content: [
          `Task: ${input.task.name}`,
          `Task description: ${input.task.description}`,
          "",
          "Candidate answer:",
          input.attempt.answer,
          "",
          "Candidate steps:",
          input.attempt.steps.map((step, idx) => `${idx + 1}. ${step}`).join("\n"),
          "",
          "Candidate citations:",
          JSON.stringify(input.attempt.citations),
          "",
          "Evidence context:",
          evidenceBlock,
          "",
          "Return JSON: isSupportedByEvidence (boolean), unsupportedClaims (string[]), notes (string).",
        ].join("\n"),
      },
    ],
  });

  return response.parsed;
}

async function evaluateRubric(input: {
  judgeModel: ModelConfig;
  task: GeneratedTask;
  attempt: AgentTaskAttempt;
  alignment: z.infer<typeof alignmentSchema>;
}): Promise<z.infer<typeof rubricScoreSchema>> {
  const adapter = getModelAdapter(input.judgeModel);

  const response = await adapter.completeJson({
    config: input.judgeModel,
    schema: rubricScoreSchema,
    messages: [
      {
        role: "system",
        content:
          "You are scoring an agent task attempt from 0-10 on completeness, correctness, groundedness, actionability. Return strict JSON only.",
      },
      {
        role: "user",
        content: [
          `Task: ${input.task.name}`,
          `Task description: ${input.task.description}`,
          `Expected signals: ${input.task.expectedSignals.join(", ")}`,
          "",
          "Attempt answer:",
          input.attempt.answer,
          "",
          "Attempt steps:",
          input.attempt.steps.map((step, idx) => `${idx + 1}. ${step}`).join("\n"),
          "",
          "Citations:",
          JSON.stringify(input.attempt.citations),
          "",
          "Alignment pre-check:",
          JSON.stringify(input.alignment),
          "",
          "Return JSON with keys: scores, rationale, confidence, suggestedFailureClass.",
        ].join("\n"),
      },
    ],
  });

  return response.parsed;
}

export async function judgeTaskAttempt(input: {
  judgeModel: ModelConfig;
  task: GeneratedTask;
  attempt: AgentTaskAttempt;
  chunks: CorpusChunk[];
  tieBreakEnabled: boolean;
  deterministicGuards?: DeterministicGuards;
}): Promise<TaskEvaluationResult> {
  const alignment = await evaluateAlignment(input);
  const baseRubric = await evaluateRubric({
    judgeModel: input.judgeModel,
    task: input.task,
    attempt: input.attempt,
    alignment,
  });

  let rawScores = scoreShapeSchema.parse(baseRubric.scores);

  const initial = applyGuardrails({
    rawScores,
    attempt: input.attempt,
    unsupportedClaims: alignment.unsupportedClaims,
    deterministicGuards: input.deterministicGuards,
  });

  let finalScores = initial;

  if (input.tieBreakEnabled && initial.average >= 6.5 && initial.average <= 7.5) {
    const rerubric = await evaluateRubric({
      judgeModel: input.judgeModel,
      task: input.task,
      attempt: input.attempt,
      alignment,
    });

    rawScores = scoreShapeSchema.parse(rerubric.scores);

    const rerun = applyGuardrails({
      rawScores,
      attempt: input.attempt,
      unsupportedClaims: alignment.unsupportedClaims,
      deterministicGuards: input.deterministicGuards,
    });

    finalScores = {
      completeness: Number(((initial.completeness + rerun.completeness) / 2).toFixed(2)),
      correctness: Number(((initial.correctness + rerun.correctness) / 2).toFixed(2)),
      groundedness: Number(((initial.groundedness + rerun.groundedness) / 2).toFixed(2)),
      actionability: Number(((initial.actionability + rerun.actionability) / 2).toFixed(2)),
      average: Number(((initial.average + rerun.average) / 2).toFixed(2)),
    };
  }

  const passBlocked = (input.deterministicGuards?.passBlockedReasons.length ?? 0) > 0;
  const qualityPass = finalScores.average >= PASS_THRESHOLD;
  const validityBlockedReasons: string[] = [];
  if (!alignment.isSupportedByEvidence) {
    validityBlockedReasons.push("unsupported_by_evidence");
  }
  if (passBlocked) {
    validityBlockedReasons.push(...(input.deterministicGuards?.passBlockedReasons ?? []));
  }
  const validityPass = validityBlockedReasons.length === 0;
  const pass = qualityPass && validityPass;

  const rationale = [
    baseRubric.rationale,
    alignment.notes ? `Alignment: ${alignment.notes}` : null,
    passBlocked
      ? `Deterministic blocks: ${input.deterministicGuards?.passBlockedReasons.join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const failureClass = pass
    ? null
    : classifyFailureClass({
        scores: finalScores,
        rationale,
        suggestedFailureClass: baseRubric.suggestedFailureClass,
      });

  return {
    taskId: input.task.taskId,
    pass,
    qualityPass,
    validityPass,
    validityBlockedReasons,
    failureClass,
    rationale,
    confidence: baseRubric.confidence,
    criterionScores: finalScores,
    deterministicChecks: input.deterministicGuards?.checks,
    passBlocked,
  };
}
