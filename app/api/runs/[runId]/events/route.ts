import { getRunEventsAfter } from "@/lib/runs/events";
import { getRun } from "@/lib/runs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encodeSse(payload: { id?: number; event?: string; data: unknown }): Uint8Array {
  const lines: string[] = [];

  if (payload.id !== undefined) {
    lines.push(`id: ${payload.id}`);
  }

  if (payload.event) {
    lines.push(`event: ${payload.event}`);
  }

  lines.push(`data: ${JSON.stringify(payload.data)}`);
  lines.push("\n");

  return new TextEncoder().encode(lines.join("\n"));
}

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await context.params;
  const existingRun = await getRun(runId);

  if (!existingRun) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      let lastEventId = Number(request.headers.get("last-event-id") ?? 0);
      let closed = false;
      let interval: NodeJS.Timeout | undefined;

      const safeClose = () => {
        if (closed) {
          return;
        }

        closed = true;
        if (interval) {
          clearInterval(interval);
          interval = undefined;
        }
        controller.close();
      };

      const send = (data: unknown, event?: string, id?: number) => {
        if (closed) {
          return;
        }

        controller.enqueue(encodeSse({ data, event, id }));
      };

      const poll = async () => {
        if (closed) {
          return;
        }

        const events = await getRunEventsAfter(runId, lastEventId, 100);
        for (const event of events) {
          lastEventId = event.id;
          send(
            {
              id: event.id,
              seq: event.seq,
              eventType: event.eventType,
              payload: event.payload,
              createdAt: event.createdAt,
            },
            "message",
            event.id,
          );
        }

        const run = await getRun(runId);
        if (
          run &&
          ["completed", "failed", "canceled"].includes(run.status) &&
          events.length === 0
        ) {
          send({ done: true, status: run.status }, "done");
          safeClose();
        }
      };

      send({ connected: true }, "ready");
      await poll();

      interval = setInterval(() => {
        void poll().catch((error) => {
          send(
            {
              error: error instanceof Error ? error.message : "Unknown stream error",
            },
            "error",
          );
          safeClose();
        });
      }, 1000);

      request.signal.addEventListener("abort", () => {
        safeClose();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
