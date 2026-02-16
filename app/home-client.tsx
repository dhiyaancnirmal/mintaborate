"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  StatusDot,
  MonoLabel,
  Card,
  MetricCard,
  Button,
  Input,
  Select,
} from "@/components/ui/primitives";
import { isActiveStatus } from "@/lib/ui/format";

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

type Provider = "openai" | "anthropic" | "openai-compatible" | "gemini" | "openrouter";

type AssignmentRow = {
  provider: Provider;
  model: string;
  quantity: number;
};

type TaskRow = {
  name: string;
  description: string;
  expectedSignals: string;
};

const PROVIDER_LABELS: Record<Provider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  "openai-compatible": "OpenAI-Compatible",
  gemini: "Google Gemini",
  openrouter: "OpenRouter",
};

const MODEL_OPTIONS: Record<Provider, string[]> = {
  openai: ["gpt-5-mini", "gpt-5", "gpt-4.1-mini"],
  anthropic: ["claude-sonnet-4-5", "claude-opus-4-1", "claude-3-5-sonnet-latest"],
  "openai-compatible": [
    "moonshotai/kimi-k2-instruct-0905",
    "openai/gpt-5-mini",
    "anthropic/claude-sonnet-4-5",
    "google/gemini-2.5-pro",
  ],
  gemini: ["gemini-2.5-pro", "gemini-2.5-flash"],
  openrouter: ["openrouter/free", "openrouter/auto", "anthropic/claude-sonnet-4-5"],
};

const defaultPayload = {
  docsUrl: "https://docs.cdp.coinbase.com/",
  taskCount: 2,
  maxStepsPerTask: 8,
  executionConcurrency: 3,
  judgeConcurrency: 3,
  hardCostCapUsd: 10,
};

function getDefaultModel(provider: Provider): string {
  return MODEL_OPTIONS[provider][0] ?? "";
}

