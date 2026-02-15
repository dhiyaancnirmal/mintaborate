import { nanoid } from "nanoid";
import { and, desc, eq, sql } from "drizzle-orm";
import { buildDefaultRunConfig } from "@/lib/config/env";
import { getDb } from "@/lib/db/client";
import {
  ingestionArtifacts,
  runErrors,
  runEvents,
  runs,
  taskAttempts,
  taskEvaluations,
  tasks,
} from "@/lib/db/schema";
import { normalizeDocsUrl } from "@/lib/ingestion/normalize";
import type { IngestionArtifact } from "@/lib/ingestion/fetchers";
import type { ModelConfig } from "@/lib/models/types";
import type { RunAggregateScore, TaskEvaluationResult } from "@/lib/scoring/types";
import type { GeneratedTask } from "@/lib/tasks/types";
import type {
  CreateRunRequest,
  RunConfig,
  RunStatus,
  RunTotals,
  RunEventPayload,
  TaskStatus,
} from "@/lib/runs/types";
import { appendRunEvent } from "@/lib/runs/events";
import type { AgentTaskAttempt } from "@/lib/execution/agent-runner";

export interface PersistedTaskView {
  taskId: string;
  name: string;
  description: string;
  category: string;
  difficulty: string;
  status: TaskStatus;
  expectedSignals: string[];
}

export interface RunDetailResponse {
  run: {
    id: string;
    docsUrl: string;
    status: RunStatus;
    startedAt: number;
    endedAt: number | null;
    totals: RunTotals | null;
    config: RunConfig;
  };
  tasks: Array<
    PersistedTaskView & {
      evaluation: TaskEvaluationResult | null;
    }
  >;
  recentEvents: Array<{ seq: number; eventType: string; payload: RunEventPayload; createdAt: number }>;
}

function mergeModelConfig(defaultConfig: ModelConfig, patch?: Partial<ModelConfig>): ModelConfig {
  return {
    ...defaultConfig,
    ...(patch ?? {}),
  };
}

export function buildRunConfig(input: CreateRunRequest): RunConfig {
  const defaults = buildDefaultRunConfig(input.taskCount);

  return {
    ...defaults,
    runModel: mergeModelConfig(defaults.runModel, input.runModel),
    judgeModel: mergeModelConfig(defaults.judgeModel, input.judgeModel),
    executionConcurrency: input.executionConcurrency ?? defaults.executionConcurrency,
    judgeConcurrency: input.judgeConcurrency ?? defaults.judgeConcurrency,
    tieBreakEnabled: input.tieBreakEnabled ?? defaults.tieBreakEnabled,
    budget: {
      maxTasks: input.taskCount ?? defaults.budget.maxTasks,
      maxTokensPerTask: input.maxTokensPerTask ?? defaults.budget.maxTokensPerTask,
      hardCostCapUsd: input.hardCostCapUsd ?? defaults.budget.hardCostCapUsd,
    },
  };
}

export async function createRun(input: CreateRunRequest): Promise<{ runId: string }> {
  const db = await getDb();
  const runId = `run_${nanoid(10)}`;
  const docsUrl = normalizeDocsUrl(input.docsUrl);
  const config = buildRunConfig(input);
  const now = Date.now();

  await db.insert(runs).values({
    id: runId,
    docsUrl,
    configJson: JSON.stringify(config),
    status: "queued",
    startedAt: now,
    endedAt: null,
    totalsJson: null,
    costEstimate: 0,
  });

  await appendRunEvent(runId, "run.queued", {
    runId,
    phase: "run",
    message: "Run queued.",
  });

  return { runId };
}

export async function listRuns(limit = 20): Promise<
  Array<{ id: string; docsUrl: string; status: RunStatus; startedAt: number; endedAt: number | null }>
> {
  const db = await getDb();

  const rows = await db
    .select({
      id: runs.id,
      docsUrl: runs.docsUrl,
      status: runs.status,
      startedAt: runs.startedAt,
      endedAt: runs.endedAt,
    })
    .from(runs)
    .orderBy(desc(runs.startedAt))
    .limit(limit);

  return rows as Array<{
    id: string;
    docsUrl: string;
    status: RunStatus;
    startedAt: number;
    endedAt: number | null;
  }>;
}

