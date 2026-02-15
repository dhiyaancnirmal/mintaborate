import type { AgentTaskAttempt } from "@/lib/execution/agent-runner";
import type { GeneratedTask } from "@/lib/tasks/types";

export interface DeterministicCheck {
  name: string;
  passed: boolean;
  scoreDelta: number;
  details?: Record<string, unknown>;
}

export interface DeterministicGuards {
  groundednessCap?: number;
  correctnessCap?: number;
  completenessCap?: number;
  actionabilityCap?: number;
  passBlockedReasons: string[];
  checks: DeterministicCheck[];
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function signalCoverage(expectedSignals: string[], candidateText: string): {
  matched: string[];
  missed: string[];
  ratio: number;
} {
  if (expectedSignals.length === 0) {
    return {
      matched: [],
      missed: [],
      ratio: 1,
    };
  }

  const normalizedCandidate = normalizeText(candidateText);
  const matched: string[] = [];
  const missed: string[] = [];

  for (const signal of expectedSignals) {
    const normalizedSignal = normalizeText(signal);
    if (!normalizedSignal) {
      continue;
    }

    if (normalizedCandidate.includes(normalizedSignal)) {
      matched.push(signal);
    } else {
      missed.push(signal);
    }
  }

  return {
    matched,
    missed,
    ratio: expectedSignals.length > 0 ? matched.length / expectedSignals.length : 1,
  };
}

export function evaluateDeterministicGuards(input: {
  task: GeneratedTask;
  attempt: AgentTaskAttempt;
  stepCount: number;
  stopReason: string;
}): DeterministicGuards {
  const checks: DeterministicCheck[] = [];
  const passBlockedReasons: string[] = [];
  const guards: Omit<DeterministicGuards, "checks" | "passBlockedReasons"> = {};

  const citationCount = input.attempt.citations.length;
  const citationCheckPassed = citationCount > 0;
  checks.push({
    name: "citation_presence",
    passed: citationCheckPassed,
    scoreDelta: citationCheckPassed ? 0 : -2,
    details: {
      citationCount,
    },
  });

  if (!citationCheckPassed) {
    guards.groundednessCap = 3;
    passBlockedReasons.push("missing_citations");
  }

  const allAnswerText = `${input.attempt.answer}\n${input.attempt.steps.join("\n")}`;
  const coverage = signalCoverage(input.task.expectedSignals, allAnswerText);
  const coveragePassed = coverage.ratio >= 0.45;

  checks.push({
    name: "expected_signal_coverage",
    passed: coveragePassed,
    scoreDelta: coveragePassed ? 0 : -1,
    details: {
      matched: coverage.matched,
      missed: coverage.missed,
      ratio: coverage.ratio,
    },
  });

  if (!coveragePassed) {
    guards.completenessCap = 6;
  }

  const stepCheckPassed = input.attempt.steps.length >= 2 && input.stepCount >= 2;
  checks.push({
    name: "actionable_step_depth",
    passed: stepCheckPassed,
    scoreDelta: stepCheckPassed ? 0 : -1,
    details: {
      answerSteps: input.attempt.steps.length,
      loopSteps: input.stepCount,
    },
  });

  if (!stepCheckPassed) {
    guards.actionabilityCap = 6;
  }

  const stopReasonPassed = input.stopReason === "completed";
  checks.push({
    name: "bounded_termination",
    passed: stopReasonPassed,
    scoreDelta: stopReasonPassed ? 0 : -0.5,
    details: {
      stopReason: input.stopReason,
    },
  });

  if (!stopReasonPassed) {
    guards.correctnessCap = Math.min(guards.correctnessCap ?? 10, 8);
  }

  return {
    ...guards,
    checks,
    passBlockedReasons,
  };
}
