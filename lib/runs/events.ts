import { and, asc, eq, gt, max } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { runEvents } from "@/lib/db/schema";
import type { RunEventPayload } from "@/lib/runs/types";

export interface PersistedRunEvent {
  id: number;
  seq: number;
  eventType: string;
  payload: RunEventPayload;
  createdAt: number;
}

function isRunEventSeqConflict(error: unknown): boolean {
  const queue: unknown[] = [error];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object") {
      continue;
    }

    const maybeMessage =
      "message" in current && typeof current.message === "string"
        ? current.message.toLowerCase()
        : "";
    const maybeCode =
      "code" in current && typeof current.code === "string" ? current.code : "";

    if (
      maybeCode === "SQLITE_CONSTRAINT_UNIQUE" ||
      (maybeMessage.includes("unique") &&
        maybeMessage.includes("run_events") &&
        maybeMessage.includes("run_id") &&
        maybeMessage.includes("seq"))
    ) {
      return true;
    }

    if ("cause" in current) {
      queue.push(current.cause);
    }
  }

  return false;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function appendRunEvent(
  runId: string,
  eventType: string,
  payload: RunEventPayload,
): Promise<number> {
  const db = await getDb();
  const maxAttempts = 24;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const [{ nextSeq }] = await db
      .select({ nextSeq: max(runEvents.seq) })
      .from(runEvents)
      .where(eq(runEvents.runId, runId));

    const seq = (nextSeq ?? 0) + 1;

    try {
      await db.insert(runEvents).values({
        runId,
        seq,
        eventType,
        payloadJson: JSON.stringify(payload),
        createdAt: Date.now(),
      });

      return seq;
    } catch (error) {
      if (attempt < maxAttempts - 1 && isRunEventSeqConflict(error)) {
        const jitterMs = Math.floor(Math.random() * 4);
        await sleep(Math.min(50, 2 * (attempt + 1)) + jitterMs);
        continue;
      }
      throw error;
    }
  }

  throw new Error("Failed to append run event after retries.");
}

export async function getRunEventsAfter(
  runId: string,
  afterId: number,
  limit = 100,
): Promise<PersistedRunEvent[]> {
  const db = await getDb();

  const rows = await db
    .select()
    .from(runEvents)
    .where(and(eq(runEvents.runId, runId), gt(runEvents.id, afterId)))
    .orderBy(asc(runEvents.id))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    seq: row.seq,
    eventType: row.eventType,
    payload: JSON.parse(row.payloadJson) as RunEventPayload,
    createdAt: row.createdAt,
  }));
}
