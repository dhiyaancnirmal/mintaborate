import type { TaskCategory, TaskDifficulty, UserDefinedTask } from "@/lib/runs/types";

export interface GeneratedTask {
  taskId: string;
  name: string;
  description: string;
  category: TaskCategory;
  difficulty: TaskDifficulty;
  expectedSignals: string[];
}

export interface TaskGenerationInput {
  docsUrl: string;
  maxTasks: number;
  llmsText?: string;
  llmsFullText?: string;
  skillText?: string;
  userDefinedTasks?: UserDefinedTask[];
}
