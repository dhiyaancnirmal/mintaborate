"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  StatusDot,
  MonoLabel,
  Card,
  MetricCard,
  Button,
  ScoreBar,
  Badge,
} from "@/components/ui/primitives";
import {
  formatTimestamp,
  formatDuration,
  formatCost,
  isActiveStatus,
} from "@/lib/ui/format";
import type { RunEventPayload } from "@/lib/runs/types";

/* ─── Types ──────────────────────────────────────────────── */

interface CriterionScores {
  completeness: number;
  correctness: number;
  groundedness: number;
  actionability: number;
  average: number;
}

interface TaskEvaluation {
  taskId: string;
  pass: boolean;
  failureClass: string | null;
  rationale: string;
  confidence: number;
  criterionScores: CriterionScores;
}

interface TaskView {
  taskId: string;
  name: string;
  description: string;
  category: string;
  difficulty: string;
  status: string;
  expectedSignals: string[];
  evaluation: TaskEvaluation | null;
}

interface WorkerView {
  id: number;
  workerLabel: string;
  modelProvider: string;
  modelName: string;
  status: string;
}

interface TaskExecutionView {
  id: number;
  taskId: string;
  phase: string;
  workerId: number | null;
  status: string;
  stepCount: number;
  tokensInTotal: number;
  tokensOutTotal: number;
  costEstimateTotal: number;
  stopReason: string | null;
  startedAt: number;
  endedAt: number | null;
}

interface StepTraceView {
  id: number;
  taskExecutionId: number;
  stepIndex: number;
  phase: string;
  input: unknown;
  output: unknown;
  retrieval: unknown;
  usage: unknown;
  decision: unknown;
  citations: Array<{ source: string; excerpt: string }>;
  createdAt: number;
}

interface RunAggregateScore {
  totalTasks: number;
  passedTasks: number;
  failedTasks: number;
  passRate: number;
  averageScore: number;
  failureBreakdown: Record<string, number>;
}

interface OptimizationData {
  status: string;
  baselineTotals: RunAggregateScore | null;
  optimizedTotals: RunAggregateScore | null;
  delta: {
    passRateDelta: number;
    averageScoreDelta: number;
    passedTasksDelta: number;
    failedTasksDelta: number;
  } | null;
  taskComparisons: Array<{
    taskId: string;
    baselinePass: boolean | null;
    optimizedPass: boolean | null;
    baselineScore: number | null;
    optimizedScore: number | null;
  }>;
  optimizationNotes: string[];
}

interface EventMessage {
  id: number;
  seq: number;
  eventType: string;
  payload: RunEventPayload;
  createdAt: number;
}

interface RunDetail {
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
    config: {
      runModel: { provider: string; model: string };
      judgeModel: { provider: string; model: string };
      budget: {
        maxTasks: number;
        maxStepsPerTask: number;
        maxTokensPerTask: number;
        hardCostCapUsd: number;
      };
      executionConcurrency: number;
    };
  };
  tasks: TaskView[];
  workers: WorkerView[];
  taskExecutions: TaskExecutionView[];
  recentSteps: StepTraceView[];
  recentEvents: EventMessage[];
  optimization: OptimizationData;
}

/* ─── Component ──────────────────────────────────────────── */

