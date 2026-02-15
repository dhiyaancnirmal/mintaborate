CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  docs_url TEXT NOT NULL,
  config_json TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  totals_json TEXT,
  cost_estimate REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ingestion_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  source_url TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  metadata_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ingestion_artifacts_run_id_idx
ON ingestion_artifacts (run_id);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  expected_signals_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS tasks_run_id_idx ON tasks (run_id);
CREATE INDEX IF NOT EXISTS tasks_run_task_idx ON tasks (run_id, task_id);

CREATE TABLE IF NOT EXISTS task_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  model_output TEXT NOT NULL,
  citations_json TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  tokens_in INTEGER NOT NULL,
  tokens_out INTEGER NOT NULL,
  cost_estimate REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS task_attempts_run_task_idx ON task_attempts (run_id, task_id);

CREATE TABLE IF NOT EXISTS task_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  criterion_scores_json TEXT NOT NULL,
  pass INTEGER NOT NULL,
  failure_class TEXT,
  rationale TEXT NOT NULL,
  judge_model TEXT NOT NULL,
  confidence REAL NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS task_evaluations_run_task_idx ON task_evaluations (run_id, task_id);

CREATE TABLE IF NOT EXISTS run_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS run_events_run_seq_idx ON run_events (run_id, seq);

CREATE TABLE IF NOT EXISTS run_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  error_code TEXT NOT NULL,
  message TEXT NOT NULL,
  details_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS run_errors_run_id_idx ON run_errors (run_id);
