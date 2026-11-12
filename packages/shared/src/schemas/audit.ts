// Audit (task T032; data-model.md). This is the Audit in API payloads: the browser-only
// `expiresAt` isn't part of it.
// Rules JSON Schema can't express are checked here too: summary counts recomputed from findings,
// completedAt ≥ startedAt, the exact engine tag set, and hosts-only blocked-request samples.
import { z } from "zod";
import { FindingSchema, type Finding } from "./finding.ts";
import { AuditIdSchema, UtcDateTimeSchema } from "./primitives.ts";

export const PartialReasonSchema = z.enum([
  "navigation_timeout",
  "request_limit_reached",
  "byte_limit_reached",
  "frames_not_inspected",
  "subresources_blocked",
]);
export type PartialReason = z.infer<typeof PartialReasonSchema>;

/** The axe tags every audit runs with, exactly (research R2). */
export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

const count = z.int().nonnegative();

// A host name or IPv4 address (dot-separated labels), or a bracketed IPv6 literal: no scheme,
// port, path, query, fragment, or user info. Same pattern as the contract.
const HostSchema = z
  .string()
  .max(255)
  .regex(
    /^(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*)$/,
    "must be a host only",
  );

type Summary = Record<
  "critical" | "serious" | "moderate" | "minor" | "bestPractice" | "manualReview",
  number
>;

// Severity counts cover violations only (manual review is never a violation, FR-012);
// bestPractice is the subset of violations flagged isBestPractice.
function countFindings(findings: Finding[]): Summary {
  const counts: Summary = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
    bestPractice: 0,
    manualReview: 0,
  };
  for (const finding of findings) {
    if (finding.kind === "manual_review") {
      counts.manualReview += 1;
      continue;
    }
    counts[finding.impact] += 1;
    if (finding.isBestPractice) counts.bestPractice += 1;
  }
  return counts;
}

export const AuditSchema = z
  .strictObject({
    id: AuditIdSchema,
    submittedUrl: z.string().max(2048),
    finalUrl: z.string().max(2048),
    startedAt: UtcDateTimeSchema,
    completedAt: UtcDateTimeSchema,
    status: z.enum(["complete", "partial"]),
    partialReasons: z.array(PartialReasonSchema),
    engine: z.strictObject({
      name: z.literal("axe-core"),
      version: z.string(),
      tags: z.array(z.string()),
    }),
    summary: z.strictObject({
      critical: count,
      serious: count,
      moderate: count,
      minor: count,
      bestPractice: count,
      manualReview: count,
      passesCount: count,
    }),
    blockedRequests: z.strictObject({
      count,
      sampleHosts: z.array(HostSchema).max(5),
    }),
    limitations: z.array(z.string()),
    findings: z.array(FindingSchema),
  })
  .superRefine((audit, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });

    if ((audit.status === "partial") !== audit.partialReasons.length > 0) {
      issue(["partialReasons"], "must be non-empty exactly when status is partial");
    }
    if (new Set(audit.partialReasons).size !== audit.partialReasons.length) {
      issue(["partialReasons"], "must not repeat a reason");
    }
    if (Date.parse(audit.completedAt) < Date.parse(audit.startedAt)) {
      issue(["completedAt"], "must not be before startedAt");
    }
    const tags = new Set(audit.engine.tags);
    if (
      audit.engine.tags.length !== AXE_TAGS.length ||
      tags.size !== AXE_TAGS.length ||
      !AXE_TAGS.every((tag) => tags.has(tag))
    ) {
      issue(["engine", "tags"], `must be exactly ${AXE_TAGS.join(", ")}`);
    }
    const expected = countFindings(audit.findings);
    for (const [field, value] of Object.entries(expected)) {
      if (audit.summary[field as keyof Summary] !== value) {
        issue(["summary", field], `must equal ${value}, recomputed from findings`);
      }
    }
  });
export type Audit = z.infer<typeof AuditSchema>;
