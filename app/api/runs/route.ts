import { z } from "zod";
import { createRun, listRuns } from "@/lib/runs/service";
import { startRunInBackground } from "@/lib/execution/orchestrator";

const taskSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  category: z
    .enum([
      "getting-started",
      "authentication",
      "core-feature",
      "integration",
      "deployment",
      "troubleshooting",
    ])
    .optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  expectedSignals: z.array(z.string().min(1)).optional(),
});

const workerAssignmentSchema = z.object({
  provider: z.enum(["openai", "anthropic", "openai-compatible"]),
  model: z.string().min(1),
  quantity: z.number().int().min(1).max(32),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(32000).optional(),
  timeoutMs: z.number().int().min(1).max(300000).optional(),
  retries: z.number().int().min(0).max(10).optional(),
  apiKeyEnvVar: z.string().optional(),
  baseUrl: z.string().optional(),
});

const createRunSchema = z.object({
  docsUrl: z.string().min(1),
  taskCount: z.number().int().min(1).max(200).optional(),
  executionConcurrency: z.number().int().min(1).max(20).optional(),
  judgeConcurrency: z.number().int().min(1).max(20).optional(),
  tieBreakEnabled: z.boolean().optional(),
  maxTokensPerTask: z.number().int().min(256).max(32000).optional(),
  hardCostCapUsd: z.number().min(0).max(10000).optional(),
  maxStepsPerTask: z.number().int().min(1).max(64).optional(),
  tasks: z.array(taskSchema).optional(),
  workers: z
    .object({
      workerCount: z.number().int().min(1).max(32).optional(),
      assignments: z.array(workerAssignmentSchema).optional(),
    })
    .optional(),
  runModel: z
    .object({
      provider: z.enum(["openai", "anthropic", "openai-compatible"]).optional(),
      model: z.string().optional(),
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().int().min(1).max(32000).optional(),
      timeoutMs: z.number().int().min(1).max(300000).optional(),
      retries: z.number().int().min(0).max(10).optional(),
      apiKey: z.string().optional(),
      apiKeyEnvVar: z.string().optional(),
      baseUrl: z.string().optional(),
    })
    .optional(),
  judgeModel: z
    .object({
      provider: z.enum(["openai", "anthropic", "openai-compatible"]).optional(),
      model: z.string().optional(),
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().int().min(1).max(32000).optional(),
      timeoutMs: z.number().int().min(1).max(300000).optional(),
      retries: z.number().int().min(0).max(10).optional(),
      apiKey: z.string().optional(),
      apiKeyEnvVar: z.string().optional(),
      baseUrl: z.string().optional(),
    })
    .optional(),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const runs = await listRuns(30);
  return Response.json({ runs });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = await request.json();
    const parsed = createRunSchema.parse(payload);

    const { runId } = await createRun(parsed);
    startRunInBackground(runId);

    return Response.json({ runId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return Response.json({ error: message }, { status: 400 });
  }
}
