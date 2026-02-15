import { describe, expect, it } from "vitest";
import { classifyFailureClass } from "@/lib/evaluation/failure-classifier";

describe("classifyFailureClass", () => {
  it("respects suggested failure class when valid", () => {
    const result = classifyFailureClass({
      scores: {
        completeness: 4,
        correctness: 4,
        groundedness: 4,
        actionability: 4,
        average: 4,
      },
      rationale: "topic is missing",
      suggestedFailureClass: "missing_examples",
    });

    expect(result).toBe("missing_examples");
  });

  it("maps outdated language to outdated_content", () => {
    const result = classifyFailureClass({
      scores: {
        completeness: 5,
        correctness: 4,
        groundedness: 5,
        actionability: 5,
        average: 4.75,
      },
      rationale: "Example appears deprecated and outdated for current SDK",
    });

    expect(result).toBe("outdated_content");
  });
});
