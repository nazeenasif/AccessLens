// Contract side of the OpenAPI conformance test (task T030): loads the public API contract,
// validates with JSON Schema 2020-12 (Ajv), and defines the sample payloads.
// Kept free of Zod imports so the samples can be checked against the contract on their own.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { parse } from "yaml";

const Ajv2020 = Ajv2020Module.default;
const addFormats = addFormatsModule.default;

export const CONTRACT_PATH = new URL(
  "../../../../specs/001-accesslens-mvp/contracts/public-api.openapi.yaml",
  import.meta.url,
);

type JsonObject = Record<string, unknown>;

const contract = parse(readFileSync(CONTRACT_PATH, "utf8")) as {
  components: { schemas: Record<string, JsonObject> };
};

/** Component schemas exactly as written in the contract. */
export const COMPONENTS = contract.components.schemas;

// OpenAPI 3.1 component refs (#/components/schemas/X) become $defs refs in one 2020-12 document.
function toDefsRefs(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toDefsRefs);
  if (node === null || typeof node !== "object") return node;
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => [
      key,
      key === "$ref" && typeof value === "string"
        ? value.replace("#/components/schemas/", "#/$defs/")
        : toDefsRefs(value),
    ]),
  );
}

const DOCUMENT_ID = "https://accesslens.invalid/contracts/public-api.json";
// strictTypes is off only because the contract's if/then branches omit `type`, as OpenAPI allows.
const ajv = new Ajv2020({ allErrors: true, strictTypes: false });
addFormats(ajv); // asserts uuid, date-time, and uri, which Zod also checks
ajv.addSchema({ $id: DOCUMENT_ID, $defs: toDefsRefs(COMPONENTS) as JsonObject });

/** The contract's verdict on `value` for component `name`. */
export function contractAccepts(name: string, value: unknown): boolean {
  const validate = ajv.getSchema(`${DOCUMENT_ID}#/$defs/${name}`);
  if (!validate) throw new Error(`no component "${name}" in ${CONTRACT_PATH.pathname}`);
  return validate(value) === true;
}

function contractEnum(name: string): string[] {
  const values = COMPONENTS[name]?.enum;
  if (!Array.isArray(values)) throw new Error(`component "${name}" has no enum`);
  return values.map(String);
}

// ---------------------------------------------------------------------------------------------
// Sample payloads. Every valid sample also satisfies the data-model rules that JSON Schema can't
// express (summary counts match findings, completedAt ≥ startedAt), so Zod has no extra reason
// to reject it. Each invalid sample breaks exactly one rule that the contract expresses.

export type Sample = { label: string; value: unknown; valid: boolean };
const ok = (label: string, value: unknown): Sample => ({ label, value, valid: true });
const bad = (label: string, value: unknown): Sample => ({ label, value, valid: false });

type Fields = Record<string, unknown>;
const text = (length: number) => "x".repeat(length);
const without = (value: Fields, ...keys: string[]): Fields => {
  const copy = { ...value };
  for (const key of keys) delete copy[key];
  return copy;
};
const findingId = (kind: string, ruleId: string) =>
  createHash("sha256").update(`${kind}:${ruleId}`).digest("hex").slice(0, 16);

const AUDIT_ID = "3f2b8c1e-4d5a-4b6c-8e7f-9a0b1c2d3e4f";
const SIGNATURE = Buffer.alloc(32, 7).toString("base64url"); // 43 base64url characters
const R2_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const IMAGE_ALT_ID = findingId("violation", "image-alt");
const REGION_ID = findingId("violation", "region");

const node = (over: Fields = {}): Fields => ({
  target: ["#main > img"],
  selector: "#main > img",
  html: '<img src="hero.png">',
  failureSummary: "Fix any of the following:\n  Element does not have an alt attribute",
  ...over,
});
const evidenceNode = (over: Fields = {}): Fields => without(node(over), "target");

const evidence = (over: Fields = {}): Fields => ({
  v: 1,
  kid: "0a1b2c3d",
  auditId: AUDIT_ID,
  findingId: IMAGE_ALT_ID,
  kind: "violation",
  ruleId: "image-alt",
  impact: "critical",
  help: "Images must have alternative text",
  description: "Ensure <img> elements have alternative text or a role of none or presentation",
  wcag: ["1.1.1"],
  isBestPractice: false,
  finalUrl: "https://example.com/",
  nodes: [evidenceNode()],
  nodesOmitted: 0,
  issuedAt: "2026-11-11T10:00:00Z",
  ...over,
});

