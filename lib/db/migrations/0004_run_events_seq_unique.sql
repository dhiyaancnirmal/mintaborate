DELETE FROM run_events
WHERE id NOT IN (
  SELECT MIN(id)
  FROM run_events
  GROUP BY run_id, seq
);

CREATE UNIQUE INDEX IF NOT EXISTS run_events_run_seq_unq
ON run_events (run_id, seq);
