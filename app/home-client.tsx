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

const defaultPayload = {
  docsUrl: "https://docs.anthropic.com",
  taskCount: 10,
  executionConcurrency: 3,
  judgeConcurrency: 3,
};

export default function HomeClient() {
  const router = useRouter();
  const [docsUrl, setDocsUrl] = useState(defaultPayload.docsUrl);
  const [taskCount, setTaskCount] = useState(defaultPayload.taskCount);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);

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
      "Backend-first mode: submit a docs URL, then inspect run progress/events on the run page.",
    [],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docsUrl,
          taskCount,
          executionConcurrency: defaultPayload.executionConcurrency,
          judgeConcurrency: defaultPayload.judgeConcurrency,
        }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
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
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Mintaborate</h1>
        <p className="text-sm text-zinc-400">{runHint}</p>
      </header>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-5">
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1">
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
              className="w-36 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
              value={taskCount}
              onChange={(e) => setTaskCount(Number(e.target.value))}
            />
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
