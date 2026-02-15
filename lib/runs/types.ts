import type { ModelConfig } from "@/lib/models/types";

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
}

export interface RunConfig {
  runModel: ModelConfig;
  judgeModel: ModelConfig;
  executionConcurrency: number;
  judgeConcurrency: number;
  tieBreakEnabled: boolean;
  budget: RunBudget;
}

export interface CreateRunRequest {
  docsUrl: string;
  taskCount?: number;
  executionConcurrency?: number;
  judgeConcurrency?: number;
  tieBreakEnabled?: boolean;
  maxTokensPerTask?: number;
  hardCostCapUsd?: number;
  runModel?: Partial<ModelConfig>;
  judgeModel?: Partial<ModelConfig>;
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
