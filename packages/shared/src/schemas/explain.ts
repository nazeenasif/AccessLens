// Explain request and response (task T032; public-api.openapi.yaml, research R6).
import { z } from "zod";
import { SignedEvidenceV1Schema } from "./evidence.ts";
import {
  AuditIdSchema,
  EvidenceSignatureSchema,
  FindingIdSchema,
  UtcDateTimeSchema,
} from "./primitives.ts";

/** Strict: unknown keys are rejected (INVALID_REQUEST, research R6 step 3). */
export const ExplainRequestSchema = z.strictObject({
  evidence: SignedEvidenceV1Schema,
  evidenceSignature: EvidenceSignatureSchema,
});
export type ExplainRequest = z.infer<typeof ExplainRequestSchema>;

export const ExplainResponseSchema = z.strictObject({
  auditId: AuditIdSchema,
  findingId: FindingIdSchema,
  explanation: z.strictObject({
    summary: z.string().min(1).max(600),
    whoIsAffected: z.string().min(1).max(400),
    whyItMatters: z.string().min(1).max(600),
  }),
  suggestedFix: z.strictObject({
    language: z.enum(["html", "css", "aria"]),
    code: z.string().min(1).max(2000),
    notes: z.string().max(600),
  }),
  needsHumanJudgment: z.boolean(),
  provider: z.string(),
  model: z.string(),
  generatedAt: UtcDateTimeSchema,
});
export type ExplainResponse = z.infer<typeof ExplainResponseSchema>;
