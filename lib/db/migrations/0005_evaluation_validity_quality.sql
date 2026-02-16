ALTER TABLE task_evaluations ADD COLUMN quality_pass INTEGER NOT NULL DEFAULT 0;
ALTER TABLE task_evaluations ADD COLUMN validity_pass INTEGER NOT NULL DEFAULT 0;
ALTER TABLE task_evaluations ADD COLUMN validity_blocked_reasons_json TEXT NOT NULL DEFAULT '[]';
