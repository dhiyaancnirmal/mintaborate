import { describe, expect, it } from "vitest";
import { aggregateRunScores } from "@/lib/scoring/aggregate";

describe("aggregateRunScores", () => {
  it("aggregates pass rate and average", () => {
    const aggregate = aggregateRunScores([
      {
        taskId: "t1",
        pass: true,
        failureClass: null,
        rationale: "good",
        confidence: 0.9,
        criterionScores: {
          completeness: 8,
          correctness: 8,
          groundedness: 8,
          actionability: 8,
          average: 8,
        },
      },
      {
        taskId: "t2",
        pass: false,
        failureClass: "missing_content",
        rationale: "missing",
        confidence: 0.7,
        criterionScores: {
          completeness: 4,
          correctness: 4,
          groundedness: 3,
          actionability: 4,
          average: 3.75,
        },
      },
    ]);

    expect(aggregate.totalTasks).toBe(2);
    expect(aggregate.passedTasks).toBe(1);
    expect(aggregate.passRate).toBe(0.5);
    expect(aggregate.failureBreakdown.missing_content).toBe(1);
  });
});
