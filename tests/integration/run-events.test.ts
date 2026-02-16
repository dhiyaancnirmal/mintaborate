import { beforeEach, describe, expect, it } from "vitest";
import { createRun } from "@/lib/runs/service";
import { appendRunEvent, getRunEventsAfter } from "@/lib/runs/events";
import { getDb } from "@/lib/db/client";
import {
  deterministicChecks,
  ingestionArtifacts,
  runErrors,
  runEvents,
  runWorkers,
  runs,
  skillOptimizationArtifacts,
  skillOptimizationSessions,
  taskAgentState,
  taskAttempts,
  taskEvaluations,
  taskExecutions,
  taskStepCitations,
  taskSteps,
  tasks,
} from "@/lib/db/schema";

async function resetDb(): Promise<void> {
  const db = await getDb();
  await db.delete(runErrors);
  await db.delete(skillOptimizationArtifacts);
  await db.delete(skillOptimizationSessions);
  await db.delete(deterministicChecks);
  await db.delete(taskStepCitations);
  await db.delete(taskSteps);
  await db.delete(taskAgentState);
  await db.delete(taskExecutions);
  await db.delete(taskEvaluations);
  await db.delete(taskAttempts);
  await db.delete(tasks);
  await db.delete(ingestionArtifacts);
  await db.delete(runEvents);
  await db.delete(runWorkers);
  await db.delete(runs);
}

describe.sequential("run event persistence", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("uses unique event IDs for cursoring under concurrent appends", async () => {
    const { runId } = await createRun({
      docsUrl: "https://docs.example.com",
      taskCount: 1,
    });

    await Promise.all(
      Array.from({ length: 50 }).map((_, idx) =>
        appendRunEvent(runId, "test.concurrent", {
          runId,
          phase: "system",
          message: `event-${idx}`,
        }),
      ),
    );

    const allEvents = await getRunEventsAfter(runId, 0, 500);

    const idSet = new Set(allEvents.map((event) => event.id));
    expect(allEvents.length).toBeGreaterThanOrEqual(51);
    expect(idSet.size).toBe(allEvents.length);

    const firstBatch = allEvents.slice(0, 20);
    const resumed = await getRunEventsAfter(runId, firstBatch.at(-1)?.id ?? 0, 500);

    expect(resumed[0]?.id).toBeGreaterThan(firstBatch.at(-1)?.id ?? 0);
  });
});
