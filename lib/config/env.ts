import { z } from "zod";
import type { ModelConfig } from "@/lib/models/types";
import type { RunConfig } from "@/lib/runs/types";

const envSchema = z.object({
  DATABASE_URL: z.string().default("file:./data/mintaborate.db"),

  DEFAULT_RUN_MODEL_PROVIDER: z
    .enum(["openai", "anthropic", "openai-compatible"])
    .default("openai"),
  DEFAULT_RUN_MODEL: z.string().default("gpt-5-mini"),
  DEFAULT_JUDGE_MODEL_PROVIDER: z
    .enum(["openai", "anthropic", "openai-compatible"])
    .default("openai"),
  DEFAULT_JUDGE_MODEL: z.string().default("gpt-5-mini"),

  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_COMPATIBLE_API_KEY: z.string().optional(),
  OPENAI_COMPATIBLE_BASE_URL: z.string().optional(),

  DEFAULT_TASK_COUNT: z.coerce.number().int().min(1).max(200).default(10),
  DEFAULT_EXECUTION_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(3),
  DEFAULT_JUDGE_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(3),
  DEFAULT_MAX_TOKENS_PER_TASK: z.coerce.number().int().min(256).max(32000).default(5000),
  DEFAULT_HARD_COST_CAP_USD: z.coerce.number().min(0).max(10000).default(10),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

function getDefaultApiKeyEnv(provider: ModelConfig["provider"]): string {
  if (provider === "anthropic") {
    return "ANTHROPIC_API_KEY";
  }

  if (provider === "openai-compatible") {
    return "OPENAI_COMPATIBLE_API_KEY";
  }

  return "OPENAI_API_KEY";
}

export function buildDefaultModelConfig(kind: "run" | "judge"): ModelConfig {
  const env = getEnv();
  const provider =
    kind === "run" ? env.DEFAULT_RUN_MODEL_PROVIDER : env.DEFAULT_JUDGE_MODEL_PROVIDER;
  const model = kind === "run" ? env.DEFAULT_RUN_MODEL : env.DEFAULT_JUDGE_MODEL;

  return {
    provider,
    model,
    temperature: kind === "judge" ? 0 : 0.2,
    maxTokens: 2000,
    timeoutMs: 120_000,
    retries: 2,
    apiKeyEnvVar: getDefaultApiKeyEnv(provider),
    baseUrl:
      provider === "openai-compatible"
        ? env.OPENAI_COMPATIBLE_BASE_URL ?? "https://api.openai.com/v1"
        : undefined,
  };
}

export function buildDefaultRunConfig(taskCount?: number): Omit<RunConfig, "budget"> & {
  budget: RunConfig["budget"];
} {
  const env = getEnv();

  return {
    runModel: buildDefaultModelConfig("run"),
    judgeModel: buildDefaultModelConfig("judge"),
    executionConcurrency: env.DEFAULT_EXECUTION_CONCURRENCY,
    judgeConcurrency: env.DEFAULT_JUDGE_CONCURRENCY,
    tieBreakEnabled: false,
    budget: {
      maxTasks: taskCount ?? env.DEFAULT_TASK_COUNT,
      maxTokensPerTask: env.DEFAULT_MAX_TOKENS_PER_TASK,
      hardCostCapUsd: env.DEFAULT_HARD_COST_CAP_USD,
    },
  };
}
