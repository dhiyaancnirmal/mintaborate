import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  docsUrl: text("docs_url").notNull(),
  configJson: text("config_json").notNull(),
  status: text("status").notNull(),
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at"),
  totalsJson: text("totals_json"),
  costEstimate: real("cost_estimate").notNull().default(0),
});

export const ingestionArtifacts = sqliteTable(
  "ingestion_artifacts",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    runId: text("run_id").notNull(),
    artifactType: text("artifact_type").notNull(),
    sourceUrl: text("source_url").notNull(),
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(),
    metadataJson: text("metadata_json"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("ingestion_artifacts_run_id_idx").on(table.runId)],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    runId: text("run_id").notNull(),
    taskId: text("task_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    difficulty: text("difficulty").notNull(),
    expectedSignalsJson: text("expected_signals_json").notNull(),
    status: text("status").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("tasks_run_id_idx").on(table.runId), index("tasks_run_task_idx").on(table.runId, table.taskId)],
);

export const taskAttempts = sqliteTable(
  "task_attempts",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    runId: text("run_id").notNull(),
    taskId: text("task_id").notNull(),
    modelOutput: text("model_output").notNull(),
    citationsJson: text("citations_json").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    tokensIn: integer("tokens_in").notNull(),
    tokensOut: integer("tokens_out").notNull(),
    costEstimate: real("cost_estimate").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("task_attempts_run_task_idx").on(table.runId, table.taskId)],
);

export const taskEvaluations = sqliteTable(
  "task_evaluations",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    runId: text("run_id").notNull(),
    taskId: text("task_id").notNull(),
    criterionScoresJson: text("criterion_scores_json").notNull(),
    pass: integer("pass", { mode: "boolean" }).notNull(),
    failureClass: text("failure_class"),
    rationale: text("rationale").notNull(),
    judgeModel: text("judge_model").notNull(),
    confidence: real("confidence").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("task_evaluations_run_task_idx").on(table.runId, table.taskId)],
);

export const runEvents = sqliteTable(
  "run_events",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    runId: text("run_id").notNull(),
    seq: integer("seq").notNull(),
    eventType: text("event_type").notNull(),
    payloadJson: text("payload_json").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("run_events_run_seq_idx").on(table.runId, table.seq)],
);

export const runErrors = sqliteTable(
  "run_errors",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    runId: text("run_id").notNull(),
    phase: text("phase").notNull(),
    errorCode: text("error_code").notNull(),
    message: text("message").notNull(),
    detailsJson: text("details_json"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("run_errors_run_id_idx").on(table.runId)],
);

export type RunRow = typeof runs.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type TaskEvaluationRow = typeof taskEvaluations.$inferSelect;
export type RunEventRow = typeof runEvents.$inferSelect;
