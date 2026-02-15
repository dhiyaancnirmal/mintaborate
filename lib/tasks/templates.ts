import type { GeneratedTask } from "@/lib/tasks/types";

export const TASK_TEMPLATES: Omit<GeneratedTask, "taskId">[] = [
  {
    name: "SDK Installation and First Call",
    description:
      "Find how to install the official SDK/client and make a first successful API request.",
    category: "getting-started",
    difficulty: "easy",
    expectedSignals: ["installation", "first request", "example code"],
  },
  {
    name: "API Authentication",
    description:
      "Determine how to authenticate requests, including credential setup and request header format.",
    category: "authentication",
    difficulty: "easy",
    expectedSignals: ["API key", "authorization header", "secure storage"],
  },
  {
    name: "Create Primary Resource",
    description:
      "Find the endpoint or method to create the primary resource and required request fields.",
    category: "core-feature",
    difficulty: "medium",
    expectedSignals: ["POST", "required parameters", "response structure"],
  },
  {
    name: "Webhook Setup",
    description:
      "Set up webhook/event notifications and verify signature validation requirements.",
    category: "integration",
    difficulty: "medium",
    expectedSignals: ["webhook endpoint", "signature", "retry semantics"],
  },
  {
    name: "Rate Limits and Retries",
    description:
      "Find rate limit guidance and implement robust retry/backoff behavior.",
    category: "troubleshooting",
    difficulty: "medium",
    expectedSignals: ["rate limit", "retry", "backoff"],
  },
  {
    name: "Production Deployment",
    description:
      "Identify deployment or production readiness guidance including environment variables.",
    category: "deployment",
    difficulty: "hard",
    expectedSignals: ["production", "environment variables", "best practices"],
  },
  {
    name: "Error Debugging",
    description:
      "Locate documented error codes/messages and how to remediate common failures.",
    category: "troubleshooting",
    difficulty: "medium",
    expectedSignals: ["error codes", "troubleshooting", "diagnostics"],
  },
  {
    name: "Pagination and Large Lists",
    description:
      "Determine how to paginate list endpoints and safely iterate through large result sets.",
    category: "core-feature",
    difficulty: "medium",
    expectedSignals: ["pagination", "cursor", "next page"],
  },
  {
    name: "Environment Configuration",
    description:
      "Find all required environment configuration variables and default behavior.",
    category: "getting-started",
    difficulty: "easy",
    expectedSignals: ["environment variables", "defaults", "configuration"],
  },
  {
    name: "CLI or Tooling Workflow",
    description:
      "Find official CLI/tooling usage for common workflows and expected outputs.",
    category: "integration",
    difficulty: "medium",
    expectedSignals: ["CLI", "commands", "workflow examples"],
  },
  {
    name: "Security and Access Control",
    description:
      "Identify security guidance around access control, secrets, and permissions.",
    category: "authentication",
    difficulty: "hard",
    expectedSignals: ["permissions", "roles", "security considerations"],
  },
  {
    name: "Monitoring and Observability",
    description:
      "Find operational guidance for monitoring, alerting, and incident response.",
    category: "deployment",
    difficulty: "hard",
    expectedSignals: ["monitoring", "alerts", "logs"],
  },
];
