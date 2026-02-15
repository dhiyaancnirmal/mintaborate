"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type TaskEvaluation = {
  taskId: string;
  pass: boolean;
  failureClass: string | null;
  rationale: string;
  criterionScores: {
    completeness: number;
    correctness: number;
    groundedness: number;
    actionability: number;
    average: number;
  };
  passBlocked?: boolean;
};

type TaskResult = {
  taskId: string;
  name: string;
  description: string;
  status: string;
  evaluation: TaskEvaluation | null;
};

type WorkerResult = {
  id: number;
  workerLabel: string;
  modelProvider: string;
  modelName: string;
  status: string;
};

type TaskExecution = {
  id: number;
  taskId: string;
  workerId: number | null;
  status: string;
  stepCount: number;
  tokensInTotal: number;
  tokensOutTotal: number;
  costEstimateTotal: number;
  stopReason: string | null;
};

type StepTrace = {
  id: number;
  taskExecutionId: number;
  stepIndex: number;
  phase: string;
  input: unknown;
  output: unknown;
  retrieval: unknown;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    latencyMs?: number;
    costEstimateUsd?: number;
  } | null;
  decision: {
    shouldContinue?: boolean;
    stopReason?: string;
    confidence?: number;
  } | null;
  citations: Array<{
    source: string;
    snippetHash?: string;
    excerpt: string;
  }>;
  createdAt: number;
};

type EventMessage = {
  id: number;
  seq: number;
  eventType: string;
  payload: {
    message?: string;
    data?: Record<string, unknown>;
  };
  createdAt: number;
};

type RunDetail = {
  run: {
    id: string;
    docsUrl: string;
    status: string;
    startedAt: number;
    endedAt: number | null;
    totals: {
      totalTasks: number;
      passedTasks: number;
      failedTasks: number;
      passRate: number;
      averageScore: number;
      failureBreakdown: Record<string, number>;
    } | null;
  };
  tasks: TaskResult[];
  workers: WorkerResult[];
  taskExecutions: TaskExecution[];
  recentSteps: StepTrace[];
  recentEvents: EventMessage[];
};