export default function HomeClient() {
  const router = useRouter();
  const [docsUrl, setDocsUrl] = useState(defaultPayload.docsUrl);
  const [taskCount, setTaskCount] = useState(defaultPayload.taskCount);
  const [maxStepsPerTask, setMaxStepsPerTask] = useState(defaultPayload.maxStepsPerTask);
  const [executionConcurrency, setExecutionConcurrency] = useState(defaultPayload.executionConcurrency);
  const [judgeConcurrency, setJudgeConcurrency] = useState(defaultPayload.judgeConcurrency);
  const [hardCostCapUsd, setHardCostCapUsd] = useState(defaultPayload.hardCostCapUsd);
  const [enableSkillOptimization, setEnableSkillOptimization] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([
    {
      provider: "openai-compatible",
      model: "moonshotai/kimi-k2-instruct-0905",
      quantity: 3,
    },
  ]);
  const [taskRows, setTaskRows] = useState<TaskRow[]>([
    {
      name: "Server Wallet: create + default address",
      description:
        "Write a Node/TS script using @coinbase/coinbase-sdk that initializes CDP from a JSON key file, creates a wallet, and prints the wallet default address.",
      expectedSignals:
        "@coinbase/coinbase-sdk, Coinbase.configureFromJson, Wallet.create, getDefaultAddress, networkId",
    },
    {
      name: "Server Wallet: faucet + transfer + wait",
      description:
        "Extend the script to fund the wallet on Base Sepolia via wallet.faucet() with wait, then create a second wallet and transfer testnet ETH using createTransfer, wait, and a completion status check.",
      expectedSignals:
        "faucet, faucetTransaction.wait, createTransfer, transfer.wait, getStatus, base-sepolia",
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

  const runStats = useMemo(() => {
    const completed = runs.filter((run) => run.status === "completed").length;
    const running = runs.filter((run) => isActiveStatus(run.status)).length;

    return {
      total: runs.length,
      completed,
      running,
    };
  }, [runs]);

  const workerCount = useMemo(
    () => assignments.reduce((sum, assignment) => sum + Math.max(0, assignment.quantity), 0),
    [assignments],
  );

  function updateAssignment(index: number, patch: Partial<AssignmentRow>) {
    setAssignments((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) {
        return prev;
      }

      const updated: AssignmentRow = {
        ...current,
        ...patch,
      };

      if (patch.provider && patch.provider !== current.provider) {
        updated.model = getDefaultModel(patch.provider);
      }

      next[index] = updated;
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

      const normalizedWorkerCount = normalizedAssignments.reduce(
        (sum, assignment) => sum + assignment.quantity,
        0,
      );

      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docsUrl,
          taskCount,
          executionConcurrency,
          judgeConcurrency,
          enableSkillOptimization,
          hardCostCapUsd,
          maxStepsPerTask,
          tasks: normalizedTasks,
          workers: {
            workerCount: normalizedWorkerCount,
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

  async function onDeleteRun(runId: string) {
    const confirmed = window.confirm("Delete this run permanently?");
    if (!confirmed) {
      return;
    }

    setDeletingRunId(runId);
    setError(null);

    try {
      const res = await fetch(`/api/runs/${runId}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to delete run");
      }
      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete run");
    } finally {
      setDeletingRunId(null);
    }
  }

  return (
    <main style={{ minHeight: "100vh" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          height: 56,
          padding: "0 24px",
          borderBottom: "1px solid var(--border-default)",
          background: "var(--surface-0)",
        }}
      >
        <span
          style={{
            fontFamily: "inherit",
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: "0.01em",
            color: "var(--text-primary)",
          }}
        >
          Mintaborate
        </span>
      </header>

      <section style={{ maxWidth: 900, margin: "20px auto 0", padding: "0 24px" }}>
        <Card variant="elevated">
          <form onSubmit={onSubmit}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 12,
                alignItems: "end",
              }}
            >
              <Input
                label="Docs URL"
                required
                value={docsUrl}
                onChange={(e) => setDocsUrl(e.target.value)}
                placeholder="https://docs.example.com"
              />
              <Button
                type="submit"
                variant="primary"
                disabled={creating}
                style={{ height: 42, whiteSpace: "nowrap", opacity: creating ? 0.6 : 1 }}
              >
                {creating ? "Creating..." : "Start Run"}
              </Button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 12,
                marginTop: 16,
              }}
            >
              <Input
                label="Task Count"
                type="number"
                min={1}
                max={100}
                value={taskCount}
                onChange={(e) => setTaskCount(Number(e.target.value))}
              />
              <Input
                label="Worker Count"
                type="number"
                value={workerCount}
                readOnly
              />
              <Input
                label="Max Steps"
                type="number"
                min={1}
                max={64}
                value={maxStepsPerTask}
                onChange={(e) => setMaxStepsPerTask(Number(e.target.value))}
              />
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 12,
                fontSize: 13,
                color: "var(--text-secondary)",
              }}
            >
              <input
                type="checkbox"
                checked={enableSkillOptimization}
                onChange={(e) => setEnableSkillOptimization(e.target.checked)}
              />
              <span>Enable skill optimization pass (slower)</span>
            </label>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 12,
                marginTop: 12,
              }}
            >
              <Input
                label="Execution Concurrency"
                type="number"
                min={1}
                max={20}
                value={executionConcurrency}
                onChange={(e) => setExecutionConcurrency(Number(e.target.value))}
              />
              <Input
                label="Judge Concurrency"
                type="number"
                min={1}
                max={20}
                value={judgeConcurrency}
                onChange={(e) => setJudgeConcurrency(Number(e.target.value))}
              />
              <Input
                label="Hard Cost Cap (USD)"
                type="number"
                min={0}
                max={10000}
                step="0.5"
                value={hardCostCapUsd}
                onChange={(e) => setHardCostCapUsd(Number(e.target.value))}
              />
            </div>

            <div style={{ marginTop: 16 }}>
              <MonoLabel>Model Assignments</MonoLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                {assignments.map((assignment, index) => (
                  <div
                    key={`${assignment.provider}-${assignment.model}-${index}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "160px 1fr 90px auto",
                      gap: 8,
                      alignItems: "end",
                    }}
                  >
                    <Select
                      value={assignment.provider}
                      onChange={(e) =>
                        updateAssignment(index, {
                          provider: e.target.value as Provider,
                        })
                      }
                    >
                      {Object.entries(PROVIDER_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>

                    <Select
                      value={assignment.model}
                      onChange={(e) =>
                        updateAssignment(index, {
                          model: e.target.value,
                        })
                      }
                    >
                      {MODEL_OPTIONS[assignment.provider].map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </Select>

                    <Input
                      type="number"
                      min={1}
                      max={12}
                      value={assignment.quantity}
                      onChange={(e) =>
                        updateAssignment(index, {
                          quantity: Number(e.target.value),
                        })
                      }
                    />

                    <Button
                      type="button"
                      variant="danger"
                      style={{ height: 40 }}
                      onClick={() =>
                        setAssignments((prev) => prev.filter((_, i) => i !== index))
                      }
                      disabled={assignments.length <= 1}
                    >
                      Remove
                    </Button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="secondary"
                  style={{ alignSelf: "flex-start", marginTop: 4 }}
                  onClick={() =>
                    setAssignments((prev) => [
                      ...prev,
                      {
                        provider: "openrouter",
                        model: getDefaultModel("openrouter"),
                        quantity: 1,
                      },
                    ])
                  }
                >
                  Add Model
                </Button>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <MonoLabel>User-Defined Tasks</MonoLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
                {taskRows.map((task, index) => (
                  <div
                    key={`${task.name}-${index}`}
                    style={{
                      padding: 12,
                      border: "1px solid var(--border-default)",
                      borderRadius: "var(--radius)",
                      background: "var(--surface-2)",
                    }}
                  >
                    <input
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "8px 10px",
                        marginBottom: 8,
                        background: "var(--surface-3)",
                        border: "1px solid var(--border-default)",
                        borderRadius: "var(--radius)",
                        color: "var(--text-primary)",
                        fontSize: 13,
                        outline: "none",
                      }}
                      value={task.name}
                      onChange={(e) => updateTask(index, { name: e.target.value })}
                      placeholder="Task name"
                    />
                    <textarea
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "8px 10px",
                        marginBottom: 8,
                        background: "var(--surface-3)",
                        border: "1px solid var(--border-default)",
                        borderRadius: "var(--radius)",
                        color: "var(--text-primary)",
                        fontSize: 13,
                        outline: "none",
                        resize: "vertical",
                        fontFamily: "inherit",
                      }}
                      value={task.description}
                      onChange={(e) => updateTask(index, { description: e.target.value })}
                      rows={2}
                      placeholder="Task description"
                    />
                    <input
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "8px 10px",
                        marginBottom: 8,
                        background: "var(--surface-3)",
                        border: "1px solid var(--border-default)",
                        borderRadius: "var(--radius)",
                        color: "var(--text-primary)",
                        fontSize: 13,
                        outline: "none",
                      }}
                      value={task.expectedSignals}
                      onChange={(e) => updateTask(index, { expectedSignals: e.target.value })}
                      placeholder="Expected signals (comma separated)"
                    />
                    <Button
                      type="button"
                      variant="danger"
                      style={{ height: 40 }}
                      onClick={() =>
                        setTaskRows((prev) => prev.filter((_, i) => i !== index))
                      }
                      disabled={taskRows.length <= 1}
                    >
                      Remove Task
                    </Button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="secondary"
                  style={{ alignSelf: "flex-start" }}
                  onClick={() =>
                    setTaskRows((prev) => [
                      ...prev,
                      { name: "", description: "", expectedSignals: "" },
                    ])
                  }
                >
                  Add Task
                </Button>
              </div>
            </div>

            {error && (
              <p
                style={{
                  marginTop: 12,
                  fontSize: 13,
                  color: "var(--status-fail)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {error}
              </p>
            )}
          </form>
        </Card>
      </section>

      <section
        style={{
          maxWidth: 900,
          margin: "20px auto 48px",
          padding: "0 24px",
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr",
          gap: 16,
        }}
      >
        <Card>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <MonoLabel>Recent Runs</MonoLabel>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--text-muted)",
              }}
            >
              {runStats.total} total
            </span>
          </div>

          {runs.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No runs yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {runs.map((run) => (
                <div
                  key={run.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <Link
                    href={`/runs/${run.id}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 12px",
                      textDecoration: "none",
                      borderRadius: "var(--radius)",
                      border: "1px solid var(--border-default)",
                      transition: "border-color 0.15s",
                    }}
                  >
                    <StatusDot status={run.status} size={6} />
                    <span
                      style={{
                        flex: 1,
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        color: "var(--text-primary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {run.docsUrl}
                    </span>
                    <MonoLabel>{run.status}</MonoLabel>
                  </Link>
                  <Button
                    type="button"
                    variant="danger"
                    style={{ padding: "6px 10px", fontSize: 11 }}
                    disabled={deletingRunId === run.id}
                    onClick={() => {
                      void onDeleteRun(run.id);
                    }}
                  >
                    {deletingRunId === run.id ? "Deleting" : "Delete"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <MetricCard label="Running" value={runStats.running} />
          <MetricCard label="Completed" value={runStats.completed} accent />
        </div>
      </section>
    </main>
  );
}
