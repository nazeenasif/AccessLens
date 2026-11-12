// OpenAPI conformance test (task T030). For each component in
// specs/001-accesslens-mvp/contracts/public-api.openapi.yaml, valid and invalid sample payloads
// must get the same verdict from the Zod schema and from the contract (JSON Schema 2020-12, Ajv).
// Samples and the contract validator live in ../support/contract.ts.
//
// Not compared here: rules only Zod can express (summary counts recomputed from findings,
// completedAt ≥ startedAt; tested in schemas.test.ts) and the 6 000-character evidence node total
// (enforced by the evidence verifier after the MAC check).
//
// Exports expected from T032 (runtime Zod schemas; inferred types drop the "Schema" suffix):
//   schemas/audit.ts     AuditSchema, PartialReasonSchema
//   schemas/finding.ts   FindingSchema, AffectedNodeSchema, ImpactSchema
//   schemas/evidence.ts  SignedEvidenceV1Schema
//   schemas/events.ts    AuditEventSchema
//   schemas/explain.ts   ExplainRequestSchema, ExplainResponseSchema
//   schemas/errors.ts    ErrorCodeSchema, ErrorBodySchema
import { describe, expect, it } from "vitest";
import { AuditSchema, PartialReasonSchema } from "../../src/schemas/audit.ts";
import { ErrorBodySchema, ErrorCodeSchema } from "../../src/schemas/errors.ts";
import { AuditEventSchema } from "../../src/schemas/events.ts";
import { SignedEvidenceV1Schema } from "../../src/schemas/evidence.ts";
import { ExplainRequestSchema, ExplainResponseSchema } from "../../src/schemas/explain.ts";
import { AffectedNodeSchema, FindingSchema, ImpactSchema } from "../../src/schemas/finding.ts";
import { COMPONENTS, SAMPLES, contractAccepts } from "../support/contract.ts";

type Schema = { safeParse(value: unknown): { success: boolean } };

// Contract component name → Zod schema.
const ZOD: Record<string, Schema> = {
  ErrorCode: ErrorCodeSchema,
  ErrorBody: ErrorBodySchema,
  PartialReason: PartialReasonSchema,
  Impact: ImpactSchema,
  AuditEvent: AuditEventSchema,
  Audit: AuditSchema,
  Finding: FindingSchema,
  AffectedNode: AffectedNodeSchema,
  SignedEvidenceV1: SignedEvidenceV1Schema,
  ExplainRequest: ExplainRequestSchema,
  ExplainResponse: ExplainResponseSchema,
};

const NAMES = Object.keys(COMPONENTS).sort();

describe("coverage", () => {
  it("every contract component has a Zod schema, and nothing else does", () => {
    expect(Object.keys(ZOD).sort()).toEqual(NAMES);
  });

  it("every contract component has valid and invalid samples", () => {
    expect(Object.keys(SAMPLES).sort()).toEqual(NAMES);
    for (const name of NAMES) {
      const samples = SAMPLES[name] ?? [];
      expect(
        samples.some((s) => s.valid),
        `${name}: a valid sample`,
      ).toBe(true);
      expect(
        samples.some((s) => !s.valid),
        `${name}: an invalid sample`,
      ).toBe(true);
    }
  });
});

describe.each(NAMES)("%s: Zod and the contract give the same verdict", (name) => {
  it.each(SAMPLES[name] ?? [])("$label (valid: $valid)", ({ value, valid }) => {
    const zod = ZOD[name];
    if (!zod) throw new Error(`no Zod schema mapped for component ${name}`);
    const verdicts = { contract: contractAccepts(name, value), zod: zod.safeParse(value).success };
    expect(verdicts).toEqual({ contract: valid, zod: valid });
  });
});