export async function getRun(runId: string): Promise<{
  id: string;
  docsUrl: string;
  status: RunStatus;
  startedAt: number;
  endedAt: number | null;
  totals: RunTotals | null;
  config: RunConfig;
  costEstimate: number;
} | null> {
  const db = await getDb();

  const row = await db.query.runs.findFirst({
    where: eq(runs.id, runId),
  });

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    docsUrl: row.docsUrl,
    status: row.status as RunStatus,
    startedAt: row.startedAt,
    endedAt: row.endedAt ?? null,
    totals: row.totalsJson ? (JSON.parse(row.totalsJson) as RunTotals) : null,
    config: JSON.parse(row.configJson) as RunConfig,
    costEstimate: row.costEstimate,
  };
}

export async function getRunDetail(runId: string): Promise<RunDetailResponse | null> {
  const db = await getDb();
  const run = await getRun(runId);

  if (!run) {
    return null;
  }

  const taskRows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.runId, runId))
    .orderBy(tasks.id);

  const evaluationRows = await db
    .select()
    .from(taskEvaluations)
    .where(eq(taskEvaluations.runId, runId));

  const recentEventRows = await db
    .select()
    .from(runEvents)
    .where(eq(runEvents.runId, runId))
    .orderBy(desc(runEvents.seq))
    .limit(100);

  const evalMap = new Map<string, TaskEvaluationResult>();
  for (const row of evaluationRows) {
    const scores = JSON.parse(row.criterionScoresJson) as TaskEvaluationResult["criterionScores"];
    evalMap.set(row.taskId, {
      taskId: row.taskId,
      pass: row.pass,
      failureClass: (row.failureClass as TaskEvaluationResult["failureClass"]) ?? null,
      rationale: row.rationale,
      confidence: row.confidence,
      criterionScores: scores,
    });
  }

  return {
    run: {
      id: run.id,
      docsUrl: run.docsUrl,
      status: run.status,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      totals: run.totals,
      config: run.config,
    },
    tasks: taskRows.map((task) => ({
      taskId: task.taskId,
      name: task.name,
      description: task.description,
      category: task.category,
      difficulty: task.difficulty,
      status: task.status as TaskStatus,
      expectedSignals: JSON.parse(task.expectedSignalsJson) as string[],
      evaluation: evalMap.get(task.taskId) ?? null,
    })),
    recentEvents: recentEventRows
      .map((row) => ({
        seq: row.seq,
        eventType: row.eventType,
        payload: JSON.parse(row.payloadJson) as RunEventPayload,
        createdAt: row.createdAt,
      }))
      .reverse(),
  };
}

export async function updateRunStatus(runId: string, status: RunStatus): Promise<void> {
  const db = await getDb();
  const current = await db
    .select({ status: runs.status })
    .from(runs)
    .where(eq(runs.id, runId))
    .limit(1);

  const currentStatus = current[0]?.status as RunStatus | undefined;
  const terminalStatuses: RunStatus[] = ["completed", "failed", "canceled"];

  if (currentStatus && terminalStatuses.includes(currentStatus) && !terminalStatuses.includes(status)) {
    return;
  }

  await db
    .update(runs)
    .set({
      status,
      endedAt: ["completed", "failed", "canceled"].includes(status) ? Date.now() : null,
    })
    .where(eq(runs.id, runId));
}

export async function cancelRun(runId: string): Promise<void> {
  await updateRunStatus(runId, "canceled");
  await appendRunEvent(runId, "run.canceled", {
    runId,
    phase: "run",
    message: "Run cancellation requested.",
  });
}

export async function isRunCanceled(runId: string): Promise<boolean> {
  const db = await getDb();

  const row = await db
    .select({ status: runs.status })
    .from(runs)
    .where(eq(runs.id, runId))
    .limit(1);

  return row[0]?.status === "canceled";
}

export async function persistIngestionArtifacts(
  runId: string,
  artifacts: IngestionArtifact[],
): Promise<void> {
  if (artifacts.length === 0) {
    return;
  }

  const db = await getDb();

  await db.insert(ingestionArtifacts).values(
    artifacts.map((artifact) => ({
      runId,
      artifactType: artifact.artifactType,
      sourceUrl: artifact.sourceUrl,
      content: artifact.content,
      contentHash: artifact.contentHash,
      metadataJson: artifact.metadata ? JSON.stringify(artifact.metadata) : null,
      createdAt: Date.now(),
    })),
  );
}

