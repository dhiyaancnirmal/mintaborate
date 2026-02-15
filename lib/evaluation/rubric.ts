import { z } from "zod";

export const criterionSchema = z.object({
  completeness: z.number().min(0).max(10),
  correctness: z.number().min(0).max(10),
  groundedness: z.number().min(0).max(10),
  actionability: z.number().min(0).max(10),
});

export const alignmentSchema = z.object({
  isSupportedByEvidence: z.boolean(),
  unsupportedClaims: z.array(z.string()),
  notes: z.string(),
});

export const rubricScoreSchema = z.object({
  scores: criterionSchema,
  rationale: z.string(),
  confidence: z.number().min(0).max(1),
  suggestedFailureClass: z
    .enum([
      "missing_content",
      "insufficient_detail",
      "ambiguous_instructions",
      "outdated_content",
      "poor_structure",
      "missing_examples",
      "broken_links",
      "none",
    ])
    .default("none"),
});

export const PASS_THRESHOLD = 7;
