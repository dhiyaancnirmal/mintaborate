import { customAlphabet } from "nanoid";
import { TASK_TEMPLATES } from "@/lib/tasks/templates";
import type { GeneratedTask, TaskGenerationInput } from "@/lib/tasks/types";
import type { TaskCategory } from "@/lib/runs/types";

const shortId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);

function inferCategory(topic: string): TaskCategory {
  const lowered = topic.toLowerCase();

  if (/(auth|oauth|token|key|permission|security)/.test(lowered)) {
    return "authentication";
  }

  if (/(deploy|production|release|hosting|observability|monitoring)/.test(lowered)) {
    return "deployment";
  }

  if (/(webhook|integration|sdk|cli|plugin|mcp)/.test(lowered)) {
    return "integration";
  }

  if (/(error|troubleshoot|debug|failure|status)/.test(lowered)) {
    return "troubleshooting";
  }

  if (/(quickstart|get started|installation|setup)/.test(lowered)) {
    return "getting-started";
  }

  return "core-feature";
}

function extractHeadings(input?: string): string[] {
  if (!input) {
    return [];
  }

  const headings = input
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^#{1,4}\s+/.test(line))
    .map((line) => line.replace(/^#{1,4}\s+/, "").trim())
    .filter((line) => line.length >= 6)
    .slice(0, 80);

  return [...new Set(headings)];
}

function makeDocAwareTasks(input: TaskGenerationInput): Omit<GeneratedTask, "taskId">[] {
  const headings = extractHeadings(input.llmsText).concat(extractHeadings(input.llmsFullText));

  const selected = headings.slice(0, 12);

  return selected.map((heading) => {
    const category = inferCategory(heading);
    return {
      name: `Complete task: ${heading}`,
      description: `Use the docs to fully accomplish the workflow described by \"${heading}\", including prerequisites, exact steps, and validation checks.`,
      category,
      difficulty: "medium",
      expectedSignals: [heading, "step-by-step", "example", "constraints"],
    };
  });
}

function dedupeTasks(tasks: Omit<GeneratedTask, "taskId">[]): Omit<GeneratedTask, "taskId">[] {
  const map = new Map<string, Omit<GeneratedTask, "taskId">>();

  for (const task of tasks) {
    const key = task.name.toLowerCase().replace(/\s+/g, " ").trim();
    if (!map.has(key)) {
      map.set(key, task);
    }
  }

  return [...map.values()];
}

export function generateTasks(input: TaskGenerationInput): GeneratedTask[] {
  const templateTasks = TASK_TEMPLATES;
  const docAwareTasks = makeDocAwareTasks(input);

  const combined = dedupeTasks([...templateTasks, ...docAwareTasks]).slice(0, input.maxTasks);

  return combined.map((task) => ({
    ...task,
    taskId: `task_${shortId()}`,
  }));
}
