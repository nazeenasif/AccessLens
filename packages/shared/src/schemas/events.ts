// NDJSON audit stream events (task T032; public-api.openapi.yaml). A stream ends with exactly one
// terminal event: `result` (complete or partial Audit) or `error` (no Audit).
import { z } from "zod";
import { AuditSchema } from "./audit.ts";
import { ErrorBodySchema } from "./errors.ts";

export const AuditEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("progress"),
    stage: z.enum(["validating", "queued", "loading", "analyzing"]),
    queuePosition: z.int().min(1).optional(),
  }),
  z.strictObject({ type: z.literal("result"), audit: AuditSchema }),
  z.strictObject({ type: z.literal("error"), error: ErrorBodySchema }),
]);
export type AuditEvent = z.infer<typeof AuditEventSchema>;
