/**
 * Contract: AI provider interface (constitution Principle V).
 * Target location: apps/web/src/server/ai/provider.ts (+ schemas in packages/shared).
 * This file is a design contract, not compiled code.
 *
 * Rules:
 * - The audit engine and UI depend only on these types; no provider SDK/HTTP types leak out.
 * - `ExplainInput` is built ONLY from a `SignedEvidenceV1` object whose MAC, kid, version, and
 *   expiry were verified first (research R6). No unsigned client-supplied value reaches a prompt.
 * - Adapters never throw for expected failures; they return a typed Result.
 * - Every adapter's raw output is parsed with `explanationOutputSchema(request)` before use,
 *   regardless of any provider-side schema enforcement.
 * - MVP ships exactly one adapter (OpenRouter). Gemini is out of MVP scope.
 */
import { z } from "zod";

export type Impact = "critical" | "serious" | "moderate" | "minor";

/**
 * Bounded, untrusted evidence for exactly one detected violation.
 * Field-for-field projection of verified SignedEvidenceV1 (minus v, kid, auditId, kind, issuedAt).
 * Limits were enforced at signing: ≤ 5 nodes, combined node text ≤ 6000 chars,
 * selector ≤ 500, help ≤ 500, description ≤ 1000.
 */
export interface ExplainInput {
  findingId: string;
  ruleId: string;
  impact: Impact;            // context only; output has no field to restate or change it
  help: string;
  description: string;
  wcag: string[];
  isBestPractice: boolean;
  finalUrl: string;
  nodes: Array<{ selector: string; html: string; failureSummary: string }>;
  nodesOmitted: number;
}

/** The only constructor of ExplainInput; callers must pass already-verified evidence. */
export type ToExplainInput = (verified: { readonly __verified: true } & Record<string, unknown>) => ExplainInput;

export interface ExplainOptions {
  signal: AbortSignal;       // enforces AI_TIMEOUT_MS
  maxOutputTokens: number;   // AI_MAX_OUTPUT_TOKENS
}

export type AiErrorKind =
  | "rate_limited"           // 429 (retryAfterSeconds when provided)
  | "quota_exhausted"        // 402
  | "unavailable"            // 502/503, network errors
  | "timeout"                // 408 or local abort
  | "invalid_output"         // schema failure, echo mismatch, provider error body with 200
  | "config_error";          // 401/403, missing key/model — logged, shown to user as unavailable

export type AiResult =
  | { ok: true; value: ExplanationOutput; usage?: { promptTokens: number; completionTokens: number } }
  | { ok: false; error: { kind: AiErrorKind; retryAfterSeconds?: number } };

export interface AiProvider {
  readonly id: "openrouter";  // widen to a union when a second adapter is added (post-MVP)
  readonly model: string;
  explainFinding(input: ExplainInput, options: ExplainOptions): Promise<AiResult>;
}

/** Selected by AI_PROVIDER env ("openrouter" default, "none" = disabled). Returns null when disabled/unconfigured. */
export type AiProviderFactory = (env: NodeJS.ProcessEnv) => AiProvider | null;

/**
 * Strict output schema. No severity/impact field exists, so the model cannot alter severity.
 * findingId and ruleId must echo the request exactly (FR-017).
 */
export const explanationOutputSchema = (req: Pick<ExplainInput, "findingId" | "ruleId">) =>
  z
    .object({
      findingId: z.literal(req.findingId),
      ruleId: z.literal(req.ruleId),
      explanation: z
        .object({
          summary: z.string().min(1).max(600),
          whoIsAffected: z.string().min(1).max(400),
          whyItMatters: z.string().min(1).max(600),
        })
        .strict(),
      suggestedFix: z
        .object({
          language: z.enum(["html", "css", "aria"]),
          code: z.string().min(1).max(2000),
          notes: z.string().max(600),
        })
        .strict(),
      needsHumanJudgment: z.boolean(),
    })
    .strict();

export type ExplanationOutput = z.infer<ReturnType<typeof explanationOutputSchema>>;