export async function getIngestionArtifacts(runId: string): Promise<IngestionArtifact[]> {
  const db = await getDb();

  const rows = await db
    .select()
    .from(ingestionArtifacts)
    .where(eq(ingestionArtifacts.runId, runId))
    .orderBy(ingestionArtifacts.id);

  return rows.map((row) => ({
    artifactType: row.artifactType as IngestionArtifact["artifactType"],
    sourceUrl: row.sourceUrl,
    content: row.content,
    contentHash: row.contentHash,
    metadata: row.metadataJson ? (JSON.parse(row.metadataJson) as Record<string, unknown>) : undefined,
  }));
}

export async function persistTasks(runId: string, generatedTasks: GeneratedTask[]): Promise<void> {
  if (generatedTasks.length === 0) {
    return;
  }

  const db = await getDb();

  await db.insert(tasks).values(
    generatedTasks.map((task) => ({
      runId,
      taskId: task.taskId,
      name: task.name,
      description: task.description,
      category: task.category,
      difficulty: task.difficulty,
      expectedSignalsJson: JSON.stringify(task.expectedSignals),
      status: "pending",
      createdAt: Date.now(),
    })),
  );
}

export async function getTasks(runId: string): Promise<GeneratedTask[]> {
  const db = await getDb();

  const rows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.runId, runId))
    .orderBy(tasks.id);

  return rows.map((row) => ({
    taskId: row.taskId,
    name: row.name,
    description: row.description,
    category: row.category as GeneratedTask["category"],
    difficulty: row.difficulty as GeneratedTask["difficulty"],
    expectedSignals: JSON.parse(row.expectedSignalsJson) as string[],
  }));
}

export async function updateTaskStatus(
  runId: string,
  taskId: string,
  status: TaskStatus,
): Promise<void> {
  const db = await getDb();

  await db
    .update(tasks)
    .set({ status })
    .where(and(eq(tasks.runId, runId), eq(tasks.taskId, taskId)));
}

export async function persistTaskAttempt(runId: string, attempt: AgentTaskAttempt): Promise<void> {
  const db = await getDb();

  await db.insert(taskAttempts).values({
    runId,
    taskId: attempt.taskId,
    modelOutput: attempt.answer,
    citationsJson: JSON.stringify(attempt.citations),
    latencyMs: attempt.latencyMs,
    tokensIn: attempt.usage.inputTokens,
    tokensOut: attempt.usage.outputTokens,
    costEstimate: attempt.costEstimateUsd,
    createdAt: Date.now(),
  });

  await db
    .update(runs)
    .set({
      costEstimate: sql`${runs.costEstimate} + ${attempt.costEstimateUsd}`,
    })
    .where(eq(runs.id, runId));
}

export async function persistTaskEvaluation(
  runId: string,
  evaluation: TaskEvaluationResult,
  judgeModel: string,
): Promise<void> {
  const db = await getDb();

  await db.insert(taskEvaluations).values({
    runId,
    taskId: evaluation.taskId,
    criterionScoresJson: JSON.stringify(evaluation.criterionScores),
    pass: evaluation.pass,
    failureClass: evaluation.failureClass,
    rationale: evaluation.rationale,
    judgeModel,
    confidence: evaluation.confidence,
    createdAt: Date.now(),
  });

  await updateTaskStatus(runId, evaluation.taskId, evaluation.pass ? "passed" : "failed");
}

export async function listTaskEvaluations(runId: string): Promise<TaskEvaluationResult[]> {
  const db = await getDb();

  const rows = await db
    .select()
    .from(taskEvaluations)
    .where(eq(taskEvaluations.runId, runId));

  return rows.map((row) => ({
    taskId: row.taskId,
    pass: row.pass,
    failureClass: (row.failureClass as TaskEvaluationResult["failureClass"]) ?? null,
    rationale: row.rationale,
    confidence: row.confidence,
    criterionScores: JSON.parse(row.criterionScoresJson) as TaskEvaluationResult["criterionScores"],
  }));
}

export async function finalizeRun(
  runId: string,
  status: Extract<RunStatus, "completed" | "failed" | "canceled">,
  totals: RunAggregateScore | null,
): Promise<void> {
  const db = await getDb();

  await db
    .update(runs)
    .set({
      status,
      totalsJson: totals ? JSON.stringify(totals) : null,
      endedAt: Date.now(),
    })
    .where(eq(runs.id, runId));
}

export async function persistRunError(input: {
  runId: string;
  phase: string;
  errorCode: string;
  message: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const db = await getDb();

  await db.insert(runErrors).values({
    runId: input.runId,
    phase: input.phase,
    errorCode: input.errorCode,
    message: input.message,
    detailsJson: input.details ? JSON.stringify(input.details) : null,
    createdAt: Date.now(),
  });
}
