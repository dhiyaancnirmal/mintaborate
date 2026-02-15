CREATE TABLE IF NOT EXISTS run_workers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  worker_label TEXT NOT NULL,
  model_provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  model_config_json TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);

CREATE INDEX IF NOT EXISTS run_workers_run_id_idx ON run_workers (run_id);
CREATE UNIQUE INDEX IF NOT EXISTS run_workers_run_label_unq ON run_workers (run_id, worker_label);

CREATE TABLE IF NOT EXISTS task_executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  worker_id INTEGER,
  status TEXT NOT NULL,
  step_count INTEGER NOT NULL DEFAULT 0,
  tokens_in_total INTEGER NOT NULL DEFAULT 0,
  tokens_out_total INTEGER NOT NULL DEFAULT 0,
  cost_estimate_total REAL NOT NULL DEFAULT 0,
  stop_reason TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);

CREATE INDEX IF NOT EXISTS task_executions_run_id_idx ON task_executions (run_id);
CREATE INDEX IF NOT EXISTS task_executions_task_id_idx ON task_executions (task_id);
CREATE INDEX IF NOT EXISTS task_executions_worker_id_idx ON task_executions (worker_id);

CREATE TABLE IF NOT EXISTS task_agent_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_execution_id INTEGER NOT NULL,
  current_step INTEGER NOT NULL,
  goal_json TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  visited_sources_json TEXT NOT NULL,
  facts_json TEXT NOT NULL,
  step_summaries_json TEXT NOT NULL,
  remaining_budget_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS task_agent_state_execution_unq
ON task_agent_state (task_execution_id);
CREATE INDEX IF NOT EXISTS task_agent_state_execution_idx
ON task_agent_state (task_execution_id);

CREATE TABLE IF NOT EXISTS task_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_execution_id INTEGER NOT NULL,
  step_index INTEGER NOT NULL,
  phase TEXT NOT NULL,
  input_json TEXT NOT NULL,
  output_json TEXT NOT NULL,
  retrieval_json TEXT,
  usage_json TEXT,
  decision_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS task_steps_execution_idx ON task_steps (task_execution_id);
CREATE INDEX IF NOT EXISTS task_steps_execution_step_idx ON task_steps (task_execution_id, step_index);

CREATE TABLE IF NOT EXISTS task_step_citations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_step_id INTEGER NOT NULL,
  source_url TEXT NOT NULL,
  snippet_hash TEXT,
  excerpt TEXT NOT NULL,
  start_offset INTEGER,
  end_offset INTEGER
);

CREATE INDEX IF NOT EXISTS task_step_citations_step_idx ON task_step_citations (task_step_id);

CREATE TABLE IF NOT EXISTS deterministic_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_execution_id INTEGER NOT NULL,
  check_name TEXT NOT NULL,
  passed INTEGER NOT NULL,
  score_delta REAL NOT NULL DEFAULT 0,
  details_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS deterministic_checks_execution_idx ON deterministic_checks (task_execution_id);

CREATE INDEX IF NOT EXISTS run_events_run_id_id_idx ON run_events (run_id, id);
