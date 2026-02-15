"use client";

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
  Collapsible,
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

  const runStats = useMemo(() => {
    const completed = runs.filter((run) => run.status === "completed").length;
    const running = runs.filter((run) => isActiveStatus(run.status)).length;

    return {
      total: runs.length,
      completed,
      running,
    };
  }, [runs]);

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
    <main style={{ minHeight: "100vh" }}>
      {/* Header Bar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 48,
          padding: "0 24px",
          borderBottom: "1px solid var(--border-default)",
          background: "var(--surface-0)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--accent)",
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--text-primary)",
            }}
          >
            Mintaborate
          </span>
        </div>
        <a
          href="https://mintlify.com"
          target="_blank"
          rel="noreferrer"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--text-secondary)",
            textDecoration: "none",
            padding: "6px 12px",
            border: "1px solid var(--border-emphasis)",
            borderRadius: "var(--radius)",
            transition: "color 0.15s",
          }}
        >
          Mintlify
        </a>
      </header>

      {/* Hero Section */}
      <section
        style={{
          textAlign: "center",
          padding: "56px 24px 32px",
          maxWidth: 720,
          margin: "0 auto",
        }}
      >
        <MonoLabel>Agent Effectiveness Simulation</MonoLabel>
        <h1
          style={{
            marginTop: 12,
            fontSize: 40,
            fontWeight: 600,
            lineHeight: 1.15,
            color: "var(--text-primary)",
          }}
        >
          Measure the{" "}
          <span style={{ color: "var(--accent)", fontStyle: "italic" }}>
            implementation outcome
          </span>
        </h1>
        <p
          style={{
            marginTop: 12,
            fontSize: 14,
            color: "var(--text-secondary)",
            lineHeight: 1.6,
          }}
        >
          Simulate real implementation workflows, inspect where traces fail,
          and get diagnostics-first evaluation.
        </p>
      </section>

      {/* Config Form */}
      <section style={{ maxWidth: 760, margin: "0 auto", padding: "0 24px" }}>
        <Card variant="elevated">
          <form onSubmit={onSubmit}>
            {/* Row 1: URL + Submit */}
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
                style={{
                  height: 42,
                  whiteSpace: "nowrap",
                  opacity: creating ? 0.6 : 1,
                }}
              >
                {creating ? "Creating..." : "Start Simulation"}
              </Button>
            </div>

            {/* Row 2: Number inputs */}
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
                label="Workers"
                type="number"
                min={1}
                max={12}
                value={workerCount}
                onChange={(e) => setWorkerCount(Number(e.target.value))}
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

            {/* Worker Model Assignments */}
            <div style={{ marginTop: 16 }}>
              <Collapsible title="Worker Model Assignments" defaultOpen>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {assignments.map((assignment, index) => (
                    <div
                      key={`${assignment.model}-${index}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "140px 1fr 80px auto",
                        gap: 8,
                        alignItems: "end",
                      }}
                    >
                      <Select
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
                      </Select>
                      <input
                        style={{
                          padding: "10px 12px",
                          background: "var(--surface-3)",
                          border: "1px solid var(--border-default)",
                          borderRadius: "var(--radius)",
                          color: "var(--text-primary)",
                          fontSize: 13,
                          fontFamily: "var(--font-mono)",
                          outline: "none",
                        }}
                        value={assignment.model}
                        onChange={(e) => updateAssignment(index, { model: e.target.value })}
                        placeholder="model name"
                      />
                      <input
                        type="number"
                        min={1}
                        max={12}
                        style={{
                          padding: "10px 12px",
                          background: "var(--surface-3)",
                          border: "1px solid var(--border-default)",
                          borderRadius: "var(--radius)",
                          color: "var(--text-primary)",
                          fontSize: 13,
                          outline: "none",
                        }}
                        value={assignment.quantity}
                        onChange={(e) => updateAssignment(index, { quantity: Number(e.target.value) })}
                      />
                      <Button
                        type="button"
                        variant="danger"
                        style={{ padding: "8px 10px", fontSize: 11 }}
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
                        { provider: "openai", model: "gpt-5-mini", quantity: 1 },
                      ])
                    }
                  >
                    + Add Assignment
                  </Button>
                </div>
              </Collapsible>
            </div>

            {/* User-Defined Tasks */}
            <div style={{ marginTop: 12 }}>
              <Collapsible title="User-Defined Tasks">
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
                          fontSize: 12,
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
                          fontSize: 12,
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
                          fontSize: 12,
                          outline: "none",
                        }}
                        value={task.expectedSignals}
                        onChange={(e) => updateTask(index, { expectedSignals: e.target.value })}
                        placeholder="Expected signals (comma separated)"
                      />
                      <Button
                        type="button"
                        variant="danger"
                        style={{ fontSize: 11, padding: "6px 10px" }}
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
                    + Add Task
                  </Button>
                </div>
              </Collapsible>
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

      {/* Bottom Grid */}
      <section
        style={{
          maxWidth: 760,
          margin: "24px auto 48px",
          padding: "0 24px",
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr",
          gap: 16,
        }}
      >
        {/* Recent Runs */}
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
                <a
                  key={run.id}
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
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-emphasis)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-default)";
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
                </a>
              ))}
            </div>
          )}
        </Card>

        {/* Run Monitor */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <MetricCard label="Running" value={runStats.running} />
          <MetricCard label="Completed" value={runStats.completed} accent />
        </div>
      </section>
    </main>
  );
}
