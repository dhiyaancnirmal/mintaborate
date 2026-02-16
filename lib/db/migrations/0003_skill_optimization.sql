ALTER TABLE task_executions ADD COLUMN phase TEXT NOT NULL DEFAULT 'baseline';

CREATE INDEX IF NOT EXISTS task_executions_run_phase_idx
ON task_executions (run_id, phase);

ALTER TABLE task_evaluations ADD COLUMN phase TEXT NOT NULL DEFAULT 'baseline';

CREATE TABLE IF NOT EXISTS skill_optimization_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL,
  source_skill_origin TEXT NOT NULL,
  baseline_summary_json TEXT,
  optimized_summary_json TEXT,
  delta_json TEXT,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS skill_optimization_sessions_run_unq
ON skill_optimization_sessions (run_id);

CREATE INDEX IF NOT EXISTS skill_optimization_sessions_status_idx
ON skill_optimization_sessions (status);

CREATE TABLE IF NOT EXISTS skill_optimization_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  artifact_type TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  metadata_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS skill_optimization_artifacts_session_idx
ON skill_optimization_artifacts (session_id);

CREATE INDEX IF NOT EXISTS skill_optimization_artifacts_type_idx
ON skill_optimization_artifacts (artifact_type);
