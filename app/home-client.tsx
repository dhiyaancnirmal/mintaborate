"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type RunSummary = {
  id: string;
  docsUrl: string;
  status: string;
  startedAt: number;
  endedAt: number | null;
};

type CreateRunResponse = {
  runId: string;
};

type AssignmentRow = {
  provider: "openai" | "anthropic" | "openai-compatible";
  model: string;
  quantity: number;
};

type TaskRow = {
  name: string;
  description: string;
  expectedSignals: string;
};

const defaultPayload = {
  docsUrl: "https://docs.anthropic.com",
  taskCount: 10,
  workerCount: 3,
  maxStepsPerTask: 8,
  judgeConcurrency: 3,
};

export default function HomeClient() {
  const router = useRouter();
  const [docsUrl, setDocsUrl] = useState(defaultPayload.docsUrl);
  const [taskCount, setTaskCount] = useState(defaultPayload.taskCount);
  const [workerCount, setWorkerCount] = useState(defaultPayload.workerCount);
  const [maxStepsPerTask, setMaxStepsPerTask] = useState(defaultPayload.maxStepsPerTask);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([
    {
      provider: "openai",
      model: "gpt-5-mini",
      quantity: defaultPayload.workerCount,
    },
  ]);
  const [taskRows, setTaskRows] = useState<TaskRow[]>([
    {
      name: "Authenticate API requests",
      description: "Find exactly how to authenticate requests and produce a working first call.",
      expectedSignals: "api key, authorization header, example request",
    },
    {
      name: "Set up webhook listener",
      description: "Implement webhook configuration and signature verification correctly.",
      expectedSignals: "webhook endpoint, signature validation, retry behavior",
    },
  ]);

  const loadRuns = useCallback(async () => {
    const res = await fetch("/api/runs", { cache: "no-store" });
    if (!res.ok) {
      return;
    }
    const data = (await res.json()) as { runs: RunSummary[] };
    setRuns(data.runs);
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const runHint = useMemo(
    () =>
      "Configure workers and tasks, then inspect live multi-step traces for each task execution.",
    [],
  );

  function updateAssignment(index: number, patch: Partial<AssignmentRow>) {
    setAssignments((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function updateTask(index: number, patch: Partial<TaskRow>) {
    setTaskRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const normalizedAssignments = assignments
        .filter((assignment) => assignment.model.trim() && assignment.quantity > 0)
        .map((assignment) => ({
          ...assignment,
          model: assignment.model.trim(),
        }));

      const normalizedTasks = taskRows
        .filter((task) => task.name.trim() && task.description.trim())
        .map((task) => ({
          name: task.name.trim(),
          description: task.description.trim(),
          expectedSignals: task.expectedSignals
            .split(",")
            .map((signal) => signal.trim())
            .filter(Boolean),
        }));

      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docsUrl,
          taskCount,
          judgeConcurrency: defaultPayload.judgeConcurrency,
          maxStepsPerTask,
          tasks: normalizedTasks,
          workers: {
            workerCount,
            assignments: normalizedAssignments,
          },
        }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to create run");
      }

      const data = (await res.json()) as CreateRunResponse;
      router.push(`/runs/${data.runId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setCreating(false);
      void loadRuns();
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Mintaborate</h1>
        <p className="text-sm text-zinc-400">{runHint}</p>
      </header>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-5">
        <form className="space-y-6" onSubmit={onSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2">
              <label className="block text-sm font-medium" htmlFor="docsUrl">
                Docs URL
              </label>
              <input
                id="docsUrl"
                required
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                value={docsUrl}
                onChange={(e) => setDocsUrl(e.target.value)}
                placeholder="https://docs.example.com"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium" htmlFor="taskCount">
                Task Count
              </label>
              <input
                id="taskCount"
                type="number"
                min={1}
                max={100}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                value={taskCount}
                onChange={(e) => setTaskCount(Number(e.target.value))}
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium" htmlFor="workerCount">
                Worker Count
              </label>
              <input
                id="workerCount"
                type="number"
                min={1}
                max={12}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                value={workerCount}
                onChange={(e) => setWorkerCount(Number(e.target.value))}
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium" htmlFor="maxStepsPerTask">
                Max Steps Per Task
              </label>
              <input
                id="maxStepsPerTask"
                type="number"
                min={1}
                max={64}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                value={maxStepsPerTask}
                onChange={(e) => setMaxStepsPerTask(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Worker Model Assignments</h2>
              <button
                type="button"
                className="rounded border border-zinc-700 px-2 py-1 text-xs"
                onClick={() =>
                  setAssignments((prev) => [
                    ...prev,
                    { provider: "openai", model: "gpt-5-mini", quantity: 1 },
                  ])
                }
              >
                Add Assignment
              </button>
            </div>
            <div className="space-y-2">
              {assignments.map((assignment, index) => (
                <div key={`${assignment.model}-${index}`} className="grid gap-2 md:grid-cols-4">
                  <select
                    className="rounded border border-zinc-700 bg-zinc-900 px-2 py-2 text-xs"
                    value={assignment.provider}
                    onChange={(e) =>
                      updateAssignment(index, {
                        provider: e.target.value as AssignmentRow["provider"],
                      })
                    }
                  >
                    <option value="openai">openai</option>
                    <option value="anthropic">anthropic</option>
                    <option value="openai-compatible">openai-compatible</option>
                  </select>
                  <input
                    className="rounded border border-zinc-700 bg-zinc-900 px-2 py-2 text-xs md:col-span-2"
                    value={assignment.model}
                    onChange={(e) => updateAssignment(index, { model: e.target.value })}
                    placeholder="model name"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={12}
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-2 text-xs"
                      value={assignment.quantity}
                      onChange={(e) => updateAssignment(index, { quantity: Number(e.target.value) })}
                    />
                    <button
                      type="button"
                      className="rounded border border-zinc-700 px-2 py-1 text-xs"
                      onClick={() =>
                        setAssignments((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
                      }
                      disabled={assignments.length <= 1}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">User-Defined Tasks</h2>
              <button
                type="button"
                className="rounded border border-zinc-700 px-2 py-1 text-xs"
                onClick={() =>
                  setTaskRows((prev) => [
                    ...prev,
                    {
                      name: "",
                      description: "",
                      expectedSignals: "",
                    },
                  ])
                }
              >
                Add Task
              </button>
            </div>
            <div className="space-y-3">
              {taskRows.map((task, index) => (
                <div key={`${task.name}-${index}`} className="rounded-lg border border-zinc-800 p-3 space-y-2">
                  <input
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-2 text-xs"
                    value={task.name}
                    onChange={(e) => updateTask(index, { name: e.target.value })}
                    placeholder="Task name"
                  />
                  <textarea
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-2 text-xs"
                    value={task.description}
                    onChange={(e) => updateTask(index, { description: e.target.value })}
                    rows={2}
                    placeholder="Task description"
                  />
                  <input
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-2 text-xs"
                    value={task.expectedSignals}
                    onChange={(e) => updateTask(index, { expectedSignals: e.target.value })}
                    placeholder="Expected signals (comma separated)"
                  />
                  <button
                    type="button"
                    className="rounded border border-zinc-700 px-2 py-1 text-xs"
                    onClick={() => setTaskRows((prev) => prev.filter((_, taskIndex) => taskIndex !== index))}
                    disabled={taskRows.length <= 1}
                  >
                    Remove Task
                  </button>
                </div>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-[#24E07E] px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
          >
            {creating ? "Creating..." : "Start Run"}
          </button>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Recent Runs</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-zinc-400">No runs yet.</p>
        ) : (
          <ul className="space-y-2">
            {runs.map((run) => (
              <li key={run.id} className="rounded-lg border border-zinc-800 p-3">
                <div className="flex items-center justify-between gap-2">
                  <a href={`/runs/${run.id}`} className="text-sm font-medium">
                    {run.docsUrl}
                  </a>
                  <span className="text-xs uppercase text-zinc-400">{run.status}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">Run ID: {run.id}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
