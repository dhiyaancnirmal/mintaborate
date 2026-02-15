import type { FailureClass } from "@/lib/runs/types";

export interface CriterionScores {
  completeness: number;
  correctness: number;
  groundedness: number;
  actionability: number;
  average: number;
}

export interface TaskEvaluationResult {
  taskId: string;
  pass: boolean;
  failureClass: FailureClass | null;
  rationale: string;
  confidence: number;
  criterionScores: CriterionScores;
  deterministicChecks?: Array<{
    name: string;
    passed: boolean;
    scoreDelta: number;
    details?: Record<string, unknown>;
  }>;
  passBlocked?: boolean;
}

export interface RunAggregateScore {
  totalTasks: number;
  passedTasks: number;
  failedTasks: number;
  passRate: number;
  averageScore: number;
  failureBreakdown: Record<string, number>;
}
