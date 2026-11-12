// SignedEvidenceV1 (task T032; data-model.md, research R6). The exact set of values the AI prompt
// may use. The web service creates and signs it; clients store and resend it unchanged.
// The 6 000-character total over node text is checked by the evidence verifier after the MAC
// check (contract), not here.
import { z } from "zod";
import { AuditIdSchema, FindingIdSchema, ImpactSchema, UtcSecondsSchema } from "./primitives.ts";

const EvidenceNodeSchema = z.strictObject({
  selector: z.string().max(500),
  html: z.string().max(501),
  failureSummary: z.string().max(1001),
});

export const SignedEvidenceV1Schema = z.strictObject({
  v: z.literal(1),
  kid: z.string().regex(/^[0-9a-f]{8}$/),
  auditId: AuditIdSchema,
  findingId: FindingIdSchema,
  kind: z.literal("violation"),
  ruleId: z.string().max(100),
  impact: ImpactSchema,
  help: z.string().max(500),
  description: z.string().max(1000),
  wcag: z.array(z.string().max(10)).max(10),
  isBestPractice: z.boolean(),
  finalUrl: z.string().max(2048),
  nodes: z.array(EvidenceNodeSchema).min(1).max(5),
  nodesOmitted: z.int().nonnegative(),
  issuedAt: UtcSecondsSchema,
});
export type SignedEvidenceV1 = z.infer<typeof SignedEvidenceV1Schema>;
