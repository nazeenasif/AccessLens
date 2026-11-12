// Error codes and the error body (task T032; public-api.openapi.yaml, research R5 and R6).
import { z } from "zod";

export const ErrorCodeSchema = z.enum([
  // URL / destination (FR-001–FR-005)
  "INVALID_URL",
  "UNSUPPORTED_SCHEME",
  "CREDENTIALS_IN_URL",
  "PORT_NOT_ALLOWED",
  "BLOCKED_DESTINATION",
  "BLOCKED_REDIRECT",
  "TOO_MANY_REDIRECTS",
  // Target behaviour: used only when no valid results exist (research R5)
  "TARGET_UNREACHABLE",
  "TARGET_HTTP_ERROR",
  "NOT_HTML",
  "NAVIGATION_TIMEOUT",
  "AUDIT_TIMEOUT",
  "LIMIT_EXCEEDED",
  "DOM_TOO_LARGE",
  // Capacity / availability
  "RATE_LIMITED",
  "SCANNER_BUSY",
  "SCANNER_FAILURE",
  "SCAN_DISABLED",
  // Explain
  "INVALID_REQUEST",
  "PAYLOAD_TOO_LARGE",
  "EVIDENCE_INVALID",
  "EVIDENCE_EXPIRED",
  "EXPLAIN_RATE_LIMITED",
  "AUDIT_AI_LIMIT_REACHED",
  "AI_BUDGET_EXHAUSTED",
  "AI_INVALID_OUTPUT",
  "AI_UNAVAILABLE",
  "AI_TIMEOUT",
  "AI_DISABLED",
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorBodySchema = z.strictObject({
  code: ErrorCodeSchema,
  /** User-safe: never secrets, stack traces, or internal hosts. */
  message: z.string(),
  retryAfterSeconds: z.int().nonnegative().optional(),
  /** Optional safe context, e.g. { httpStatus: 404 }. */
  detail: z.record(z.string(), z.unknown()).optional(),
});
export type ErrorBody = z.infer<typeof ErrorBodySchema>;
