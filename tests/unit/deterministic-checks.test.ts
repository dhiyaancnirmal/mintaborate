import { describe, expect, it } from "vitest";
import { evaluateDeterministicGuards } from "@/lib/evaluation/deterministic-checks";

describe("evaluateDeterministicGuards", () => {
  it("blocks pass when citations are missing", () => {
    const result = evaluateDeterministicGuards({
      task: {
        taskId: "t1",
        name: "Authenticate",
        description: "Find auth",
        category: "authentication",
        difficulty: "easy",
        expectedSignals: ["api key", "authorization"],
      },
      attempt: {
        taskId: "t1",
        answer: "Use auth header",
        steps: ["Set header"],
        citations: [],
        rawOutput: "",
        model: "openrouter/free",
        usage: { inputTokens: 0, outputTokens: 0 },
        latencyMs: 0,
        costEstimateUsd: 0,
      },
      stepCount: 1,
      stopReason: "completed",
    });

    expect(result.passBlockedReasons).toContain("missing_citations");
    expect(result.groundednessCap).toBe(3);
  });

  it("passes deterministic gates for well-supported output", () => {
    const result = evaluateDeterministicGuards({
      task: {
        taskId: "t1",
        name: "Authenticate",
        description: "Find auth",
        category: "authentication",
        difficulty: "easy",
        expectedSignals: ["api key", "authorization"],
      },
      attempt: {
        taskId: "t1",
        answer: "Use API key with Authorization header",
        steps: ["Get API key", "Set Authorization header"],
        citations: [
          {
            source: "https://docs.example.com/auth",
            excerpt: "Use API key in Authorization header",
          },
        ],
        rawOutput: "",
        model: "openrouter/free",
        usage: { inputTokens: 0, outputTokens: 0 },
        latencyMs: 0,
        costEstimateUsd: 0,
      },
      stepCount: 2,
      stopReason: "completed",
    });

    expect(result.passBlockedReasons.length).toBe(0);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });
});
