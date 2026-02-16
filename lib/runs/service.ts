import { nanoid } from "nanoid";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { buildDefaultModelConfig, buildDefaultRunConfig, getEnv } from "@/lib/config/env";
import { getDb } from "@/lib/db/client";
import {
  deterministicChecks,
  ingestionArtifacts,
  runErrors,
  runEvents,
  runWorkers,
  runs,
  skillOptimizationArtifacts,
  skillOptimizationSessions,
  taskAgentState,
  taskAttempts,
  taskEvaluations,
  taskExecutions,
  taskStepCitations,
  taskSteps,
  tasks,
} from "@/lib/db/schema";
import { normalizeDocsUrl } from "@/lib/ingestion/normalize";
import type { IngestionArtifact } from "@/lib/ingestion/fetchers";
import type { ModelConfig } from "@/lib/models/types";
import type { RunAggregateScore, TaskEvaluationResult } from "@/lib/scoring/types";
import type { GeneratedTask } from "@/lib/tasks/types";
import type {
  AgentMemoryState,
  CreateRunRequest,
  PersistedWorker,
  RunConfig,
  RunEventPayload,
  RunStatus,
  SkillOptimizationStatus,
  TaskPhase,
  RunTotals,
  TaskExecutionStatus,
  TaskExecutionSummary,
  TaskStatus,
  WorkerAssignmentInput,
  WorkerConfig,
  WorkerStatus,
} from "@/lib/runs/types";
import { appendRunEvent } from "@/lib/runs/events";
import type { AgentTaskAttempt, EvidenceCitation } from "@/lib/execution/agent-runner";

export interface PersistedTaskView {
  taskId: string;
  name: string;
  description: string;
  category: string;
  difficulty: string;
  status: TaskStatus;
  expectedSignals: string[];
}

export interface StepTraceView {
  id: number;
  taskExecutionId: number;
  stepIndex: number;
  phase: string;
  input: unknown;
  output: unknown;
  retrieval: unknown;
  usage: unknown;
  decision: unknown;
  citations: EvidenceCitation[];
  createdAt: number;
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
  workers: PersistedWorker[];
  taskExecutions: TaskExecutionSummary[];
  recentSteps: StepTraceView[];
  recentEvents: Array<{ id: number; seq: number; eventType: string; payload: RunEventPayload; createdAt: number }>;
  runErrors: Array<{
    id: number;
    phase: string;
    errorCode: string;
    message: string;
    details: Record<string, unknown> | null;
    createdAt: number;
  }>;
  optimization: {
    status: SkillOptimizationStatus;
    sourceSkillOrigin: "site_skill" | "none";
    baselineTotals: RunAggregateScore | null;
    optimizedTotals: RunAggregateScore | null;
    delta: {
      passRateDelta: number;
      averageScoreDelta: number;
      passedTasksDelta: number;
      failedTasksDelta: number;
    } | null;
    taskComparisons: Array<{
      taskId: string;
      baselinePass: boolean | null;
      optimizedPass: boolean | null;
      baselineScore: number | null;
      optimizedScore: number | null;
    }>;
    optimizedSkillMarkdown: string | null;
    optimizationNotes: string[];
    errorMessage: string | null;
  };
}

interface SkillOptimizationSessionRecord {
  id: number;
  runId: string;
  status: SkillOptimizationStatus;
  sourceSkillOrigin: "site_skill" | "none";
  baselineTotals: RunAggregateScore | null;
  optimizedTotals: RunAggregateScore | null;
  delta: {
    passRateDelta: number;
    averageScoreDelta: number;
    passedTasksDelta: number;
    failedTasksDelta: number;
  } | null;
  errorMessage: string | null;
}

type SkillOptimizationArtifactType =
  | "baseline_skill"
  | "optimized_skill"
  | "generation_prompt"
  | "generation_output";

function mergeModelConfig(defaultConfig: ModelConfig, patch?: Partial<ModelConfig>): ModelConfig {
  return {
    ...defaultConfig,
    ...(patch ?? {}),
  };
}

