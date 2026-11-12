// Finding and AffectedNode (task T032; data-model.md).
// Two forms of a finding:
//   ScannerFindingSchema: as the scanner emits it; never carries evidence (scanner contract).
//   FindingSchema:        as the web service emits it; every violation carries signed evidence.
import { z } from "zod";
import { SignedEvidenceV1Schema } from "./evidence.ts";
import {
  EvidenceSignatureSchema,
  FindingIdSchema,
  HttpsUrlSchema,
  ImpactSchema,
} from "./primitives.ts";

export { ImpactSchema, type Impact } from "./primitives.ts";

export const AffectedNodeSchema = z.strictObject({
  target: z.array(z.string()).min(1),
  selector: z.string(),
  html: z.string().max(501), // 500 characters plus "…" when truncated
  failureSummary: z.string().max(1001), // 1000 characters plus "…" when truncated
});
export type AffectedNode = z.infer<typeof AffectedNodeSchema>;

const common = {
  id: FindingIdSchema,
  ruleId: z.string(),
  category: z.string(),
  isBestPractice: z.boolean(),
  wcag: z.array(z.string()),
  help: z.string(),
  description: z.string(),
  helpUrl: HttpsUrlSchema,
  nodes: z.array(AffectedNodeSchema).min(1).max(25),
  omittedNodeCount: z.int().nonnegative(),
};

// Impact is verbatim from axe and required for violations (FR-010); manual review may be null.
const violation = { ...common, kind: z.literal("violation"), impact: ImpactSchema };
const manualReview = {
  ...common,
  kind: z.literal("manual_review"),
  impact: ImpactSchema.nullable(),
};

const bestPracticeHasNoWcag = (finding: { isBestPractice: boolean; wcag: string[] }) =>
  !finding.isBestPractice || finding.wcag.length === 0;
const BEST_PRACTICE_RULE = {
  message: "best-practice findings map to no WCAG criteria",
  path: ["wcag"],
};

export const ScannerFindingSchema = z
  .discriminatedUnion("kind", [z.strictObject(violation), z.strictObject(manualReview)])
  .refine(bestPracticeHasNoWcag, BEST_PRACTICE_RULE);
export type ScannerFinding = z.infer<typeof ScannerFindingSchema>;

export const FindingSchema = z
  .discriminatedUnion("kind", [
    z.strictObject({
      ...violation,
      evidence: SignedEvidenceV1Schema,
      evidenceSignature: EvidenceSignatureSchema,
    }),
    z.strictObject(manualReview),
  ])
  .refine(bestPracticeHasNoWcag, BEST_PRACTICE_RULE);
export type Finding = z.infer<typeof FindingSchema>;
