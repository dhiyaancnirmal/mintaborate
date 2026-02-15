import { ingestDocumentation } from "@/lib/ingestion/fetchers";
import { generateTasks } from "@/lib/tasks/generator";
import { buildCorpusChunks, retrieveTopChunksWithScores } from "@/lib/execution/retrieval";
import {
  runActStep,
  runPlanningStep,
  runReflectStep,
  type AgentTaskAttempt,
  type EvidenceCitation,
} from "@/lib/execution/agent-runner";
import { judgeTaskAttempt } from "@/lib/evaluation/judge";
import { aggregateRunScores } from "@/lib/scoring/aggregate";
import type { TaskEvaluationResult } from "@/lib/scoring/types";
import { evaluateDeterministicGuards } from "@/lib/evaluation/deterministic-checks";
import { appendRunEvent } from "@/lib/runs/events";
import {
  createTaskExecution,
  ensureRunWorkers,
  finalizeRun,
  finalizeTaskExecution,
  getRun,
  incrementRunCost,
  isRunCanceled,
  persistDeterministicChecks,
  persistIngestionArtifacts,
  persistRunError,
  persistTaskAttempt,
  persistTaskEvaluation,
  persistTaskStep,
  persistTaskStepCitations,
  persistTasks,
  updateRunStatus,
  updateTaskExecutionProgress,
  updateTaskStatus,
  updateWorkerStatus,
  upsertTaskAgentState,
} from "@/lib/runs/service";
import type { AgentMemoryState, PersistedWorker, TaskStopReason } from "@/lib/runs/types";
import type { GeneratedTask } from "@/lib/tasks/types";

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

function initializeMemory(task: GeneratedTask, maxSteps: number, maxTokens: number, hardCostCapUsd: number): AgentMemoryState {
  return {
    currentStep: 0,
    goal: {
      name: task.name,
      description: task.description,
      expectedSignals: task.expectedSignals,
    },
    plan: task.expectedSignals.map((signal) => ({ item: `Cover: ${signal}`, done: false })),
    visitedSources: [],
    facts: [],
    stepSummaries: [],
    remainingBudget: {
      steps: maxSteps,
      maxTokensPerTask: maxTokens,
      hardCostCapUsd,
    },
  };
}