function normalizeAssignments(input: {
  requestedWorkerCount: number;
  assignments: WorkerAssignmentInput[];
  fallbackModel: ModelConfig;
}): WorkerAssignmentInput[] {
  const baseAssignments =
    input.assignments.length > 0
      ? input.assignments.filter((assignment) => assignment.quantity > 0)
      : [
          {
            provider: input.fallbackModel.provider,
            model: input.fallbackModel.model,
            quantity: input.requestedWorkerCount,
            temperature: input.fallbackModel.temperature,
            maxTokens: input.fallbackModel.maxTokens,
            timeoutMs: input.fallbackModel.timeoutMs,
            retries: input.fallbackModel.retries,
            apiKeyEnvVar: input.fallbackModel.apiKeyEnvVar,
            baseUrl: input.fallbackModel.baseUrl,
          },
        ];

  if (baseAssignments.length === 0) {
    return [
      {
        provider: input.fallbackModel.provider,
        model: input.fallbackModel.model,
        quantity: input.requestedWorkerCount,
      },
    ];
  }

  const sum = baseAssignments.reduce((acc, assignment) => acc + assignment.quantity, 0);

  if (sum === input.requestedWorkerCount) {
    return baseAssignments;
  }

  if (sum < input.requestedWorkerCount) {
    return [
      ...baseAssignments,
      {
        provider: input.fallbackModel.provider,
        model: input.fallbackModel.model,
        quantity: input.requestedWorkerCount - sum,
      },
    ];
  }

  let remaining = input.requestedWorkerCount;
  const normalized: WorkerAssignmentInput[] = [];

  for (const assignment of baseAssignments) {
    if (remaining <= 0) {
      break;
    }

    const quantity = Math.min(assignment.quantity, remaining);
    normalized.push({ ...assignment, quantity });
    remaining -= quantity;
  }

  return normalized;
}

