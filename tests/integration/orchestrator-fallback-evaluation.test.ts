import { beforeEach, describe, expect, it } from "vitest";
import { startRunInBackground } from "@/lib/execution/orchestrator";
import { getDb } from "@/lib/db/client";
import {
  ingestionArtifacts,
  runErrors,
  runEvents,
  runs,
  taskAttempts,
  taskEvaluations,
  tasks,
} from "@/lib/db/schema";
import { createRun, getRunDetail } from "@/lib/runs/service";

async function resetDb(): Promise<void> {
  const db = await getDb();
  await db.delete(runErrors);
  await db.delete(taskEvaluations);
  await db.delete(taskAttempts);
  await db.delete(tasks);
  await db.delete(ingestionArtifacts);
  await db.delete(runEvents);
  await db.delete(runs);
}

async function waitForRunTerminal(runId: string, timeoutMs = 20_000): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const detail = await getRunDetail(runId);
    const status = detail?.run.status;

    if (status && ["completed", "failed", "canceled"].includes(status)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for run ${runId} to finish`);
}

describe.sequential("orchestrator fallback evaluation persistence", () => {
  beforeEach(async () => {
    await resetDb();
    delete process.env.OPENAI_API_KEY;
  });

  it("persists fallback evaluations when task execution fails", async () => {
    const { runId } = await createRun({
      docsUrl: "http://127.0.0.1:9",
      taskCount: 2,
    });

    startRunInBackground(runId);
    await waitForRunTerminal(runId);

    const detail = await getRunDetail(runId);
    expect(detail).not.toBeNull();

    const tasksResult = detail!.tasks;
    expect(tasksResult.length).toBe(2);
    expect(tasksResult.every((task) => task.evaluation !== null)).toBe(true);
    expect(tasksResult.some((task) => task.status === "error")).toBe(false);

    const totals = detail!.run.totals;
    expect(totals).not.toBeNull();
    expect((totals?.failedTasks ?? 0) + (totals?.passedTasks ?? 0)).toBe(totals?.totalTasks ?? -1);
  });
});
