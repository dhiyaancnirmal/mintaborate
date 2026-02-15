export function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString("en-US", { hour12: false });
}

export function formatDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatDuration(startMs: number, endMs: number | null): string {
  const end = endMs ?? Date.now();
  const diff = Math.max(0, end - startMs);
  const totalSeconds = Math.floor(diff / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

export function statusColor(status: string): string {
  switch (status) {
    case "passed":
    case "completed":
      return "var(--status-pass)";
    case "failed":
    case "canceled":
      return "var(--status-fail)";
    case "running":
    case "queued":
    case "ingesting":
    case "generating_tasks":
    case "evaluating":
      return "var(--status-running)";
    case "error":
      return "var(--status-error)";
    default:
      return "var(--status-pending)";
  }
}

export function isActiveStatus(status: string): boolean {
  return ["running", "queued", "ingesting", "generating_tasks", "evaluating"].includes(status);
}