export default function RunReportClient({ runId }: { runId: string }) {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [events, setEvents] = useState<EventMessage[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const eventLogRef = useRef<HTMLDivElement>(null);

  const fetchDetail = useCallback(async () => {
    const res = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load run");
    return (await res.json()) as RunDetail;
  }, [runId]);

  useEffect(() => {
    fetchDetail()
      .then((d) => {
        setDetail(d);
        setEvents(d.recentEvents);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load");
        setLoading(false);
      });
  }, [fetchDetail]);

  useEffect(() => {
    const es = new EventSource(`/api/runs/${runId}/events`);

    es.addEventListener("message", () => {
      fetchDetail()
        .then((d) => {
          setDetail(d);
          setEvents(d.recentEvents);
        })
        .catch(() => {});
    });

    es.addEventListener("done", () => {
      fetchDetail()
        .then((d) => {
          setDetail(d);
          setEvents(d.recentEvents);
        })
        .catch(() => {});
      es.close();
    });

    return () => { es.close(); };
  }, [runId, fetchDetail]);

  useEffect(() => {
    if (eventLogRef.current) {
      eventLogRef.current.scrollTop = eventLogRef.current.scrollHeight;
    }
  }, [events]);

  async function handleCancel() {
    await fetch(`/api/runs/${runId}/cancel`, { method: "POST" });
    const d = await fetchDetail();
    setDetail(d);
  }

  const totals = detail?.run.totals;
  const active = detail ? isActiveStatus(detail.run.status) : false;

  const selectedTask = useMemo(
    () => detail?.tasks.find((t) => t.taskId === selectedTaskId) ?? null,
    [detail, selectedTaskId],
  );

  const selectedExecution = useMemo(
    () => detail?.taskExecutions.find((te) => te.taskId === selectedTaskId) ?? null,
    [detail, selectedTaskId],
  );

  const selectedSteps = useMemo(
    () =>
      selectedExecution
        ? detail?.recentSteps.filter((s) => s.taskExecutionId === selectedExecution.id) ?? []
        : [],
    [detail, selectedExecution],
  );

  const failureBreakdown = useMemo(() => {
    if (!totals?.failureBreakdown) return [];
    return Object.entries(totals.failureBreakdown).filter(([, count]) => count > 0);
  }, [totals]);

  /* ─── Loading / Error States ─── */

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <MonoLabel>Loading run...</MonoLabel>
      </main>
    );
  }

  if (error || !detail) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--status-fail)", fontFamily: "var(--font-mono)", fontSize: 13 }}>
          {error ?? "Run not found"}
        </p>
      </main>
    );
  }

  /* ─── Render ─── */

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
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--accent)" }} />
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
        </a>
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
          }}
        >
          Mintlify
        </a>
      </header>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 48px" }}>
        {/* Run Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
          <StatusDot status={detail.run.status} size={12} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
            {detail.run.id}
          </span>
          <MonoLabel>{detail.run.status}</MonoLabel>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)" }}>
            {detail.run.docsUrl}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>
            {formatDuration(detail.run.startedAt, detail.run.endedAt)}
          </span>
          {active && (
            <Button variant="danger" onClick={handleCancel} style={{ marginLeft: "auto" }}>
              Cancel
            </Button>
          )}
        </div>

        {/* Metrics Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
          <MetricCard label="Total Tasks" value={totals?.totalTasks ?? detail.tasks.length} />
          <MetricCard label="Passed" value={totals?.passedTasks ?? 0} accent />
          <MetricCard label="Failed" value={totals?.failedTasks ?? 0} />
          <MetricCard label="Pass Rate" value={totals ? `${(totals.passRate * 100).toFixed(0)}%` : "--"} accent />
          <MetricCard label="Avg Score" value={totals ? totals.averageScore.toFixed(1) : "--"} />
        </div>

        {/* Main Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, alignItems: "start" }}>
          {/* LEFT COLUMN */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Tasks Panel */}
            <Card>
              <MonoLabel>Tasks</MonoLabel>
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 2 }}>
                {detail.tasks.map((task) => {
                  const isSelected = task.taskId === selectedTaskId;
                  return (
                    <button
                      key={task.taskId}
                      type="button"
                      onClick={() => setSelectedTaskId(isSelected ? null : task.taskId)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        width: "100%",
                        padding: "8px 12px",
                        background: isSelected ? "var(--surface-3)" : "transparent",
                        border: isSelected ? "1px solid var(--border-accent)" : "1px solid transparent",
                        borderRadius: "var(--radius)",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "background 0.1s",
                      }}
                    >
                      <StatusDot status={task.status} size={6} />
                      <span style={{ flex: 1, fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {task.name}
                      </span>
                      <Badge>{task.category}</Badge>
                      <Badge>{task.difficulty}</Badge>
                      {task.evaluation && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: task.evaluation.pass ? "var(--status-pass)" : "var(--status-fail)" }}>
                          {task.evaluation.criterionScores.average.toFixed(1)}
                        </span>
                      )}
                    </button>
                  );
                })}
                {detail.tasks.length === 0 && (
                  <p style={{ fontSize: 13, color: "var(--text-muted)", padding: "8px 0" }}>
                    No tasks generated yet.
                  </p>
                )}
              </div>
            </Card>

            {/* Selected Task Detail */}
            {selectedTask && (
              <Card variant="elevated">
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <StatusDot status={selectedTask.status} size={8} />
                    <span style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
                      {selectedTask.name}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    {selectedTask.description}
                  </p>
                  {selectedTask.expectedSignals.length > 0 && (
                    <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <MonoLabel>Expected:</MonoLabel>
                      {selectedTask.expectedSignals.map((signal) => (
                        <Badge key={signal}>{signal}</Badge>
                      ))}
                    </div>
                  )}
                </div>

                {selectedTask.evaluation && (
                  <>
                    <div style={{ marginBottom: 16 }}>
                      <MonoLabel>Evaluation Scores</MonoLabel>
                      <div style={{ marginTop: 8 }}>
                        <ScoreBar label="Completeness" score={selectedTask.evaluation.criterionScores.completeness} />
                        <ScoreBar label="Correctness" score={selectedTask.evaluation.criterionScores.correctness} />
                        <ScoreBar label="Groundedness" score={selectedTask.evaluation.criterionScores.groundedness} />
                        <ScoreBar label="Actionability" score={selectedTask.evaluation.criterionScores.actionability} />
                        <ScoreBar label="Average" score={selectedTask.evaluation.criterionScores.average} />
                      </div>
                    </div>

                    {selectedTask.evaluation.failureClass && (
                      <div style={{ marginBottom: 12 }}>
                        <MonoLabel>Failure Class</MonoLabel>
                        <div style={{ marginTop: 4 }}>
                          <Badge color="var(--status-fail)">{selectedTask.evaluation.failureClass}</Badge>
                        </div>
                      </div>
                    )}

                    <div style={{ marginBottom: 12 }}>
                      <MonoLabel>Rationale</MonoLabel>
                      <p style={{ marginTop: 4, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                        {selectedTask.evaluation.rationale}
                      </p>
                    </div>
                  </>
                )}

                {selectedExecution && (
                  <div>
                    <MonoLabel>Execution</MonoLabel>
                    <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                      <div>
                        <MonoLabel>Steps</MonoLabel>
                        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginTop: 2 }}>
                          {selectedExecution.stepCount}
                        </p>
                      </div>
                      <div>
                        <MonoLabel>Tokens</MonoLabel>
                        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginTop: 2 }}>
                          {(selectedExecution.tokensInTotal + selectedExecution.tokensOutTotal).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <MonoLabel>Cost</MonoLabel>
                        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginTop: 2 }}>
                          {formatCost(selectedExecution.costEstimateTotal)}
                        </p>
                      </div>
                      <div>
                        <MonoLabel>Stop Reason</MonoLabel>
                        <p style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-secondary)", marginTop: 2 }}>
                          {selectedExecution.stopReason ?? "--"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            )}

            {/* Agent Trace Panel */}
            {selectedTask && selectedSteps.length > 0 && (
              <Card>
                <MonoLabel>Agent Trace</MonoLabel>
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                  {selectedSteps.map((step) => (
                    <StepRow key={step.id} step={step} />
                  ))}
                </div>
              </Card>
            )}

            {/* Optimization Panel */}
            {detail.optimization.status !== "not_started" && (
              <Card>
                <MonoLabel>Optimization</MonoLabel>
                <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                  <MetricCard
                    label="Baseline"
                    value={detail.optimization.baselineTotals ? `${(detail.optimization.baselineTotals.passRate * 100).toFixed(0)}%` : "--"}
                  />
                  <MetricCard
                    label="Optimized"
                    value={detail.optimization.optimizedTotals ? `${(detail.optimization.optimizedTotals.passRate * 100).toFixed(0)}%` : "--"}
                    accent
                  />
                  <MetricCard
                    label="Delta"
                    value={detail.optimization.delta ? `${detail.optimization.delta.passRateDelta > 0 ? "+" : ""}${(detail.optimization.delta.passRateDelta * 100).toFixed(1)}%` : "--"}
                    accent={!!detail.optimization.delta && detail.optimization.delta.passRateDelta > 0}
                  />
                </div>

                {detail.optimization.taskComparisons.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <MonoLabel>Task Comparison</MonoLabel>
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
                      {detail.optimization.taskComparisons.map((tc) => {
                        const task = detail.tasks.find((t) => t.taskId === tc.taskId);
                        return (
                          <div
                            key={tc.taskId}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              padding: "6px 0",
                              fontSize: 12,
                              borderBottom: "1px solid var(--border-default)",
                            }}
                          >
                            <span style={{ flex: 1, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {task?.name ?? tc.taskId}
                            </span>
                            <span style={{ fontFamily: "var(--font-mono)", color: tc.baselinePass === true ? "var(--status-pass)" : tc.baselinePass === false ? "var(--status-fail)" : "var(--text-muted)" }}>
                              {tc.baselinePass === true ? "PASS" : tc.baselinePass === false ? "FAIL" : "--"}
                            </span>
                            <span style={{ color: "var(--text-muted)" }}>&rarr;</span>
                            <span style={{ fontFamily: "var(--font-mono)", color: tc.optimizedPass === true ? "var(--status-pass)" : tc.optimizedPass === false ? "var(--status-fail)" : "var(--text-muted)" }}>
                              {tc.optimizedPass === true ? "PASS" : tc.optimizedPass === false ? "FAIL" : "--"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {detail.optimization.optimizationNotes.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <MonoLabel>Notes</MonoLabel>
                    <ul style={{ marginTop: 6, paddingLeft: 16, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                      {detail.optimization.optimizationNotes.map((note, i) => (
                        <li key={i}>{note}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* RIGHT COLUMN */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Workers Panel */}
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <MonoLabel>Workers</MonoLabel>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
                  {detail.workers.filter((w) => w.status === "running").length} active
                </span>
              </div>
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                {detail.workers.map((worker) => (
                  <div key={worker.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                    <StatusDot status={worker.status} size={6} />
                    <span style={{ fontSize: 12, color: "var(--text-primary)" }}>{worker.workerLabel}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>
                      {worker.modelName}
                    </span>
                  </div>
                ))}
                {detail.workers.length === 0 && (
                  <p style={{ fontSize: 12, color: "var(--text-muted)" }}>No workers yet.</p>
                )}
              </div>
            </Card>

            {/* Failure Breakdown */}
            {failureBreakdown.length > 0 && (
              <Card>
                <MonoLabel>Failure Breakdown</MonoLabel>
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  {failureBreakdown.map(([cls, count]) => (
                    <div key={cls} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                        {cls.replace(/_/g, " ")}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600, color: "var(--status-fail)" }}>
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Event Log */}
            <Card>
              <MonoLabel>Event Log</MonoLabel>
              <div
                ref={eventLogRef}
                style={{
                  marginTop: 10,
                  maxHeight: 340,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                {events.map((ev) => (
                  <div
                    key={ev.id}
                    style={{
                      display: "flex",
                      gap: 8,
                      padding: "3px 0",
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      lineHeight: 1.4,
                    }}
                  >
                    <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                      {formatTimestamp(ev.createdAt)}
                    </span>
                    <span style={{ color: "var(--accent)", flexShrink: 0 }}>
                      {ev.eventType.split(".").pop()}
                    </span>
                    <span style={{ color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ev.payload.message}
                    </span>
                  </div>
                ))}
                {events.length === 0 && (
                  <p style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    Waiting for events...
                  </p>
                )}
              </div>
            </Card>

            {/* Config Panel */}
            <Card>
              <MonoLabel>Config</MonoLabel>
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                <ConfigRow label="Run Model" value={detail.run.config.runModel.model} />
                <ConfigRow label="Judge Model" value={detail.run.config.judgeModel.model} />
                <ConfigRow label="Budget" value={formatCost(detail.run.config.budget.hardCostCapUsd)} />
                <ConfigRow label="Concurrency" value={String(detail.run.config.executionConcurrency)} />
                <ConfigRow label="Max Steps" value={String(detail.run.config.budget.maxStepsPerTask)} />
              </div>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}

/* ─── Sub-components ──────────────────────────────────────── */

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <MonoLabel>{label}</MonoLabel>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-primary)" }}>
        {value}
      </span>
    </div>
  );
}

function StepRow({ step }: { step: StepTraceView }) {
  const [expanded, setExpanded] = useState(false);
  const usage = step.usage as { inputTokens?: number; outputTokens?: number } | null;
  const phaseTag = step.phase.toUpperCase();

  return (
    <div style={{ borderBottom: "1px solid var(--border-default)", padding: "6px 0" }}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          padding: 0,
        }}
      >
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", width: 20, textAlign: "right", flexShrink: 0 }}>
          {step.stepIndex}
        </span>
        <Badge color={phaseTag === "ACT" ? "var(--accent)" : phaseTag === "PLAN" ? "var(--status-running)" : undefined}>
          {phaseTag}
        </Badge>
        {usage && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
            {((usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)).toLocaleString()} tok
          </span>
        )}
        {step.citations.length > 0 && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)" }}>
            {step.citations.length} cite{step.citations.length !== 1 ? "s" : ""}
          </span>
        )}
        <span
          style={{
            marginLeft: "auto",
            fontSize: 10,
            color: "var(--text-muted)",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
          }}
        >
          &#9654;
        </span>
      </button>
      {expanded && (
        <div
          style={{
            marginTop: 8,
            marginLeft: 30,
            padding: "8px 12px",
            background: "var(--surface-2)",
            borderRadius: "var(--radius)",
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            color: "var(--text-secondary)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: 300,
            overflowY: "auto",
          }}
        >
          <div style={{ marginBottom: 8 }}>
            <span style={{ color: "var(--text-muted)" }}>INPUT: </span>
            {JSON.stringify(step.input, null, 2)}
          </div>
          <div>
            <span style={{ color: "var(--text-muted)" }}>OUTPUT: </span>
            {JSON.stringify(step.output, null, 2)}
          </div>
          {step.citations.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <span style={{ color: "var(--accent)" }}>CITATIONS:</span>
              {step.citations.map((c, i) => (
                <div key={i} style={{ marginTop: 4 }}>
                  <span style={{ color: "var(--text-muted)" }}>[{c.source}]</span> {c.excerpt}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
