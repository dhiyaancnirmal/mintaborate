import { describe, expect, it } from "vitest";
import { generateTasks } from "@/lib/tasks/generator";

describe("generateTasks", () => {
  it("returns capped task count", () => {
    const tasks = generateTasks({
      docsUrl: "https://docs.example.com",
      maxTasks: 6,
      llmsText: "# Docs\n## Authentication\n## Webhooks\n## Deploy",
    });

    expect(tasks.length).toBe(6);
  });

  it("deduplicates task names", () => {
    const tasks = generateTasks({
      docsUrl: "https://docs.example.com",
      maxTasks: 20,
      llmsText: "## API Authentication\n## API Authentication\n## API Authentication",
    });

    const uniqueNames = new Set(tasks.map((task) => task.name));
    expect(uniqueNames.size).toBe(tasks.length);
  });

  it("fills to requested task count when docs coverage is sparse", () => {
    const tasks = generateTasks({
      docsUrl: "https://docs.example.com",
      maxTasks: 30,
      llmsText: "# Minimal Docs",
      llmsFullText: "",
    });

    expect(tasks.length).toBe(30);
  });
});
