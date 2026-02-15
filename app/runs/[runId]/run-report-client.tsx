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
};

type TaskResult = {
  taskId: string;
  name: string;
  status: string;
  evaluation: TaskEvaluation | null;
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
  recentEvents: Array<{ seq: number; eventType: string; payload: unknown; createdAt: number }>;
};

export default function RunReportClient({ runId }: { runId: string }) {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const closedRef = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
    if (!res.ok) {
      throw new Error("Failed to load run");
    }
    const data = (await res.json()) as RunDetail;
    setDetail(data);
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
      setEvents((prev) => {
        const next = [...prev, event.data];
        return next.slice(-150);
      });
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
      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-zinc-400">Loading run...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <section className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Run {detail.run.id}</h1>
            <p className="mt-1 text-sm text-zinc-400">{detail.run.docsUrl}</p>
            <p className="mt-1 text-xs uppercase text-zinc-500">{detail.run.status}</p>
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
        <h2 className="text-lg font-medium">Tasks</h2>
        {detail.tasks.length === 0 ? (
          <p className="text-sm text-zinc-400">Tasks are still being generated.</p>
        ) : (
          <ul className="space-y-2">
            {detail.tasks.map((task) => (
              <li key={task.taskId} className="rounded-lg border border-zinc-800 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{task.name}</p>
                  <span className="text-xs uppercase text-zinc-400">{task.status}</span>
                </div>
                {task.evaluation ? (
                  <div className="mt-2 space-y-1 text-xs text-zinc-300">
                    <p>
                      Avg score: {task.evaluation.criterionScores.average.toFixed(1)} | Pass: {" "}
                      {task.evaluation.pass ? "yes" : "no"}
                    </p>
                    <p className="text-zinc-400">{task.evaluation.rationale}</p>
                    {task.evaluation.failureClass ? (
                      <p className="text-amber-300">Failure: {task.evaluation.failureClass}</p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Event Stream</h2>
        <div className="max-h-72 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
          {events.length === 0 ? (
            <p className="text-xs text-zinc-500">No events yet.</p>
          ) : (
            <ul className="space-y-1">
              {events.map((event, index) => (
                <li key={`${event}-${index}`} className="text-xs text-zinc-300">
                  {event}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
