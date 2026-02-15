import type { ModelConfig, ModelProvider } from "@/lib/models/types";

export type RunStatus =
  | "queued"
  | "ingesting"
  | "generating_tasks"
  | "running"
  | "evaluating"
  | "completed"
  | "failed"
  | "canceled";

export type TaskStatus =
  | "pending"
  | "running"
  | "passed"
  | "failed"
  | "error"
  | "skipped";

export type WorkerStatus = "idle" | "running" | "paused" | "done" | "error";

export type TaskExecutionStatus = "pending" | "running" | "passed" | "failed" | "error" | "skipped";

export type TaskStopReason =
  | "completed"
  | "step_limit"
  | "token_limit"
  | "cost_limit"
  | "cancelled"
  | "error";

export type AgentStepPhase = "plan" | "retrieve" | "act" | "reflect" | "terminate";

export type FailureClass =
  | "missing_content"
  | "insufficient_detail"
  | "ambiguous_instructions"
  | "outdated_content"
  | "poor_structure"
  | "missing_examples"
  | "broken_links";

export type TaskCategory =
  | "getting-started"
  | "authentication"
  | "core-feature"
  | "integration"
  | "deployment"
  | "troubleshooting";

export type TaskDifficulty = "easy" | "medium" | "hard";

export interface RunBudget {
  maxTasks: number;
  maxTokensPerTask: number;
  hardCostCapUsd: number;
  maxStepsPerTask: number;
}

export interface WorkerAssignmentInput {
  provider: ModelProvider;
  model: string;
  quantity: number;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  retries?: number;
  baseUrl?: string;
  apiKeyEnvVar?: string;
}

export interface WorkerConfig {
  workerCount: number;
  assignments: WorkerAssignmentInput[];
}

export interface UserDefinedTask {
  name: string;
  description: string;
  category?: TaskCategory;
  difficulty?: TaskDifficulty;
  expectedSignals?: string[];
}

export interface RunConfig {
  runModel: ModelConfig;
  judgeModel: ModelConfig;
  executionConcurrency: number;
  judgeConcurrency: number;
  tieBreakEnabled: boolean;
  budget: RunBudget;
  workerConfig: WorkerConfig;
  userDefinedTasks: UserDefinedTask[];
}

export interface CreateRunRequest {
  docsUrl: string;
  taskCount?: number;
  executionConcurrency?: number;
  judgeConcurrency?: number;
  tieBreakEnabled?: boolean;
  maxTokensPerTask?: number;
  hardCostCapUsd?: number;
  maxStepsPerTask?: number;
  runModel?: Partial<ModelConfig>;
  judgeModel?: Partial<ModelConfig>;
  tasks?: UserDefinedTask[];
  workers?: {
    workerCount?: number;
    assignments?: WorkerAssignmentInput[];
  };
}

export interface RunTotals {
  totalTasks: number;
  passedTasks: number;
  failedTasks: number;
  passRate: number;
  averageScore: number;
  failureBreakdown: Record<string, number>;
}

export interface RunEventPayload {
  runId: string;
  phase:
    | "run"
    | "ingestion"
    | "task_generation"
    | "execution"
    | "evaluation"
    | "scoring"
    | "system";
  message: string;
  data?: Record<string, unknown>;
}

export interface PersistedWorker {
  id: number;
  runId: string;
  workerLabel: string;
  modelProvider: ModelProvider;
  modelName: string;
  modelConfig: ModelConfig;
  status: WorkerStatus;
  startedAt: number;
  endedAt: number | null;
}

export interface TaskExecutionSummary {
  id: number;
  runId: string;
  taskId: string;
  workerId: number | null;
  status: TaskExecutionStatus;
  stepCount: number;
  tokensInTotal: number;
  tokensOutTotal: number;
  costEstimateTotal: number;
  stopReason: TaskStopReason | null;
  startedAt: number;
  endedAt: number | null;
}

export interface AgentMemoryState {
  currentStep: number;
  goal: {
    name: string;
    description: string;
    expectedSignals: string[];
  };
  plan: Array<{ item: string; done: boolean }>;
  visitedSources: string[];
  facts: Array<{ fact: string; citations: string[] }>;
  stepSummaries: string[];
  remainingBudget: {
    steps: number;
    maxTokensPerTask: number;
    hardCostCapUsd: number;
  };
}