const violation = (over: Fields = {}): Fields => ({
  id: IMAGE_ALT_ID,
  kind: "violation",
  ruleId: "image-alt",
  impact: "critical",
  category: "Text alternatives",
  isBestPractice: false,
  wcag: ["1.1.1"],
  help: "Images must have alternative text",
  description: "Ensure <img> elements have alternative text or a role of none or presentation",
  helpUrl: "https://dequeuniversity.com/rules/axe/4.14/image-alt?application=axeAPI",
  nodes: [node()],
  omittedNodeCount: 0,
  evidence: evidence(),
  evidenceSignature: SIGNATURE,
  ...over,
});

const bestPractice = (over: Fields = {}): Fields =>
  violation({
    id: REGION_ID,
    ruleId: "region",
    impact: "moderate",
    category: "Keyboard",
    isBestPractice: true,
    wcag: [],
    help: "All page content should be contained by landmarks",
    description: "Ensure all page content is contained by landmarks",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.14/region?application=axeAPI",
    evidence: evidence({
      findingId: REGION_ID,
      ruleId: "region",
      impact: "moderate",
      help: "All page content should be contained by landmarks",
      description: "Ensure all page content is contained by landmarks",
      wcag: [],
      isBestPractice: true,
    }),
    ...over,
  });

const manualReview = (over: Fields = {}): Fields => ({
  id: findingId("manual_review", "color-contrast"),
  kind: "manual_review",
  ruleId: "color-contrast",
  impact: "serious",
  category: "Color & contrast",
  isBestPractice: false,
  wcag: ["1.4.3"],
  help: "Elements must meet minimum color contrast ratio thresholds",
  description:
    "Ensure the contrast between foreground and background colors meets WCAG 2 AA thresholds",
  helpUrl: "https://dequeuniversity.com/rules/axe/4.14/color-contrast?application=axeAPI",
  nodes: [node()],
  omittedNodeCount: 0,
  ...over,
});

// Matches the three findings below (FR-012: the manual review counts in no severity).
const SUMMARY = {
  critical: 1,
  serious: 0,
  moderate: 1,
  minor: 0,
  bestPractice: 1,
  manualReview: 1,
  passesCount: 42,
};

const audit = (over: Fields = {}): Fields => ({
  id: AUDIT_ID,
  submittedUrl: "https://example.com/",
  finalUrl: "https://example.com/",
  startedAt: "2026-11-11T10:00:00Z",
  completedAt: "2026-11-11T10:00:12Z",
  status: "complete",
  partialReasons: [],
  engine: { name: "axe-core", version: "4.14.0", tags: [...R2_TAGS] },
  summary: { ...SUMMARY },
  blockedRequests: { count: 0, sampleHosts: [] },
  limitations: [],
  findings: [violation(), bestPractice(), manualReview()],
  ...over,
});

const withTags = (tags: string[]): Fields =>
  audit({ engine: { name: "axe-core", version: "4.14.0", tags } });
const withHosts = (sampleHosts: string[]): Fields =>
  audit({ blockedRequests: { count: sampleHosts.length, sampleHosts } });

const errorBody = (over: Fields = {}): Fields => ({
  code: "SCAN_DISABLED",
  message: "Live scanning is turned off. The demo is still available.",
  ...over,
});

const EXPLANATION = {
  summary: "The image has no text alternative.",
  whoIsAffected: "People using screen readers.",
  whyItMatters: "They can't tell what the image shows or whether it matters.",
};
const FIX = {
  language: "html",
  code: '<img src="hero.png" alt="Team photo at the launch event">',
  notes: "Describe what the image conveys in this context.",
};
const explainResponse = (over: Fields = {}): Fields => ({
  auditId: AUDIT_ID,
  findingId: IMAGE_ALT_ID,
  explanation: { ...EXPLANATION },
  suggestedFix: { ...FIX },
  needsHumanJudgment: true,
  provider: "openrouter",
  model: "example/model",
  generatedAt: "2026-11-11T10:00:05Z",
  ...over,
});