function dedupe<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function toTaskAttempt(input: {
  task: GeneratedTask;
  finalAnswer: string;
  stepOutputs: string[];
  citations: EvidenceCitation[];
  tokensIn: number;
  tokensOut: number;
  cost: number;
}): AgentTaskAttempt {
  return {
    taskId: input.task.taskId,
    answer: input.finalAnswer,
    steps: input.stepOutputs.length > 0 ? input.stepOutputs : [input.finalAnswer],
    citations: input.citations,
    rawOutput: input.finalAnswer,
    usage: {
      inputTokens: input.tokensIn,
      outputTokens: input.tokensOut,
    },
    latencyMs: 0,
    costEstimateUsd: input.cost,
  };
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

async function executeTaskOnWorker(input: {
  runId: string;
  worker: PersistedWorker;
  task: GeneratedTask;
  chunks: ReturnType<typeof buildCorpusChunks>;
}): Promise<TaskEvaluationResult | null> {
  const run = await getRun(input.runId);
  if (!run) {
    return null;
  }

  await updateTaskStatus(input.runId, input.task.taskId, "running");

  const taskExecutionId = await createTaskExecution({
    runId: input.runId,
    taskId: input.task.taskId,
    workerId: input.worker.id,
  });

  let memory = initializeMemory(
    input.task,
    run.config.budget.maxStepsPerTask,
    run.config.budget.maxTokensPerTask,
    run.config.budget.hardCostCapUsd,
  );

  await upsertTaskAgentState({
    taskExecutionId,
    state: memory,
  });

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;
  let finalAnswer = "";
  const stepOutputs: string[] = [];
  const citations: EvidenceCitation[] = [];
  let stopReason: TaskStopReason = "step_limit";

  try {
    for (let stepIndex = 1; stepIndex <= run.config.budget.maxStepsPerTask; stepIndex += 1) {
      if (await isRunCanceled(input.runId)) {
        stopReason = "cancelled";
        await updateTaskStatus(input.runId, input.task.taskId, "skipped");
        await finalizeTaskExecution({
          taskExecutionId,
          status: "skipped",
          stopReason,
        });
        await appendRunEvent(input.runId, "task.execution.completed", {
          runId: input.runId,
          phase: "execution",
          message: `Task skipped due to cancellation: ${input.task.name}`,
          data: {
            taskId: input.task.taskId,
            workerId: input.worker.id,
            stopReason,
          },
        });
        return null;
      }

      const refreshedRun = await getRun(input.runId);
      if (!refreshedRun) {
        return null;
      }

      if (refreshedRun.costEstimate >= refreshedRun.config.budget.hardCostCapUsd) {
        stopReason = "cost_limit";
        await updateTaskStatus(input.runId, input.task.taskId, "skipped");
        await finalizeTaskExecution({
          taskExecutionId,
          status: "skipped",
          stopReason,
        });
        await appendRunEvent(input.runId, "task.execution.completed", {
          runId: input.runId,
          phase: "execution",
          message: `Task skipped due to cost cap: ${input.task.name}`,
          data: {
            taskId: input.task.taskId,
            workerId: input.worker.id,
            stopReason,
          },
        });
        return null;
      }

      const retrievalQuery = [
        input.task.name,
        input.task.description,
        input.task.expectedSignals.join(" "),
        memory.plan.filter((item) => !item.done).map((item) => item.item).join(" "),
        memory.stepSummaries.slice(-2).join(" "),
        memory.facts.slice(-5).map((fact) => fact.fact).join(" "),
      ].join("\n");

      const scoredChunks = retrieveTopChunksWithScores(input.chunks, retrievalQuery, 8);
      const retrievedChunks = scoredChunks.map((entry) => entry.chunk);

      await appendRunEvent(input.runId, "task.step.retrieved", {
        runId: input.runId,
        phase: "execution",
        message: `Retrieved context for task ${input.task.name} step ${stepIndex}`,
        data: {
          workerId: input.worker.id,
          taskId: input.task.taskId,
          stepIndex,
          sources: retrievedChunks.map((chunk) => chunk.sourceUrl),
        },
      });

      const retrieveStepId = await persistTaskStep({
        taskExecutionId,
        stepIndex,
        phase: "retrieve",
        input: {
          query: retrievalQuery,
        },
        output: {
          selectedChunks: scoredChunks.map((entry) => ({
            sourceUrl: entry.chunk.sourceUrl,
            snippetHash: entry.chunk.snippetHash,
            score: Number(entry.score.toFixed(4)),
          })),
        },
        retrieval: {
          topK: scoredChunks.length,
        },
      });

      await appendRunEvent(input.runId, "task.step.created", {
        runId: input.runId,
        phase: "execution",
        message: `Retrieve step persisted for task ${input.task.name}`,
        data: {
          workerId: input.worker.id,
          taskId: input.task.taskId,
          stepIndex,
          phase: "retrieve",
          stepId: retrieveStepId,
        },
      });

      const planResult = await runPlanningStep({
        runModel: input.worker.modelConfig,
        task: input.task,
        memory,
        chunks: retrievedChunks,
      });

      const planStepId = await persistTaskStep({
        taskExecutionId,
        stepIndex,
        phase: "plan",
        input: {
          planBefore: memory.plan,
        },
        output: {
          parsed: planResult.parsed,
          raw: planResult.text,
        },
        usage: {
          inputTokens: planResult.usage.inputTokens,
          outputTokens: planResult.usage.outputTokens,
          latencyMs: planResult.latencyMs,
          costEstimateUsd: planResult.costEstimateUsd,
        },
      });

      await appendRunEvent(input.runId, "task.step.created", {
        runId: input.runId,
        phase: "execution",
        message: `Plan step persisted for task ${input.task.name}`,
        data: {
          workerId: input.worker.id,
          taskId: input.task.taskId,
          stepIndex,
          phase: "plan",
          stepId: planStepId,
        },
      });

      const actResult = await runActStep({
        runModel: input.worker.modelConfig,
        task: input.task,
        memory,
        chunks: retrievedChunks,
        stepIndex,
      });

      const actStepId = await persistTaskStep({
        taskExecutionId,
        stepIndex,
        phase: "act",
        input: {
          expectedSignals: input.task.expectedSignals,
          plan: memory.plan,
        },
        output: {
          parsed: actResult.parsed,
          raw: actResult.text,
        },
        retrieval: {
          chunks: scoredChunks.map((entry) => ({
            sourceUrl: entry.chunk.sourceUrl,
            snippetHash: entry.chunk.snippetHash,
            score: Number(entry.score.toFixed(4)),
          })),
        },
        usage: {
          inputTokens: actResult.usage.inputTokens,
          outputTokens: actResult.usage.outputTokens,
          latencyMs: actResult.latencyMs,
          costEstimateUsd: actResult.costEstimateUsd,
        },
      });

      await persistTaskStepCitations(actStepId, actResult.parsed.citations);

      const reflectResult = await runReflectStep({
        runModel: input.worker.modelConfig,
        task: input.task,
        memory,
        latestActOutput: actResult.parsed,
      });

      const reflectStepId = await persistTaskStep({
        taskExecutionId,
        stepIndex,
        phase: "reflect",
        input: {
          memory,
        },
        output: {
          parsed: reflectResult.parsed,
          raw: reflectResult.text,
        },
        decision: {
          shouldContinue: reflectResult.parsed.shouldContinue,
          stopReason: reflectResult.parsed.stopReason,
          confidence: reflectResult.parsed.confidence,
        },
        usage: {
          inputTokens: reflectResult.usage.inputTokens,
          outputTokens: reflectResult.usage.outputTokens,
          latencyMs: reflectResult.latencyMs,
          costEstimateUsd: reflectResult.costEstimateUsd,
        },
      });

      const phaseInputTokens =
        planResult.usage.inputTokens + actResult.usage.inputTokens + reflectResult.usage.inputTokens;
      const phaseOutputTokens =
        planResult.usage.outputTokens + actResult.usage.outputTokens + reflectResult.usage.outputTokens;
      const phaseCost =
        planResult.costEstimateUsd + actResult.costEstimateUsd + reflectResult.costEstimateUsd;

      totalInputTokens += phaseInputTokens;
      totalOutputTokens += phaseOutputTokens;
      totalCost += phaseCost;

      await incrementRunCost(input.runId, phaseCost);

      await updateTaskExecutionProgress({
        taskExecutionId,
        stepCountDelta: 1,
        tokensInDelta: phaseInputTokens,
        tokensOutDelta: phaseOutputTokens,
        costDelta: phaseCost,
      });

      finalAnswer = actResult.parsed.answer;
      stepOutputs.push(actResult.parsed.stepOutput);

      citations.push(...actResult.parsed.citations);

      const nextPlan = dedupe([
        ...planResult.parsed.planItems,
        ...reflectResult.parsed.planUpdates,
      ]).map((item) => ({ item, done: false }));

      const latestFacts = dedupe(actResult.parsed.discoveredFacts)
        .slice(0, 8)
        .map((fact) => ({
          fact,
          citations: actResult.parsed.citations.map((citation) => citation.source),
        }));

      memory = {
        ...memory,
        currentStep: stepIndex,
        plan: nextPlan.length > 0 ? nextPlan : memory.plan,
        visitedSources: dedupe([
          ...memory.visitedSources,
          ...retrievedChunks.map((chunk) => `${chunk.sourceUrl}#${chunk.snippetHash}`),
        ]),
        facts: dedupe([...memory.facts.map((fact) => JSON.stringify(fact)), ...latestFacts.map((fact) => JSON.stringify(fact))])
          .map((fact) => JSON.parse(fact) as AgentMemoryState["facts"][number])
          .slice(-20),
        stepSummaries: [...memory.stepSummaries, reflectResult.parsed.summary].slice(-12),
        remainingBudget: {
          ...memory.remainingBudget,
          steps: Math.max(0, run.config.budget.maxStepsPerTask - stepIndex),
          maxTokensPerTask: Math.max(0, run.config.budget.maxTokensPerTask - totalInputTokens - totalOutputTokens),
          hardCostCapUsd: Math.max(0, run.config.budget.hardCostCapUsd - totalCost),
        },
      };

      await upsertTaskAgentState({
        taskExecutionId,
        state: memory,
      });

      await appendRunEvent(input.runId, "task.step.created", {
        runId: input.runId,
        phase: "execution",
        message: `Reflect step persisted for task ${input.task.name}`,
        data: {
          workerId: input.worker.id,
          taskId: input.task.taskId,
          stepIndex,
          phase: "reflect",
          stepId: reflectStepId,
          shouldContinue: reflectResult.parsed.shouldContinue,
        },
      });

      if (totalInputTokens + totalOutputTokens >= run.config.budget.maxTokensPerTask) {
        stopReason = "token_limit";
        break;
      }

      if (actResult.parsed.done) {
        stopReason = "completed";
        break;
      }

      if (!reflectResult.parsed.shouldContinue) {
        stopReason = reflectResult.parsed.stopReason?.toLowerCase().includes("error")
          ? "error"
          : "completed";
        break;
      }
    }

    const finalCitations = dedupe(
      citations.map((citation) => JSON.stringify(citation)),
    )
      .map((value) => JSON.parse(value) as EvidenceCitation)
      .slice(0, 16);

    if (!finalAnswer) {
      finalAnswer = memory.stepSummaries.at(-1) ?? "No valid answer generated.";
    }

    const attempt = toTaskAttempt({
      task: input.task,
      finalAnswer,
      stepOutputs,
      citations: finalCitations,
      tokensIn: totalInputTokens,
      tokensOut: totalOutputTokens,
      cost: totalCost,
    });

    await persistTaskAttempt(input.runId, attempt, { includeCostUpdate: false });

    const deterministicGuards = evaluateDeterministicGuards({
      task: input.task,
      attempt,
      stepCount: stepOutputs.length,
      stopReason,
    });

    await persistDeterministicChecks({
      taskExecutionId,
      checks: deterministicGuards.checks,
    });

    await updateRunStatus(input.runId, "evaluating");

    const evaluation = await judgeTaskAttempt({
      judgeModel: run.config.judgeModel,
      task: input.task,
      attempt,
      chunks: input.chunks,
      tieBreakEnabled: run.config.tieBreakEnabled,
      deterministicGuards,
    });

    await persistTaskEvaluation(input.runId, evaluation, run.config.judgeModel.model);
    await finalizeTaskExecution({
      taskExecutionId,
      status: evaluation.pass ? "passed" : "failed",
      stopReason,
    });

    await appendRunEvent(input.runId, "task.execution.completed", {
      runId: input.runId,
      phase: "evaluation",
      message: `Task completed: ${input.task.name}`,
      data: {
        workerId: input.worker.id,
        taskId: input.task.taskId,
        taskExecutionId,
        pass: evaluation.pass,
        averageScore: evaluation.criterionScores.average,
        stopReason,
      },
    });

    return evaluation;
  } catch (error) {
    const message = asErrorMessage(error);

    const fallbackEvaluation: TaskEvaluationResult = {
      taskId: input.task.taskId,
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
      deterministicChecks: [],
      passBlocked: true,
    };

    await finalizeTaskExecution({
      taskExecutionId,
      status: "error",
      stopReason: "error",
    });

    await persistTaskEvaluation(input.runId, fallbackEvaluation, run.config.judgeModel.model);

    await persistRunError({
      runId: input.runId,
      phase: "execution",
      errorCode: "TASK_EXECUTION_ERROR",
      message,
      details: {
        taskId: input.task.taskId,
        workerId: input.worker.id,
      },
    });

    await appendRunEvent(input.runId, "task.error", {
      runId: input.runId,
      phase: "execution",
      message: `Task failed: ${input.task.name}`,
      data: {
        taskId: input.task.taskId,
        workerId: input.worker.id,
        error: message,
      },
    });

    return fallbackEvaluation;
  }
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

    const tasks = generateTasks({
      docsUrl: ingestion.normalizedDocsUrl,
      llmsText: ingestion.llmsText,
      llmsFullText: ingestion.llmsFullText,
      skillText: ingestion.skillText,
      maxTasks: run.config.budget.maxTasks,
      userDefinedTasks: run.config.userDefinedTasks,
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

    const workers = await ensureRunWorkers(runId, run.config);

    await appendRunEvent(runId, "run.workers_ready", {
      runId,
      phase: "execution",
      message: "Workers initialized.",
      data: {
        workerCount: workers.length,
        workers: workers.map((worker) => ({
          id: worker.id,
          workerLabel: worker.workerLabel,
          model: `${worker.modelProvider}:${worker.modelName}`,
        })),
      },
    });

    await updateRunStatus(runId, "running");

    const chunks = buildCorpusChunks(
      ingestion.artifacts.map((artifact) => ({
        artifactType: artifact.artifactType,
        sourceUrl: artifact.sourceUrl,
        content: artifact.content,
      })),
    );

    const taskQueue = [...tasks];

    const workerPromises = workers.map(async (worker) => {
      await updateWorkerStatus(worker.id, "idle");

      while (taskQueue.length > 0) {
        const task = taskQueue.shift();
        if (!task) {
          break;
        }

        if (await isRunCanceled(runId)) {
          break;
        }

        await updateWorkerStatus(worker.id, "running");

        await appendRunEvent(runId, "worker.started", {
          runId,
          phase: "execution",
          message: `${worker.workerLabel} started task ${task.name}`,
          data: {
            workerId: worker.id,
            workerLabel: worker.workerLabel,
            taskId: task.taskId,
          },
        });

        const evaluation = await executeTaskOnWorker({
          runId,
          worker,
          task,
          chunks,
        });

        if (evaluation) {
          evaluations.push(evaluation);
        }

        if (await isRunCanceled(runId)) {
          break;
        }

        await updateWorkerStatus(worker.id, "idle");
      }

      await updateWorkerStatus(worker.id, "done");

      await appendRunEvent(runId, "worker.done", {
        runId,
        phase: "execution",
        message: `${worker.workerLabel} finished assigned tasks.`,
        data: {
          workerId: worker.id,
          workerLabel: worker.workerLabel,
        },
      });
    });

    await Promise.all(workerPromises);

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
