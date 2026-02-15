import pLimit from "p-limit";
import { ingestDocumentation } from "@/lib/ingestion/fetchers";
import { generateTasks } from "@/lib/tasks/generator";
import { buildCorpusChunks, retrieveTopChunks } from "@/lib/execution/retrieval";
import { runAgentTask } from "@/lib/execution/agent-runner";
import { judgeTaskAttempt } from "@/lib/evaluation/judge";
import { aggregateRunScores } from "@/lib/scoring/aggregate";
import type { TaskEvaluationResult } from "@/lib/scoring/types";
import {
  appendRunEvent,
} from "@/lib/runs/events";
import {
  finalizeRun,
  getRun,
  isRunCanceled,
  persistIngestionArtifacts,
  persistRunError,
  persistTaskAttempt,
  persistTaskEvaluation,
  persistTasks,
  updateRunStatus,
  updateTaskStatus,
} from "@/lib/runs/service";

const activeRuns = new Set<string>();

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

export function startRunInBackground(runId: string): void {
  if (activeRuns.has(runId)) {
    return;
  }

  activeRuns.add(runId);

  void executeRun(runId).finally(() => {
    activeRuns.delete(runId);
  });
}

async function executeRun(runId: string): Promise<void> {
  const run = await getRun(runId);

  if (!run) {
    return;
  }

  const evaluations: TaskEvaluationResult[] = [];

  try {
    await updateRunStatus(runId, "ingesting");
    await appendRunEvent(runId, "run.ingesting", {
      runId,
      phase: "ingestion",
      message: "Starting documentation ingestion.",
    });

    const ingestion = await ingestDocumentation(run.docsUrl, {
      pageFetchLimit: Math.min(40, run.config.budget.maxTasks * 3),
    });

    await persistIngestionArtifacts(runId, ingestion.artifacts);

    await appendRunEvent(runId, "run.ingestion_complete", {
      runId,
      phase: "ingestion",
      message: "Documentation ingestion complete.",
      data: {
        artifactCount: ingestion.artifacts.length,
        discoveredPages: ingestion.discoveredPages.length,
      },
    });

    if (await isRunCanceled(runId)) {
      await finalizeRun(runId, "canceled", null);
      return;
    }

    await updateRunStatus(runId, "generating_tasks");
    await appendRunEvent(runId, "run.generating_tasks", {
      runId,
      phase: "task_generation",
      message: "Generating task set.",
    });

    const tasks = generateTasks({
      docsUrl: ingestion.normalizedDocsUrl,
      llmsText: ingestion.llmsText,
      llmsFullText: ingestion.llmsFullText,
      skillText: ingestion.skillText,
      maxTasks: run.config.budget.maxTasks,
    });

    await persistTasks(runId, tasks);

    await appendRunEvent(runId, "run.tasks_generated", {
      runId,
      phase: "task_generation",
      message: "Task generation complete.",
      data: { taskCount: tasks.length },
    });

    if (await isRunCanceled(runId)) {
      await finalizeRun(runId, "canceled", null);
      return;
    }

    await updateRunStatus(runId, "running");
    await appendRunEvent(runId, "run.executing", {
      runId,
      phase: "execution",
      message: "Task execution started.",
    });

    const chunks = buildCorpusChunks(
      ingestion.artifacts.map((artifact) => ({
        artifactType: artifact.artifactType,
        sourceUrl: artifact.sourceUrl,
        content: artifact.content,
      })),
    );

    const executeLimiter = pLimit(run.config.executionConcurrency);
    const judgeLimiter = pLimit(run.config.judgeConcurrency);

    let budgetExceeded = false;

    await Promise.allSettled(
      tasks.map((task) =>
        executeLimiter(async () => {
          if (await isRunCanceled(runId)) {
            await updateTaskStatus(runId, task.taskId, "skipped");
            return;
          }

          if (budgetExceeded) {
            await updateTaskStatus(runId, task.taskId, "skipped");
            return;
          }

          const refreshedRun = await getRun(runId);
          if (!refreshedRun) {
            return;
          }

          if (refreshedRun.costEstimate >= refreshedRun.config.budget.hardCostCapUsd) {
            budgetExceeded = true;
            await updateTaskStatus(runId, task.taskId, "skipped");
            await appendRunEvent(runId, "run.budget_exceeded", {
              runId,
              phase: "system",
              message: "Hard cost cap exceeded. Remaining tasks will be skipped.",
            });
            return;
          }

          await updateTaskStatus(runId, task.taskId, "running");
          await appendRunEvent(runId, "task.started", {
            runId,
            phase: "execution",
            message: `Task started: ${task.name}`,
            data: { taskId: task.taskId },
          });

          try {
            const relevantChunks = retrieveTopChunks(
              chunks,
              `${task.name}\n${task.description}\n${task.expectedSignals.join(" ")}`,
              8,
            );

            const attempt = await runAgentTask({
              runModel: refreshedRun.config.runModel,
              task,
              chunks: relevantChunks,
            });

            await persistTaskAttempt(runId, attempt);

            await updateRunStatus(runId, "evaluating");

            const evaluation = await judgeLimiter(() =>
              judgeTaskAttempt({
                judgeModel: refreshedRun.config.judgeModel,
                task,
                attempt,
                chunks: relevantChunks,
                tieBreakEnabled: refreshedRun.config.tieBreakEnabled,
              }),
            );

            await persistTaskEvaluation(runId, evaluation, refreshedRun.config.judgeModel.model);
            evaluations.push(evaluation);

            await appendRunEvent(runId, "task.completed", {
              runId,
              phase: "evaluation",
              message: `Task completed: ${task.name}`,
              data: {
                taskId: task.taskId,
                pass: evaluation.pass,
                averageScore: evaluation.criterionScores.average,
              },
            });

            await updateRunStatus(runId, "running");
          } catch (error) {
            const message = asErrorMessage(error);

            const fallbackEvaluation: TaskEvaluationResult = {
              taskId: task.taskId,
              pass: false,
              failureClass: "poor_structure",
              rationale: `Execution error: ${message}`,
              confidence: 0,
              criterionScores: {
                completeness: 0,
                correctness: 0,
                groundedness: 0,
                actionability: 0,
                average: 0,
              },
            };

            evaluations.push(fallbackEvaluation);
            await persistTaskEvaluation(runId, fallbackEvaluation, refreshedRun.config.judgeModel.model);

            await persistRunError({
              runId,
              phase: "execution",
              errorCode: "TASK_EXECUTION_ERROR",
              message,
              details: {
                taskId: task.taskId,
                taskName: task.name,
              },
            });

            await appendRunEvent(runId, "task.error", {
              runId,
              phase: "execution",
              message: `Task failed: ${task.name}`,
              data: {
                taskId: task.taskId,
                error: message,
              },
            });
          }
        }),
      ),
    );

    if (await isRunCanceled(runId)) {
      const partialTotals = aggregateRunScores(evaluations);
      await finalizeRun(runId, "canceled", partialTotals);
      await appendRunEvent(runId, "run.canceled", {
        runId,
        phase: "run",
        message: "Run canceled.",
      });
      return;
    }

    await updateRunStatus(runId, "evaluating");

    const totals = aggregateRunScores(evaluations);

    await updateRunStatus(runId, "completed");
    await finalizeRun(runId, "completed", totals);

    await appendRunEvent(runId, "run.completed", {
      runId,
      phase: "scoring",
      message: "Run completed.",
      data: {
        totalTasks: totals.totalTasks,
        passedTasks: totals.passedTasks,
        failedTasks: totals.failedTasks,
        passRate: totals.passRate,
        averageScore: totals.averageScore,
      },
    });
  } catch (error) {
    const message = asErrorMessage(error);

    await persistRunError({
      runId,
      phase: "system",
      errorCode: "RUN_FATAL",
      message,
    });

    await finalizeRun(runId, "failed", null);

    await appendRunEvent(runId, "run.failed", {
      runId,
      phase: "system",
      message: `Run failed: ${message}`,
    });
  }
}