export function buildRunConfig(input: CreateRunRequest): RunConfig {
  const defaults = buildDefaultRunConfig(input.taskCount);
  const env = getEnv();

  const runModel = mergeModelConfig(defaults.runModel, input.runModel);
  const judgeModel = mergeModelConfig(defaults.judgeModel, input.judgeModel);

  const requestedWorkerCount = Math.max(
    1,
    Math.min(
      input.workers?.workerCount ?? defaults.workerConfig.workerCount,
      env.MAX_WORKER_COUNT,
    ),
  );

  const assignments = normalizeAssignments({
    requestedWorkerCount,
    assignments: input.workers?.assignments ?? defaults.workerConfig.assignments,
    fallbackModel: runModel,
  });

  const workerConfig: WorkerConfig = {
    workerCount: requestedWorkerCount,
    assignments,
  };

  return {
    ...defaults,
    runModel,
    judgeModel,
    executionConcurrency: input.executionConcurrency ?? defaults.executionConcurrency,
    judgeConcurrency: input.judgeConcurrency ?? defaults.judgeConcurrency,
    enableSkillOptimization:
      input.enableSkillOptimization ?? defaults.enableSkillOptimization,
    tieBreakEnabled: input.tieBreakEnabled ?? defaults.tieBreakEnabled,
    budget: {
      maxTasks: input.taskCount ?? defaults.budget.maxTasks,
      maxStepsPerTask: input.maxStepsPerTask ?? defaults.budget.maxStepsPerTask,
      maxTokensPerTask: input.maxTokensPerTask ?? defaults.budget.maxTokensPerTask,
      hardCostCapUsd: input.hardCostCapUsd ?? defaults.budget.hardCostCapUsd,
    },
    workerConfig,
    userDefinedTasks: input.tasks ?? [],
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

  const row = (await db.select().from(runs).where(eq(runs.id, runId)).limit(1))[0];

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

export async function getRunWorkers(runId: string): Promise<PersistedWorker[]> {
  const db = await getDb();

  const rows = await db
    .select()
    .from(runWorkers)
    .where(eq(runWorkers.runId, runId))
    .orderBy(asc(runWorkers.id));

  return rows.map((row) => ({
    id: row.id,
    runId: row.runId,
    workerLabel: row.workerLabel,
    modelProvider: row.modelProvider as PersistedWorker["modelProvider"],
    modelName: row.modelName,
    modelConfig: JSON.parse(row.modelConfigJson) as ModelConfig,
    status: row.status as WorkerStatus,
    startedAt: row.startedAt,
    endedAt: row.endedAt ?? null,
  }));
}

export async function ensureRunWorkers(runId: string, config: RunConfig): Promise<PersistedWorker[]> {
  const existing = await getRunWorkers(runId);
  if (existing.length > 0) {
    return existing;
  }

  const db = await getDb();
  const now = Date.now();

  const expandedConfigs: ModelConfig[] = [];

  for (const assignment of config.workerConfig.assignments) {
    for (let i = 0; i < assignment.quantity; i += 1) {
      expandedConfigs.push({
        ...buildDefaultModelConfig("run"),
        provider: assignment.provider,
        model: assignment.model,
        temperature: assignment.temperature ?? config.runModel.temperature,
        maxTokens: assignment.maxTokens ?? config.runModel.maxTokens,
        timeoutMs: assignment.timeoutMs ?? config.runModel.timeoutMs,
        retries: assignment.retries ?? config.runModel.retries,
        baseUrl: assignment.baseUrl ?? config.runModel.baseUrl,
        apiKeyEnvVar: assignment.apiKeyEnvVar ?? config.runModel.apiKeyEnvVar,
      });
    }
  }

  while (expandedConfigs.length < config.workerConfig.workerCount) {
    expandedConfigs.push(config.runModel);
  }

  const values = expandedConfigs.slice(0, config.workerConfig.workerCount).map((workerConfig, index) => ({
    runId,
    workerLabel: `worker-${index + 1}`,
    modelProvider: workerConfig.provider,
    modelName: workerConfig.model,
    modelConfigJson: JSON.stringify(workerConfig),
    status: "idle",
    startedAt: now,
    endedAt: null,
  }));

  await db.insert(runWorkers).values(values);

  return getRunWorkers(runId);
}

export async function updateWorkerStatus(workerId: number, status: WorkerStatus): Promise<void> {
  const db = await getDb();

  await db
    .update(runWorkers)
    .set({
      status,
      endedAt: ["done", "error"].includes(status) ? Date.now() : null,
    })
    .where(eq(runWorkers.id, workerId));
}

export async function createTaskExecution(input: {
  runId: string;
  taskId: string;
  workerId: number;
  phase: TaskPhase;
}): Promise<number> {
  const db = await getDb();

  const result = await db.insert(taskExecutions).values({
    runId: input.runId,
    taskId: input.taskId,
    phase: input.phase,
    workerId: input.workerId,
    status: "running",
    stepCount: 0,
    tokensInTotal: 0,
    tokensOutTotal: 0,
    costEstimateTotal: 0,
    stopReason: null,
    startedAt: Date.now(),
    endedAt: null,
  }).returning({ id: taskExecutions.id });

  return result[0]!.id;
}

export async function updateTaskExecutionProgress(input: {
  taskExecutionId: number;
  stepCountDelta?: number;
  tokensInDelta?: number;
  tokensOutDelta?: number;
  costDelta?: number;
}): Promise<void> {
  const db = await getDb();

  await db
    .update(taskExecutions)
    .set({
      stepCount: sql`${taskExecutions.stepCount} + ${input.stepCountDelta ?? 0}`,
      tokensInTotal: sql`${taskExecutions.tokensInTotal} + ${input.tokensInDelta ?? 0}`,
      tokensOutTotal: sql`${taskExecutions.tokensOutTotal} + ${input.tokensOutDelta ?? 0}`,
      costEstimateTotal: sql`${taskExecutions.costEstimateTotal} + ${input.costDelta ?? 0}`,
    })
    .where(eq(taskExecutions.id, input.taskExecutionId));
}

export async function finalizeTaskExecution(input: {
  taskExecutionId: number;
  status: TaskExecutionStatus;
  stopReason: string;
}): Promise<void> {
  const db = await getDb();

  await db
    .update(taskExecutions)
    .set({
      status: input.status,
      stopReason: input.stopReason,
      endedAt: Date.now(),
    })
    .where(eq(taskExecutions.id, input.taskExecutionId));
}

export async function upsertTaskAgentState(input: {
  taskExecutionId: number;
  state: AgentMemoryState;
}): Promise<void> {
  const db = await getDb();

  await db.insert(taskAgentState).values({
    taskExecutionId: input.taskExecutionId,
    currentStep: input.state.currentStep,
    goalJson: JSON.stringify(input.state.goal),
    planJson: JSON.stringify(input.state.plan),
    visitedSourcesJson: JSON.stringify(input.state.visitedSources),
    factsJson: JSON.stringify(input.state.facts),
    stepSummariesJson: JSON.stringify(input.state.stepSummaries),
    remainingBudgetJson: JSON.stringify(input.state.remainingBudget),
    updatedAt: Date.now(),
  }).onConflictDoUpdate({
    target: taskAgentState.taskExecutionId,
    set: {
      currentStep: input.state.currentStep,
      goalJson: JSON.stringify(input.state.goal),
      planJson: JSON.stringify(input.state.plan),
      visitedSourcesJson: JSON.stringify(input.state.visitedSources),
      factsJson: JSON.stringify(input.state.facts),
      stepSummariesJson: JSON.stringify(input.state.stepSummaries),
      remainingBudgetJson: JSON.stringify(input.state.remainingBudget),
      updatedAt: Date.now(),
    },
  });
}

export async function getTaskAgentState(taskExecutionId: number): Promise<AgentMemoryState | null> {
  const db = await getDb();

  const row = (
    await db
      .select()
      .from(taskAgentState)
      .where(eq(taskAgentState.taskExecutionId, taskExecutionId))
      .limit(1)
  )[0];

  if (!row) {
    return null;
  }

  return {
    currentStep: row.currentStep,
    goal: JSON.parse(row.goalJson) as AgentMemoryState["goal"],
    plan: JSON.parse(row.planJson) as AgentMemoryState["plan"],
    visitedSources: JSON.parse(row.visitedSourcesJson) as string[],
    facts: JSON.parse(row.factsJson) as AgentMemoryState["facts"],
    stepSummaries: JSON.parse(row.stepSummariesJson) as string[],
    remainingBudget: JSON.parse(row.remainingBudgetJson) as AgentMemoryState["remainingBudget"],
  };
}

export async function persistTaskStep(input: {
  taskExecutionId: number;
  stepIndex: number;
  phase: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  retrieval?: Record<string, unknown>;
  usage?: Record<string, unknown>;
  decision?: Record<string, unknown>;
}): Promise<number> {
  const db = await getDb();

  const inserted = await db.insert(taskSteps).values({
    taskExecutionId: input.taskExecutionId,
    stepIndex: input.stepIndex,
    phase: input.phase,
    inputJson: JSON.stringify(input.input),
    outputJson: JSON.stringify(input.output),
    retrievalJson: input.retrieval ? JSON.stringify(input.retrieval) : null,
    usageJson: input.usage ? JSON.stringify(input.usage) : null,
    decisionJson: input.decision ? JSON.stringify(input.decision) : null,
    createdAt: Date.now(),
  }).returning({ id: taskSteps.id });

  return inserted[0]!.id;
}

export async function persistTaskStepCitations(stepId: number, citations: EvidenceCitation[]): Promise<void> {
  if (citations.length === 0) {
    return;
  }

  const db = await getDb();

  await db.insert(taskStepCitations).values(
    citations.map((citation) => ({
      taskStepId: stepId,
      sourceUrl: citation.source,
      snippetHash: citation.snippetHash ?? null,
      excerpt: citation.excerpt,
      startOffset: citation.startOffset ?? null,
      endOffset: citation.endOffset ?? null,
    })),
  );
}

export async function persistDeterministicChecks(input: {
  taskExecutionId: number;
  checks: Array<{
    name: string;
    passed: boolean;
    scoreDelta: number;
    details?: Record<string, unknown>;
  }>;
}): Promise<void> {
  if (input.checks.length === 0) {
    return;
  }

  const db = await getDb();

  await db.insert(deterministicChecks).values(
    input.checks.map((check) => ({
      taskExecutionId: input.taskExecutionId,
      checkName: check.name,
      passed: check.passed,
      scoreDelta: check.scoreDelta,
      detailsJson: check.details ? JSON.stringify(check.details) : null,
      createdAt: Date.now(),
    })),
  );
}

export async function listTaskExecutionSummaries(runId: string): Promise<TaskExecutionSummary[]> {
  const db = await getDb();

  const rows = await db
    .select()
    .from(taskExecutions)
    .where(eq(taskExecutions.runId, runId))
    .orderBy(asc(taskExecutions.id));

  return rows.map((row) => ({
    id: row.id,
    runId: row.runId,
    taskId: row.taskId,
    phase: row.phase as TaskPhase,
    workerId: row.workerId ?? null,
    status: row.status as TaskExecutionStatus,
    stepCount: row.stepCount,
    tokensInTotal: row.tokensInTotal,
    tokensOutTotal: row.tokensOutTotal,
    costEstimateTotal: row.costEstimateTotal,
    stopReason: row.stopReason as TaskExecutionSummary["stopReason"],
    startedAt: row.startedAt,
    endedAt: row.endedAt ?? null,
  }));
}

export async function getRecentStepTraces(runId: string, limit = 120): Promise<StepTraceView[]> {
  const db = await getDb();
  const executions = await db
    .select({ id: taskExecutions.id })
    .from(taskExecutions)
    .where(eq(taskExecutions.runId, runId));

  if (executions.length === 0) {
    return [];
  }

  const executionIds = executions.map((execution) => execution.id);

  const steps = await db
    .select()
    .from(taskSteps)
    .where(inArray(taskSteps.taskExecutionId, executionIds))
    .orderBy(desc(taskSteps.id))
    .limit(limit);

  const stepIds = steps.map((step) => step.id);
  const citations = stepIds.length > 0
    ? await db.select().from(taskStepCitations).where(inArray(taskStepCitations.taskStepId, stepIds))
    : [];

  const citationMap = new Map<number, EvidenceCitation[]>();

  for (const citation of citations) {
    const current = citationMap.get(citation.taskStepId) ?? [];
    current.push({
      source: citation.sourceUrl,
      snippetHash: citation.snippetHash ?? undefined,
      excerpt: citation.excerpt,
      startOffset: citation.startOffset ?? undefined,
      endOffset: citation.endOffset ?? undefined,
    });
    citationMap.set(citation.taskStepId, current);
  }

  return steps
    .map((step) => ({
      id: step.id,
      taskExecutionId: step.taskExecutionId,
      stepIndex: step.stepIndex,
      phase: step.phase,
      input: JSON.parse(step.inputJson) as unknown,
      output: JSON.parse(step.outputJson) as unknown,
      retrieval: step.retrievalJson ? (JSON.parse(step.retrievalJson) as unknown) : null,
      usage: step.usageJson ? (JSON.parse(step.usageJson) as unknown) : null,
      decision: step.decisionJson ? (JSON.parse(step.decisionJson) as unknown) : null,
      citations: citationMap.get(step.id) ?? [],
      createdAt: step.createdAt,
    }))
    .reverse();
}

function defaultOptimizationResponse(): RunDetailResponse["optimization"] {
  return {
    status: "not_started",
    sourceSkillOrigin: "none",
    baselineTotals: null,
    optimizedTotals: null,
    delta: null,
    taskComparisons: [],
    optimizedSkillMarkdown: null,
    optimizationNotes: [],
    errorMessage: null,
  };
}

export async function createOrGetSkillOptimizationSession(input: {
  runId: string;
  sourceSkillOrigin: "site_skill" | "none";
}): Promise<SkillOptimizationSessionRecord> {
  const db = await getDb();
  const now = Date.now();

  const existing = (
    await db
      .select()
      .from(skillOptimizationSessions)
      .where(eq(skillOptimizationSessions.runId, input.runId))
      .limit(1)
  )[0];

  if (existing) {
    return {
      id: existing.id,
      runId: existing.runId,
      status: existing.status as SkillOptimizationStatus,
      sourceSkillOrigin: existing.sourceSkillOrigin as "site_skill" | "none",
      baselineTotals: existing.baselineSummaryJson
        ? (JSON.parse(existing.baselineSummaryJson) as RunAggregateScore)
        : null,
      optimizedTotals: existing.optimizedSummaryJson
        ? (JSON.parse(existing.optimizedSummaryJson) as RunAggregateScore)
        : null,
      delta: existing.deltaJson
        ? (JSON.parse(existing.deltaJson) as SkillOptimizationSessionRecord["delta"])
        : null,
      errorMessage: existing.errorMessage ?? null,
    };
  }

  const inserted = await db.insert(skillOptimizationSessions).values({
    runId: input.runId,
    status: "not_started",
    sourceSkillOrigin: input.sourceSkillOrigin,
    baselineSummaryJson: null,
    optimizedSummaryJson: null,
    deltaJson: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  }).returning({ id: skillOptimizationSessions.id });

  return {
    id: inserted[0]!.id,
    runId: input.runId,
    status: "not_started",
    sourceSkillOrigin: input.sourceSkillOrigin,
    baselineTotals: null,
    optimizedTotals: null,
    delta: null,
    errorMessage: null,
  };
}

export async function updateSkillOptimizationSession(
  runId: string,
  patch: {
    status?: SkillOptimizationStatus;
    baselineTotals?: RunAggregateScore | null;
    optimizedTotals?: RunAggregateScore | null;
    delta?: SkillOptimizationSessionRecord["delta"];
    errorMessage?: string | null;
  },
): Promise<void> {
  const db = await getDb();
  const row = (
    await db
      .select()
      .from(skillOptimizationSessions)
      .where(eq(skillOptimizationSessions.runId, runId))
      .limit(1)
  )[0];

  if (!row) {
    return;
  }

  await db
    .update(skillOptimizationSessions)
    .set({
      status: patch.status ?? row.status,
      baselineSummaryJson:
        patch.baselineTotals !== undefined
          ? (patch.baselineTotals ? JSON.stringify(patch.baselineTotals) : null)
          : row.baselineSummaryJson,
      optimizedSummaryJson:
        patch.optimizedTotals !== undefined
          ? (patch.optimizedTotals ? JSON.stringify(patch.optimizedTotals) : null)
          : row.optimizedSummaryJson,
      deltaJson:
        patch.delta !== undefined
          ? (patch.delta ? JSON.stringify(patch.delta) : null)
          : row.deltaJson,
      errorMessage: patch.errorMessage !== undefined ? patch.errorMessage : row.errorMessage,
      updatedAt: Date.now(),
    })
    .where(eq(skillOptimizationSessions.id, row.id));
}

export async function persistSkillOptimizationArtifact(input: {
  runId: string;
  artifactType: SkillOptimizationArtifactType;
  content: string;
  contentHash: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const db = await getDb();
  const session = (
    await db
      .select()
      .from(skillOptimizationSessions)
      .where(eq(skillOptimizationSessions.runId, input.runId))
      .limit(1)
  )[0];

  if (!session) {
    return;
  }

  await db.insert(skillOptimizationArtifacts).values({
    sessionId: session.id,
    artifactType: input.artifactType,
    content: input.content,
    contentHash: input.contentHash,
    metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
    createdAt: Date.now(),
  });
}

function computeDelta(
  baselineTotals: RunAggregateScore | null,
  optimizedTotals: RunAggregateScore | null,
): SkillOptimizationSessionRecord["delta"] {
  if (!baselineTotals || !optimizedTotals) {
    return null;
  }

  return {
    passRateDelta: Number((optimizedTotals.passRate - baselineTotals.passRate).toFixed(4)),
    averageScoreDelta: Number((optimizedTotals.averageScore - baselineTotals.averageScore).toFixed(4)),
    passedTasksDelta: optimizedTotals.passedTasks - baselineTotals.passedTasks,
    failedTasksDelta: optimizedTotals.failedTasks - baselineTotals.failedTasks,
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
    .where(eq(taskEvaluations.runId, runId))
    .orderBy(asc(taskEvaluations.id));

  const recentEventRows = await db
    .select()
    .from(runEvents)
    .where(eq(runEvents.runId, runId))
    .orderBy(desc(runEvents.id))
    .limit(200);
  const runErrorRows = await db
    .select()
    .from(runErrors)
    .where(eq(runErrors.runId, runId))
    .orderBy(desc(runErrors.id))
    .limit(200);

  const [workers, taskExecutionRows, recentSteps] = await Promise.all([
    getRunWorkers(runId),
    listTaskExecutionSummaries(runId),
    getRecentStepTraces(runId, 240),
  ]);

  const evalMap = new Map<string, TaskEvaluationResult>();
  const baselineEvalMap = new Map<string, TaskEvaluationResult>();
  const optimizedEvalMap = new Map<string, TaskEvaluationResult>();
  for (const row of evaluationRows) {
    const scores = JSON.parse(row.criterionScoresJson) as TaskEvaluationResult["criterionScores"];
    const evaluation: TaskEvaluationResult = {
      taskId: row.taskId,
      pass: row.pass,
      qualityPass: row.qualityPass,
      validityPass: row.validityPass,
      validityBlockedReasons: JSON.parse(row.validityBlockedReasonsJson) as string[],
      failureClass: (row.failureClass as TaskEvaluationResult["failureClass"]) ?? null,
      rationale: row.rationale,
      confidence: row.confidence,
      criterionScores: scores,
    };
    const phase = (row.phase ?? "baseline") as TaskPhase;
    evalMap.set(row.taskId, evaluation);
    if (phase === "optimized") {
      optimizedEvalMap.set(row.taskId, evaluation);
      continue;
    }
    baselineEvalMap.set(row.taskId, evaluation);
  }

  const optimizationRow = (
    await db
      .select()
      .from(skillOptimizationSessions)
      .where(eq(skillOptimizationSessions.runId, runId))
      .limit(1)
  )[0];
  const optimization = defaultOptimizationResponse();

  if (optimizationRow) {
    optimization.status = optimizationRow.status as SkillOptimizationStatus;
    optimization.sourceSkillOrigin = optimizationRow.sourceSkillOrigin as "site_skill" | "none";
    optimization.baselineTotals = optimizationRow.baselineSummaryJson
      ? (JSON.parse(optimizationRow.baselineSummaryJson) as RunAggregateScore)
      : null;
    optimization.optimizedTotals = optimizationRow.optimizedSummaryJson
      ? (JSON.parse(optimizationRow.optimizedSummaryJson) as RunAggregateScore)
      : null;
    optimization.delta = optimizationRow.deltaJson
      ? (JSON.parse(optimizationRow.deltaJson) as RunDetailResponse["optimization"]["delta"])
      : computeDelta(optimization.baselineTotals, optimization.optimizedTotals);
    optimization.errorMessage = optimizationRow.errorMessage ?? null;

    const artifacts = await db
      .select()
      .from(skillOptimizationArtifacts)
      .where(eq(skillOptimizationArtifacts.sessionId, optimizationRow.id))
      .orderBy(asc(skillOptimizationArtifacts.id));

    for (const artifact of artifacts) {
      if (artifact.artifactType === "optimized_skill") {
        optimization.optimizedSkillMarkdown = artifact.content;
      }
      if (artifact.artifactType === "generation_output") {
        const parsed = artifact.metadataJson
          ? (JSON.parse(artifact.metadataJson) as { optimizationNotes?: string[] })
          : undefined;
        if (parsed?.optimizationNotes) {
          optimization.optimizationNotes = parsed.optimizationNotes;
        }
      }
    }
  }

  optimization.taskComparisons = taskRows.map((task) => {
    const baseline = baselineEvalMap.get(task.taskId) ?? null;
    const optimized = optimizedEvalMap.get(task.taskId) ?? null;
    return {
      taskId: task.taskId,
      baselinePass: baseline?.pass ?? null,
      optimizedPass: optimized?.pass ?? null,
      baselineScore: baseline ? baseline.criterionScores.average : null,
      optimizedScore: optimized ? optimized.criterionScores.average : null,
    };
  });

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
      evaluation: optimizedEvalMap.get(task.taskId) ?? baselineEvalMap.get(task.taskId) ?? evalMap.get(task.taskId) ?? null,
    })),
    workers,
    taskExecutions: taskExecutionRows,
    recentSteps,
    recentEvents: recentEventRows
      .map((row) => ({
        id: row.id,
        seq: row.seq,
        eventType: row.eventType,
        payload: JSON.parse(row.payloadJson) as RunEventPayload,
        createdAt: row.createdAt,
      }))
      .reverse(),
    runErrors: runErrorRows
      .map((row) => ({
        id: row.id,
        phase: row.phase,
        errorCode: row.errorCode,
        message: row.message,
        details: row.detailsJson
          ? (JSON.parse(row.detailsJson) as Record<string, unknown>)
          : null,
        createdAt: row.createdAt,
      }))
      .reverse(),
    optimization,
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

export async function deleteRun(runId: string): Promise<boolean> {
  const db = await getDb();
  const existing = await db
    .select({ id: runs.id })
    .from(runs)
    .where(eq(runs.id, runId))
    .limit(1);

  if (!existing[0]) {
    return false;
  }

  await db.transaction(async (tx) => {
    const executionRows = await tx
      .select({ id: taskExecutions.id })
      .from(taskExecutions)
      .where(eq(taskExecutions.runId, runId));
    const executionIds = executionRows.map((row) => row.id);

    if (executionIds.length > 0) {
      const stepRows = await tx
        .select({ id: taskSteps.id })
        .from(taskSteps)
        .where(inArray(taskSteps.taskExecutionId, executionIds));
      const stepIds = stepRows.map((row) => row.id);

      if (stepIds.length > 0) {
        await tx
          .delete(taskStepCitations)
          .where(inArray(taskStepCitations.taskStepId, stepIds));
      }

      await tx
        .delete(deterministicChecks)
        .where(inArray(deterministicChecks.taskExecutionId, executionIds));
      await tx
        .delete(taskAgentState)
        .where(inArray(taskAgentState.taskExecutionId, executionIds));
      await tx
        .delete(taskSteps)
        .where(inArray(taskSteps.taskExecutionId, executionIds));
      await tx
        .delete(taskExecutions)
        .where(eq(taskExecutions.runId, runId));
    }

    const sessionRows = await tx
      .select({ id: skillOptimizationSessions.id })
      .from(skillOptimizationSessions)
      .where(eq(skillOptimizationSessions.runId, runId));
    const sessionIds = sessionRows.map((row) => row.id);

    if (sessionIds.length > 0) {
      await tx
        .delete(skillOptimizationArtifacts)
        .where(inArray(skillOptimizationArtifacts.sessionId, sessionIds));
    }

    await tx
      .delete(skillOptimizationSessions)
      .where(eq(skillOptimizationSessions.runId, runId));
    await tx.delete(runWorkers).where(eq(runWorkers.runId, runId));
    await tx.delete(taskEvaluations).where(eq(taskEvaluations.runId, runId));
    await tx.delete(taskAttempts).where(eq(taskAttempts.runId, runId));
    await tx.delete(tasks).where(eq(tasks.runId, runId));
    await tx.delete(ingestionArtifacts).where(eq(ingestionArtifacts.runId, runId));
    await tx.delete(runErrors).where(eq(runErrors.runId, runId));
    await tx.delete(runEvents).where(eq(runEvents.runId, runId));
    await tx.delete(runs).where(eq(runs.id, runId));
  });

  return true;
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

export async function persistTaskAttempt(
  runId: string,
  attempt: AgentTaskAttempt,
  options?: { includeCostUpdate?: boolean },
): Promise<void> {
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

  if (options?.includeCostUpdate !== false) {
    await db
      .update(runs)
      .set({
        costEstimate: sql`${runs.costEstimate} + ${attempt.costEstimateUsd}`,
      })
      .where(eq(runs.id, runId));
  }
}

export async function incrementRunCost(runId: string, delta: number): Promise<void> {
  const db = await getDb();
  await db
    .update(runs)
    .set({
      costEstimate: sql`${runs.costEstimate} + ${delta}`,
    })
    .where(eq(runs.id, runId));
}

export async function persistTaskEvaluation(
  runId: string,
  evaluation: TaskEvaluationResult,
  judgeModel: string,
  phase: TaskPhase = "baseline",
): Promise<void> {
  const db = await getDb();

  await db.insert(taskEvaluations).values({
    runId,
    taskId: evaluation.taskId,
    phase,
    criterionScoresJson: JSON.stringify(evaluation.criterionScores),
    pass: evaluation.pass,
    qualityPass: evaluation.qualityPass,
    validityPass: evaluation.validityPass,
    validityBlockedReasonsJson: JSON.stringify(evaluation.validityBlockedReasons),
    failureClass: evaluation.failureClass,
    rationale: evaluation.rationale,
    judgeModel,
    confidence: evaluation.confidence,
    createdAt: Date.now(),
  });

  await updateTaskStatus(runId, evaluation.taskId, evaluation.pass ? "passed" : "failed");
}

export async function listTaskEvaluations(
  runId: string,
  phase?: TaskPhase,
): Promise<TaskEvaluationResult[]> {
  const db = await getDb();

  const rows = await db
    .select()
    .from(taskEvaluations)
    .where(
      phase
        ? and(eq(taskEvaluations.runId, runId), eq(taskEvaluations.phase, phase))
        : eq(taskEvaluations.runId, runId),
    );

  return rows.map((row) => ({
    taskId: row.taskId,
    pass: row.pass,
    qualityPass: row.qualityPass,
    validityPass: row.validityPass,
    validityBlockedReasons: JSON.parse(row.validityBlockedReasonsJson) as string[],
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

  const workers = await getRunWorkers(runId);
  await Promise.all(workers.map((worker) => updateWorkerStatus(worker.id, "done")));
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
