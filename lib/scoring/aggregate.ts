import type { RunAggregateScore, TaskEvaluationResult } from "@/lib/scoring/types";

export function aggregateRunScores(evaluations: TaskEvaluationResult[]): RunAggregateScore {
  if (evaluations.length === 0) {
    return {
      totalTasks: 0,
      passedTasks: 0,
      failedTasks: 0,
      passRate: 0,
      averageScore: 0,
      failureBreakdown: {},
    };
  }

  const passedTasks = evaluations.filter((evaluation) => evaluation.pass).length;
  const totalTasks = evaluations.length;
  const failedTasks = totalTasks - passedTasks;

  const averageScore =
    evaluations.reduce((sum, evaluation) => sum + evaluation.criterionScores.average, 0) / totalTasks;

  const failureBreakdown = evaluations.reduce<Record<string, number>>((acc, evaluation) => {
    if (!evaluation.failureClass) {
      return acc;
    }

    acc[evaluation.failureClass] = (acc[evaluation.failureClass] ?? 0) + 1;
    return acc;
  }, {});

  return {
    totalTasks,
    passedTasks,
    failedTasks,
    passRate: totalTasks > 0 ? passedTasks / totalTasks : 0,
    averageScore,
    failureBreakdown,
  };
}
