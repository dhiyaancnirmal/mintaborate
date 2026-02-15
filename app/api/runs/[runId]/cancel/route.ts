import { cancelRun, getRun } from "@/lib/runs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await context.params;
  const run = await getRun(runId);

  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  if (run.status === "completed" || run.status === "failed" || run.status === "canceled") {
    return Response.json({ ok: true, alreadyFinal: true });
  }

  await cancelRun(runId);
  return Response.json({ ok: true });
}
