import { describe, expect, it } from "vitest";
import { generateTasks } from "@/lib/tasks/generator";
import { buildCorpusChunks, retrieveTopChunks } from "@/lib/execution/retrieval";

describe("task pipeline integration", () => {
  it("generates tasks and retrieves relevant chunks", () => {
    const tasks = generateTasks({
      docsUrl: "https://docs.example.com",
      maxTasks: 8,
      llmsText: "# Docs\n## Authentication\n## Webhooks\n## Error Handling",
      llmsFullText: "## Deployment\n## Monitoring",
    });

    const chunks = buildCorpusChunks([
      {
        artifactType: "llms_full",
        sourceUrl: "https://docs.example.com/llms-full.txt",
        content:
          "Authentication requires an API key. Webhooks require signature verification. Retry with exponential backoff.",
      },
      {
        artifactType: "page_md",
        sourceUrl: "https://docs.example.com/auth.md",
        content: "Use Authorization: Bearer <API_KEY> for all requests.",
      },
    ]);

    const top = retrieveTopChunks(chunks, "How do I authenticate API requests with an API key?", 3);

    expect(tasks.length).toBe(8);
    expect(top.length).toBeGreaterThan(0);
    expect(top[0]?.text.toLowerCase()).toContain("api");
  });
});
