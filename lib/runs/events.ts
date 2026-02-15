import { and, asc, eq, gt, max } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { runEvents } from "@/lib/db/schema";
import type { RunEventPayload } from "@/lib/runs/types";

export interface PersistedRunEvent {
  seq: number;
  eventType: string;
  payload: RunEventPayload;
  createdAt: number;
}

export async function appendRunEvent(
  runId: string,
  eventType: string,
  payload: RunEventPayload,
): Promise<number> {
  const db = await getDb();

  const [{ nextSeq }] = await db
    .select({ nextSeq: max(runEvents.seq) })
    .from(runEvents)
    .where(eq(runEvents.runId, runId));

  const seq = (nextSeq ?? 0) + 1;

  await db.insert(runEvents).values({
    runId,
    seq,
    eventType,
    payloadJson: JSON.stringify(payload),
    createdAt: Date.now(),
  });

  return seq;
}

export async function getRunEventsAfter(
  runId: string,
  afterSeq: number,
  limit = 100,
): Promise<PersistedRunEvent[]> {
  const db = await getDb();

  const rows = await db
    .select()
    .from(runEvents)
    .where(and(eq(runEvents.runId, runId), gt(runEvents.seq, afterSeq)))
    .orderBy(asc(runEvents.seq))
    .limit(limit);

  return rows.map((row) => ({
    seq: row.seq,
    eventType: row.eventType,
    payload: JSON.parse(row.payloadJson) as RunEventPayload,
    createdAt: row.createdAt,
  }));
}