export default function RunReportClient({ runId }: { runId: string }) {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventMessage[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const closedRef = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
    if (!res.ok) {
      throw new Error("Failed to load run");
    }
    const data = (await res.json()) as RunDetail;
    setDetail(data);
    setEvents(data.recentEvents.slice(-200));
  }, [runId]);

  useEffect(() => {
    void load().catch((err) => {
      setError(err instanceof Error ? err.message : "Unknown error");
    });
  }, [load]);

  useEffect(() => {
    if (closedRef.current) {
      return;
    }

    const source = new EventSource(`/api/runs/${runId}/events`);

    source.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as EventMessage;
        setEvents((prev) => {
          const next = [...prev, parsed];
          return next.slice(-300);
        });
      } catch {
        // Ignore malformed event payloads.
      }

      void load().catch(() => {
        // Keep event stream alive even if periodic snapshot fetch fails.
      });
    };

    source.onerror = () => {
      source.close();
      closedRef.current = true;
    };

    return () => {
      source.close();
      closedRef.current = true;
    };
  }, [load, runId]);

  const scoreLabel = useMemo(() => {
    if (!detail?.run.totals) {
      return "Pending";
    }
    return `${detail.run.totals.passedTasks}/${detail.run.totals.totalTasks} passed`;
  }, [detail?.run.totals]);

  const activeWorkers = useMemo(
    () => detail?.workers.filter((worker) => worker.status === "running").length ?? 0,
    [detail?.workers],
  );

  const selectedTaskSteps = useMemo(() => {
    if (!detail) {
      return [];
    }

    const taskId = selectedTaskId ?? detail.tasks[0]?.taskId;
    if (!taskId) {
      return [];
    }

    const executionIds = detail.taskExecutions
      .filter((execution) => execution.taskId === taskId)
      .map((execution) => execution.id);

    return detail.recentSteps.filter((step) => executionIds.includes(step.taskExecutionId));
  }, [detail, selectedTaskId]);

  async function cancelRun() {
    try {
      const res = await fetch(`/api/runs/${runId}/cancel`, { method: "POST" });
      if (!res.ok) {
        throw new Error("Failed to cancel run");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel");
    }
  }

  if (error) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-zinc-400">Loading run...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <section className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Run {detail.run.id}</h1>
            <p className="mt-1 text-sm text-zinc-400">{detail.run.docsUrl}</p>
            <p className="mt-1 text-xs uppercase text-zinc-500">{detail.run.status}</p>
            <p className="mt-1 text-xs text-zinc-500">
              Workers active: {activeWorkers}/{detail.workers.length}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-zinc-400">Score</p>
            <p className="text-2xl font-semibold text-[#24E07E]">{scoreLabel}</p>
            {detail.run.status !== "completed" && detail.run.status !== "failed" &&
            detail.run.status !== "canceled" ? (
              <button
                type="button"
                onClick={cancelRun}
                className="mt-3 rounded-md border border-red-500 px-3 py-1 text-xs text-red-300"
              >
                Cancel Run
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Workers</h2>
        <div className="grid gap-2 md:grid-cols-2">
          {detail.workers.map((worker) => (
            <div key={worker.id} className="rounded-lg border border-zinc-800 p-3 text-xs">
              <p className="font-medium">{worker.workerLabel}</p>
              <p className="text-zinc-400">{worker.modelProvider}:{worker.modelName}</p>
              <p className="mt-1 uppercase text-zinc-500">{worker.status}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Tasks</h2>
        {detail.tasks.length === 0 ? (
          <p className="text-sm text-zinc-400">Tasks are still being generated.</p>
        ) : (
          <ul className="space-y-2">
            {detail.tasks.map((task) => {
              const execution = detail.taskExecutions.find((item) => item.taskId === task.taskId);

              return (
                <li
                  key={task.taskId}
                  className="rounded-lg border border-zinc-800 p-4"
                  onClick={() => setSelectedTaskId(task.taskId)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{task.name}</p>
                    <span className="text-xs uppercase text-zinc-400">{task.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{task.description}</p>
                  {execution ? (
                    <p className="mt-1 text-xs text-zinc-500">
                      Worker #{execution.workerId ?? "-"} | Steps {execution.stepCount} | Tokens {execution.tokensInTotal + execution.tokensOutTotal} | Stop {execution.stopReason ?? "-"}
                    </p>
                  ) : null}
                  {task.evaluation ? (
                    <div className="mt-2 space-y-1 text-xs text-zinc-300">
                      <p>
                        Avg score: {task.evaluation.criterionScores.average.toFixed(1)} | Pass: {" "}
                        {task.evaluation.pass ? "yes" : "no"}
                      </p>
                      <p className="text-zinc-400">{task.evaluation.rationale}</p>
                      {task.evaluation.passBlocked ? (
                        <p className="text-amber-300">Pass blocked by deterministic checks</p>
                      ) : null}
                      {task.evaluation.failureClass ? (
                        <p className="text-amber-300">Failure: {task.evaluation.failureClass}</p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Selected Task Trace</h2>
        <div className="max-h-80 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
          {selectedTaskSteps.length === 0 ? (
            <p className="text-xs text-zinc-500">No step trace yet.</p>
          ) : (
            <ul className="space-y-2">
              {selectedTaskSteps.map((step) => (
                <li key={step.id} className="rounded border border-zinc-800 p-2 text-xs">
                  <p className="font-medium uppercase text-zinc-300">
                    Step {step.stepIndex} · {step.phase}
                  </p>
                  <p className="text-zinc-500">Execution #{step.taskExecutionId}</p>
                  {step.usage ? (
                    <p className="text-zinc-500">
                      Tokens: {(step.usage.inputTokens ?? 0) + (step.usage.outputTokens ?? 0)} | Cost: ${(step.usage.costEstimateUsd ?? 0).toFixed(5)}
                    </p>
                  ) : null}
                  {step.citations.length > 0 ? (
                    <p className="text-zinc-500">
                      Citations: {step.citations.map((citation) => citation.source).join(", ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Event Stream</h2>
        <div className="max-h-72 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
          {events.length === 0 ? (
            <p className="text-xs text-zinc-500">No events yet.</p>
          ) : (
            <ul className="space-y-1">
              {events.map((event) => (
                <li key={event.id} className="text-xs text-zinc-300">
                  [{event.eventType}] {event.payload?.message ?? ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
