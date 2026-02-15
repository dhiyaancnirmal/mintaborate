import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
  (table) => [
    index("tasks_run_id_idx").on(table.runId),
    index("tasks_run_task_idx").on(table.runId, table.taskId),
  ],
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
  (table) => [
    index("run_events_run_seq_idx").on(table.runId, table.seq),
    index("run_events_run_id_id_idx").on(table.runId, table.id),
  ],
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

export const runWorkers = sqliteTable(
  "run_workers",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    runId: text("run_id").notNull(),
    workerLabel: text("worker_label").notNull(),
    modelProvider: text("model_provider").notNull(),
    modelName: text("model_name").notNull(),
    modelConfigJson: text("model_config_json").notNull(),
    status: text("status").notNull(),
    startedAt: integer("started_at").notNull(),
    endedAt: integer("ended_at"),
  },
  (table) => [
    index("run_workers_run_id_idx").on(table.runId),
    uniqueIndex("run_workers_run_label_unq").on(table.runId, table.workerLabel),
  ],
);

export const taskExecutions = sqliteTable(
  "task_executions",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    runId: text("run_id").notNull(),
    taskId: text("task_id").notNull(),
    workerId: integer("worker_id"),
    status: text("status").notNull(),
    stepCount: integer("step_count").notNull().default(0),
    tokensInTotal: integer("tokens_in_total").notNull().default(0),
    tokensOutTotal: integer("tokens_out_total").notNull().default(0),
    costEstimateTotal: real("cost_estimate_total").notNull().default(0),
    stopReason: text("stop_reason"),
    startedAt: integer("started_at").notNull(),
    endedAt: integer("ended_at"),
  },
  (table) => [
    index("task_executions_run_id_idx").on(table.runId),
    index("task_executions_task_id_idx").on(table.taskId),
    index("task_executions_worker_id_idx").on(table.workerId),
  ],
);

export const taskAgentState = sqliteTable(
  "task_agent_state",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    taskExecutionId: integer("task_execution_id").notNull(),
    currentStep: integer("current_step").notNull(),
    goalJson: text("goal_json").notNull(),
    planJson: text("plan_json").notNull(),
    visitedSourcesJson: text("visited_sources_json").notNull(),
    factsJson: text("facts_json").notNull(),
    stepSummariesJson: text("step_summaries_json").notNull(),
    remainingBudgetJson: text("remaining_budget_json").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("task_agent_state_execution_unq").on(table.taskExecutionId),
    index("task_agent_state_execution_idx").on(table.taskExecutionId),
  ],
);

export const taskSteps = sqliteTable(
  "task_steps",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    taskExecutionId: integer("task_execution_id").notNull(),
    stepIndex: integer("step_index").notNull(),
    phase: text("phase").notNull(),
    inputJson: text("input_json").notNull(),
    outputJson: text("output_json").notNull(),
    retrievalJson: text("retrieval_json"),
    usageJson: text("usage_json"),
    decisionJson: text("decision_json"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("task_steps_execution_idx").on(table.taskExecutionId),
    index("task_steps_execution_step_idx").on(table.taskExecutionId, table.stepIndex),
  ],
);

export const taskStepCitations = sqliteTable(
  "task_step_citations",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    taskStepId: integer("task_step_id").notNull(),
    sourceUrl: text("source_url").notNull(),
    snippetHash: text("snippet_hash"),
    excerpt: text("excerpt").notNull(),
    startOffset: integer("start_offset"),
    endOffset: integer("end_offset"),
  },
  (table) => [index("task_step_citations_step_idx").on(table.taskStepId)],
);

export const deterministicChecks = sqliteTable(
  "deterministic_checks",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    taskExecutionId: integer("task_execution_id").notNull(),
    checkName: text("check_name").notNull(),
    passed: integer("passed", { mode: "boolean" }).notNull(),
    scoreDelta: real("score_delta").notNull().default(0),
    detailsJson: text("details_json"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("deterministic_checks_execution_idx").on(table.taskExecutionId)],
);

export type RunRow = typeof runs.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type TaskEvaluationRow = typeof taskEvaluations.$inferSelect;
export type RunEventRow = typeof runEvents.$inferSelect;
