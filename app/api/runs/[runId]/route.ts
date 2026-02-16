import { deleteRun, getRun, getRunDetail } from "@/lib/runs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = new Set([
  "queued",
  "ingesting",
  "generating_tasks",
  "running",
  "evaluating",
]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await context.params;
  const runDetail = await getRunDetail(runId);

  if (!runDetail) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  return Response.json(runDetail);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await context.params;

  const run = await getRun(runId);
  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  if (ACTIVE_STATUSES.has(run.status)) {
    return Response.json(
      { error: "Run is still active. Cancel it before deleting." },
      { status: 409 },
    );
  }

  await deleteRun(runId);
  return Response.json({ ok: true });
}