const many = (count: number, make: () => Fields) => Array.from({ length: count }, make);

/** Samples per contract component. Keys must match the contract's component names exactly. */
export const SAMPLES: Record<string, Sample[]> = {
  ErrorCode: [
    ...contractEnum("ErrorCode").map((code) => ok(code, code)),
    bad("an unknown code", "FAILED"),
    bad("a lowercase code", "dom_too_large"),
    bad("an empty string", ""),
  ],
  ErrorBody: [
    ok("code and message", errorBody()),
    ok("with retryAfterSeconds", errorBody({ code: "RATE_LIMITED", retryAfterSeconds: 30 })),
    ok("with detail", errorBody({ code: "TARGET_HTTP_ERROR", detail: { httpStatus: 404 } })),
    bad("missing message", without(errorBody(), "message")),
    bad("an unknown code", errorBody({ code: "FAILED" })),
    bad("a negative retryAfterSeconds", errorBody({ retryAfterSeconds: -1 })),
    bad("a fractional retryAfterSeconds", errorBody({ retryAfterSeconds: 1.5 })),
    bad("an unknown key", errorBody({ stack: "Error: at scanner" })),
  ],
  PartialReason: [
    ...contractEnum("PartialReason").map((reason) => ok(reason, reason)),
    bad("an unknown reason", "timeout"),
  ],
  Impact: [
    ...contractEnum("Impact").map((impact) => ok(impact, impact)),
    bad("null", null),
    bad("an unknown impact", "blocker"),
  ],
  AffectedNode: [
    ok("a node", node()),
    ok("html of 501 characters", node({ html: `${text(500)}…` })),
    ok("a failureSummary of 1001 characters", node({ failureSummary: `${text(1000)}…` })),
    bad("html of 502 characters", node({ html: `${text(501)}…` })),
    bad("a failureSummary of 1002 characters", node({ failureSummary: `${text(1001)}…` })),
    bad("an empty target", node({ target: [] })),
    bad("missing selector", without(node(), "selector")),
    bad("an unknown key", node({ outerHTML: "<img>" })),
  ],
  SignedEvidenceV1: [
    ok("evidence", evidence()),
    ok("5 nodes", evidence({ nodes: many(5, () => evidenceNode()) })),
    ok("10 WCAG criteria", evidence({ wcag: many(10, () => ({})).map(() => "1.1.1") })),
    bad("v 2", evidence({ v: 2 })),
    bad("an uppercase kid", evidence({ kid: "0A1B2C3D" })),
    bad("a 7-character kid", evidence({ kid: "0a1b2c3" })),
    bad("an auditId that isn't a UUID", evidence({ auditId: "audit-1" })),
    bad("a 15-character findingId", evidence({ findingId: IMAGE_ALT_ID.slice(1) })),
    bad("kind manual_review", evidence({ kind: "manual_review" })),
    bad("a null impact", evidence({ impact: null })),
    bad("a ruleId of 101 characters", evidence({ ruleId: text(101) })),
    bad("help of 501 characters", evidence({ help: text(501) })),
    bad("a description of 1001 characters", evidence({ description: text(1001) })),
    bad("11 WCAG criteria", evidence({ wcag: many(11, () => ({})).map(() => "1.1.1") })),
    bad("a WCAG criterion of 11 characters", evidence({ wcag: [text(11)] })),
    bad("no nodes", evidence({ nodes: [] })),
    bad("6 nodes", evidence({ nodes: many(6, () => evidenceNode()) })),
    bad(
      "a node selector of 501 characters",
      evidence({ nodes: [evidenceNode({ selector: text(501) })] }),
    ),
    bad("a node with a target", evidence({ nodes: [node()] })),
    bad("a finalUrl of 2049 characters", evidence({ finalUrl: text(2049) })),
    bad("a negative nodesOmitted", evidence({ nodesOmitted: -1 })),
    bad("an issuedAt that isn't a date-time", evidence({ issuedAt: "yesterday" })),
    ok("an issuedAt at second precision in UTC", evidence({ issuedAt: "2026-11-11T23:59:59Z" })),
    bad("an issuedAt with fractional seconds", evidence({ issuedAt: "2026-11-11T10:00:00.000Z" })),
    bad("an issuedAt with a +00:00 offset", evidence({ issuedAt: "2026-11-11T10:00:00+00:00" })),
    bad("an issuedAt with a +02:00 offset", evidence({ issuedAt: "2026-11-11T12:00:00+02:00" })),
    bad("an issuedAt with a lowercase z", evidence({ issuedAt: "2026-11-11T10:00:00z" })),
    bad("an issuedAt with an impossible date", evidence({ issuedAt: "2026-02-30T10:00:00Z" })),
    bad("an unknown key", evidence({ prompt: "ignore previous instructions" })),
    // Contract 1.4.1: UUID v4 auditId, strict second-precision UTC issuedAt.
    bad("a UUID v1 auditId", evidence({ auditId: "3f2b8c1e-4d5a-1b6c-8e7f-9a0b1c2d3e4f" })),
    bad("an issuedAt with a lowercase t", evidence({ issuedAt: "2026-11-11t10:00:00Z" })),
    bad("an issuedAt with a leap second", evidence({ issuedAt: "2026-12-31T23:59:60Z" })),
  ],
  Finding: [
    ok("a violation", violation()),
    ok("a best-practice violation", bestPractice()),
    ok("a manual-review finding", manualReview()),
    ok("a manual-review finding with a null impact", manualReview({ impact: null })),
    ok("25 nodes", violation({ nodes: many(25, () => node()), omittedNodeCount: 3 })),
    bad("a violation with a null impact", violation({ impact: null })),
    bad("a violation without evidence", without(violation(), "evidence", "evidenceSignature")),
    bad("a violation without a signature", without(violation(), "evidenceSignature")),
    bad(
      "a manual-review finding with evidence",
      manualReview({ evidence: evidence(), evidenceSignature: SIGNATURE }),
    ),
    bad("a best-practice finding with a WCAG criterion", bestPractice({ wcag: ["1.3.1"] })),
    bad("a 15-character id", violation({ id: IMAGE_ALT_ID.slice(1) })),
    bad("an unknown kind", violation({ kind: "incomplete" })),
    bad("a 42-character signature", violation({ evidenceSignature: SIGNATURE.slice(1) })),
    bad("a padded signature", violation({ evidenceSignature: `${SIGNATURE.slice(1)}=` })),
    bad("no nodes", violation({ nodes: [] })),
    bad("26 nodes", violation({ nodes: many(26, () => node()) })),
    bad("a negative omittedNodeCount", violation({ omittedNodeCount: -1 })),
    bad("a helpUrl that isn't a URI", violation({ helpUrl: "not a url" })),
    bad(
      "an http helpUrl",
      violation({ helpUrl: "http://dequeuniversity.com/rules/axe/4.14/image-alt" }),
    ),
    bad("an ftp helpUrl", violation({ helpUrl: "ftp://example.com/rules/image-alt" })),
    bad(
      "an uppercase HTTPS:// helpUrl (the scheme check is case-sensitive)",
      violation({ helpUrl: "HTTPS://dequeuniversity.com/rules/axe/4.14/image-alt" }),
    ),
    bad("an https helpUrl that isn't a URI", violation({ helpUrl: "https://example.com/a b" })),
    bad("an unknown key", violation({ aiSeverity: "low" })),
  ],
  Audit: [
    ok("a complete audit", audit()),
    ok(
      "a partial audit",
      audit({ status: "partial", partialReasons: ["navigation_timeout", "frames_not_inspected"] }),
    ),
    ok(
      "an audit with no findings",
      audit({
        findings: [],
        summary: { ...SUMMARY, critical: 0, moderate: 0, bestPractice: 0, manualReview: 0 },
      }),
    ),
    ok(
      "5 sample hosts",
      audit({
        blockedRequests: {
          count: 9,
          sampleHosts: many(5, () => ({})).map((_, i) => `cdn${i}.example.net`),
        },
      }),
    ),
    bad("a partial audit with no reasons", audit({ status: "partial", partialReasons: [] })),
    bad("a complete audit with a reason", audit({ partialReasons: ["navigation_timeout"] })),
    bad(
      "a duplicate partial reason",
      audit({ status: "partial", partialReasons: ["navigation_timeout", "navigation_timeout"] }),
    ),
    bad("status failed", audit({ status: "failed" })),
    bad("an id that isn't a UUID", audit({ id: "audit-1" })),
    bad("a submittedUrl of 2049 characters", audit({ submittedUrl: text(2049) })),
    bad("a startedAt that isn't a date-time", audit({ startedAt: "today" })),
    ok("a startedAt with fractional seconds", audit({ startedAt: "2026-11-11T10:00:00.250Z" })),
    bad("a startedAt with a +00:00 offset", audit({ startedAt: "2026-11-11T10:00:00+00:00" })),
    bad("a completedAt with a -05:00 offset", audit({ completedAt: "2026-11-11T05:00:12-05:00" })),
    bad("a startedAt with a lowercase z", audit({ startedAt: "2026-11-11T10:00:00z" })),
    bad("a startedAt without a time zone", audit({ startedAt: "2026-11-11T10:00:00" })),
    bad("a completedAt with an impossible time", audit({ completedAt: "2026-11-11T25:00:12Z" })),
    bad(
      "an engine other than axe-core",
      audit({ engine: { name: "axe", version: "4.14.0", tags: [...R2_TAGS] } }),
    ),
    bad("a negative summary count", audit({ summary: { ...SUMMARY, passesCount: -1 } })),
    bad("a fractional summary count", audit({ summary: { ...SUMMARY, passesCount: 1.5 } })),
    bad(
      "6 sample hosts",
      audit({
        blockedRequests: {
          count: 9,
          sampleHosts: many(6, () => ({})).map((_, i) => `cdn${i}.example.net`),
        },
      }),
    ),
    bad("a browser-only expiresAt", audit({ expiresAt: "2026-11-18T10:00:12Z" })),
    bad(
      "an invalid finding",
      audit({ findings: [violation({ impact: null }), bestPractice(), manualReview()] }),
    ),
    // Contract 1.4.1: UUID v4 ids, strict UTC date-times, exact R2 tags, hosts-only samples.
    ok("an uppercase UUID v4 id", audit({ id: AUDIT_ID.toUpperCase() })),
    bad("a UUID v1 id", audit({ id: "3f2b8c1e-4d5a-1b6c-8e7f-9a0b1c2d3e4f" })),
    bad("the nil UUID", audit({ id: "00000000-0000-0000-0000-000000000000" })),
    bad("a urn:uuid: id", audit({ id: `urn:uuid:${AUDIT_ID}` })),
    bad("a v4 id with an invalid variant", audit({ id: "3f2b8c1e-4d5a-4b6c-7e7f-9a0b1c2d3e4f" })),
    bad("a startedAt with a lowercase t", audit({ startedAt: "2026-11-11t10:00:00Z" })),
    bad("a startedAt with a space separator", audit({ startedAt: "2026-11-11 10:00:00Z" })),
    bad("a startedAt without seconds", audit({ startedAt: "2026-11-11T10:00Z" })),
    bad("a completedAt with a leap second", audit({ completedAt: "2026-12-31T23:59:60Z" })),
    ok("the R2 tags in another order", withTags([...R2_TAGS].reverse())),
    bad("a wrong engine tag", withTags(R2_TAGS.map((t) => (t === "wcag22aa" ? "wcag22a" : t)))),
    bad("an extra engine tag", withTags([...R2_TAGS, "wcag22a"])),
    bad("a duplicate engine tag", withTags([...R2_TAGS.slice(0, -1), "wcag2a"])),
    bad("a missing engine tag", withTags(R2_TAGS.filter((t) => t !== "best-practice"))),
    ok("IPv4 and IPv6 sample hosts", withHosts(["203.0.113.7", "[2001:db8::1]"])),
    bad("a sample host with a scheme", withHosts(["https://cdn.example.net"])),
    bad("a sample host with a port", withHosts(["cdn.example.net:8443"])),
    bad("a sample host with a path", withHosts(["cdn.example.net/app.js"])),
    bad("a sample host with a query", withHosts(["cdn.example.net?v=1"])),
    bad("a sample host with user info", withHosts(["user@cdn.example.net"])),
  ],
  AuditEvent: [
    ok("progress", { type: "progress", stage: "loading" }),
    ok("progress with a queue position", { type: "progress", stage: "queued", queuePosition: 2 }),
    ok("a result", { type: "result", audit: audit() }),
    ok("an error", {
      type: "error",
      error: errorBody({ code: "BLOCKED_DESTINATION", message: "That address can't be audited." }),
    }),
    bad("queue position 0", { type: "progress", stage: "queued", queuePosition: 0 }),
    bad("an unknown stage", { type: "progress", stage: "done" }),
    bad("a result with an invalid audit", { type: "result", audit: audit({ status: "failed" }) }),
    bad("a result whose audit has an offset startedAt", {
      type: "result",
      audit: audit({ startedAt: "2026-11-11T10:00:00+00:00" }),
    }),
    bad("an error with an unknown code", { type: "error", error: errorBody({ code: "FAILED" }) }),
    bad("an unknown type", { type: "complete", audit: audit() }),
    bad("progress with an unknown key", { type: "progress", stage: "loading", percent: 50 }),
  ],
  ExplainRequest: [
    ok("evidence and signature", { evidence: evidence(), evidenceSignature: SIGNATURE }),
    bad("missing evidence", { evidenceSignature: SIGNATURE }),
    bad("missing signature", { evidence: evidence() }),
    bad("invalid evidence", { evidence: evidence({ v: 2 }), evidenceSignature: SIGNATURE }),
    bad("a 44-character signature", { evidence: evidence(), evidenceSignature: `${SIGNATURE}A` }),
    bad("an unknown key", { evidence: evidence(), evidenceSignature: SIGNATURE, model: "other" }),
  ],
  ExplainResponse: [
    ok("a response", explainResponse()),
    ok("empty fix notes", explainResponse({ suggestedFix: { ...FIX, notes: "" } })),
    ok(
      "a generatedAt with fractional seconds",
      explainResponse({ generatedAt: "2026-11-11T10:00:05.123Z" }),
    ),
    bad("an empty summary", explainResponse({ explanation: { ...EXPLANATION, summary: "" } })),
    bad(
      "a summary of 601 characters",
      explainResponse({ explanation: { ...EXPLANATION, summary: text(601) } }),
    ),
    bad(
      "whoIsAffected of 401 characters",
      explainResponse({ explanation: { ...EXPLANATION, whoIsAffected: text(401) } }),
    ),
    bad(
      "whyItMatters of 601 characters",
      explainResponse({ explanation: { ...EXPLANATION, whyItMatters: text(601) } }),
    ),
    bad("an empty fix", explainResponse({ suggestedFix: { ...FIX, code: "" } })),
    bad(
      "a fix of 2001 characters",
      explainResponse({ suggestedFix: { ...FIX, code: text(2001) } }),
    ),
    bad(
      "fix notes of 601 characters",
      explainResponse({ suggestedFix: { ...FIX, notes: text(601) } }),
    ),
    bad("an unknown fix language", explainResponse({ suggestedFix: { ...FIX, language: "js" } })),
    bad("missing needsHumanJudgment", without(explainResponse(), "needsHumanJudgment")),
    bad("an auditId that isn't a UUID", explainResponse({ auditId: "audit-1" })),
    bad("an unknown key", explainResponse({ severity: "low" })),
    bad(
      "a generatedAt with a +01:00 offset",
      explainResponse({ generatedAt: "2026-11-11T11:00:05+01:00" }),
    ),
    bad(
      "a generatedAt without a time zone",
      explainResponse({ generatedAt: "2026-11-11T10:00:05" }),
    ),
    // Contract 1.4.1: UUID v4 auditId, 16-hex findingId, strict UTC generatedAt.
    bad(
      "the nil UUID as auditId",
      explainResponse({ auditId: "00000000-0000-0000-0000-000000000000" }),
    ),
    bad("a findingId that isn't 16 hex characters", explainResponse({ findingId: "image-alt" })),
    bad("an uppercase findingId", explainResponse({ findingId: IMAGE_ALT_ID.toUpperCase() })),
    bad(
      "a generatedAt with a leap second",
      explainResponse({ generatedAt: "2026-12-31T23:59:60Z" }),
    ),
  ],
};
