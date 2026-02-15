import RunReportClient from "@/app/runs/[runId]/run-report-client";

export default async function RunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  return <RunReportClient runId={runId} />;
}
