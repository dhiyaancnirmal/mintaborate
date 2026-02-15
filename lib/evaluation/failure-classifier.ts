import type { FailureClass } from "@/lib/runs/types";
import type { CriterionScores } from "@/lib/scoring/types";

export function classifyFailureClass(input: {
  scores: CriterionScores;
  rationale: string;
  suggestedFailureClass?: string | null;
}): FailureClass {
  const suggested = input.suggestedFailureClass;
  const validSuggestions: FailureClass[] = [
    "missing_content",
    "insufficient_detail",
    "ambiguous_instructions",
    "outdated_content",
    "poor_structure",
    "missing_examples",
    "broken_links",
  ];

  if (suggested && validSuggestions.includes(suggested as FailureClass)) {
    return suggested as FailureClass;
  }

  const { scores, rationale } = input;
  const lowerRationale = rationale.toLowerCase();

  if (/outdated|deprecated|old version/.test(lowerRationale)) {
    return "outdated_content";
  }

  if (/broken link|404|missing page/.test(lowerRationale)) {
    return "broken_links";
  }

  if (scores.groundedness < 5) {
    return "missing_content";
  }

  if (scores.actionability < 6 && scores.completeness < 6) {
    return "insufficient_detail";
  }

  if (/ambiguous|unclear|multiple interpretation/.test(lowerRationale)) {
    return "ambiguous_instructions";
  }

  if (/no example|missing example/.test(lowerRationale)) {
    return "missing_examples";
  }

  return "poor_structure";
}
