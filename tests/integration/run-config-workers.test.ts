import { describe, expect, it } from "vitest";
import { buildRunConfig } from "@/lib/runs/service";

describe("buildRunConfig worker normalization", () => {
  it("fills worker assignment quantities to workerCount", () => {
    const config = buildRunConfig({
      docsUrl: "https://docs.example.com",
      workers: {
        workerCount: 4,
        assignments: [
          {
            provider: "openai",
            model: "gpt-5-mini",
            quantity: 1,
          },
        ],
      },
      tasks: [
        {
          name: "Task A",
          description: "Do A",
        },
      ],
    });

    const quantitySum = config.workerConfig.assignments.reduce(
      (acc, assignment) => acc + assignment.quantity,
      0,
    );

    expect(config.workerConfig.workerCount).toBe(4);
    expect(quantitySum).toBe(4);
    expect(config.userDefinedTasks.length).toBe(1);
  });
});
