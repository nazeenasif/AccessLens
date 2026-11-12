// Schema tests (task T029). The rules come from specs/001-accesslens-mvp/data-model.md, which wins
// over the OpenAPI contracts on any mismatch. Each rule is checked against a valid baseline first,
// so a rejection can't pass for an unrelated reason.
//
// Exports expected from T032 (runtime Zod schemas; inferred types drop the "Schema" suffix):
//   schemas/audit.ts     AuditSchema             → type Audit (web output: the public API's Audit)
//   schemas/finding.ts   FindingSchema           → type Finding (web output: violations carry signed evidence)
//                        ScannerFindingSchema    → type ScannerFinding (scanner output: no evidence)
//                        AffectedNodeSchema      → type AffectedNode
//   schemas/evidence.ts  SignedEvidenceV1Schema  → type SignedEvidenceV1
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AuditSchema } from "../../src/schemas/audit.ts";
import { SignedEvidenceV1Schema } from "../../src/schemas/evidence.ts";
import {
  AffectedNodeSchema,
  FindingSchema,
  ScannerFindingSchema,
} from "../../src/schemas/finding.ts";

type Schema = { safeParse(value: unknown): { success: boolean; error?: { issues: unknown[] } } };
type Fields = Record<string, unknown>;

function accepts(schema: Schema, value: unknown): void {
  const result = schema.safeParse(value);
  expect(result.success, JSON.stringify(result.error?.issues ?? [])).toBe(true);
}

function rejects(schema: Schema, value: unknown): void {
  expect(schema.safeParse(value).success).toBe(false);
}

function without(value: Fields, ...keys: string[]): Fields {
  const copy = { ...value };
  for (const key of keys) delete copy[key];
  return copy;
}

const text = (length: number) => "x".repeat(length);

// Finding.id = sha256(kind + ":" + ruleId), truncated to 16 hex characters.
const findingId = (kind: string, ruleId: string) =>
  createHash("sha256").update(`${kind}:${ruleId}`).digest("hex").slice(0, 16);

const AUDIT_ID = "3f2b8c1e-4d5a-4b6c-8e7f-9a0b1c2d3e4f";
// 32 bytes as unpadded base64url: 43 characters, like an HMAC-SHA256 tag.
const SIGNATURE = Buffer.alloc(32, 7).toString("base64url");
const R2_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

const node = (over: Fields = {}): Fields => ({
  target: ["#main > img"],
  selector: "#main > img",
  html: '<img src="hero.png">',
  failureSummary: "Fix any of the following:\n  Element does not have an alt attribute",
  ...over,
});

const evidenceNode = (over: Fields = {}): Fields => without(node(over), "target");

const IMAGE_ALT = {
  kind: "violation",
  ruleId: "image-alt",
  impact: "critical",
  category: "Text alternatives",
  isBestPractice: false,
  wcag: ["1.1.1"],
  help: "Images must have alternative text",
  description: "Ensure <img> elements have alternative text or a role of none or presentation",
  helpUrl: "https://dequeuniversity.com/rules/axe/4.14/image-alt?application=axeAPI",
} as const;

const REGION = {
  kind: "violation",
  ruleId: "region",
  impact: "moderate",
  category: "Keyboard",
  isBestPractice: true,
  wcag: [],
  help: "All page content should be contained by landmarks",
  description: "Ensure all page content is contained by landmarks",
  helpUrl: "https://dequeuniversity.com/rules/axe/4.14/region?application=axeAPI",
} as const;

const COLOR_CONTRAST = {
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
} as const;

const evidence = (over: Fields = {}): Fields => ({
  v: 1,
  kid: "0a1b2c3d",
  auditId: AUDIT_ID,
  findingId: findingId(IMAGE_ALT.kind, IMAGE_ALT.ruleId),
  kind: "violation",
  ruleId: IMAGE_ALT.ruleId,
  impact: IMAGE_ALT.impact,
  help: IMAGE_ALT.help,
  description: IMAGE_ALT.description,
  wcag: [...IMAGE_ALT.wcag],
  isBestPractice: IMAGE_ALT.isBestPractice,
  finalUrl: "https://example.com/",
  nodes: [evidenceNode()],
  nodesOmitted: 0,
  issuedAt: "2026-11-11T10:00:00Z",
  ...over,
});

type Rule = typeof IMAGE_ALT | typeof REGION | typeof COLOR_CONTRAST;

/** A finding as the scanner emits it: never any evidence. */
const scannerFinding = (rule: Rule, over: Fields = {}): Fields => ({
  id: findingId(rule.kind, rule.ruleId),
  ...rule,
  wcag: [...rule.wcag],
  nodes: [node()],
  omittedNodeCount: 0,
  ...over,
});

/** A finding as the web service emits it: violations carry signed evidence. */
const webFinding = (rule: Rule, over: Fields = {}): Fields => {
  if (rule.kind !== "violation") return scannerFinding(rule, over);
  const signed = evidence({
    findingId: findingId(rule.kind, rule.ruleId),
    ruleId: rule.ruleId,
    impact: rule.impact,
    help: rule.help,
    description: rule.description,
    wcag: [...rule.wcag],
    isBestPractice: rule.isBestPractice,
  });
  return scannerFinding(rule, { evidence: signed, evidenceSignature: SIGNATURE, ...over });
};

// IMAGE_ALT: critical violation. REGION: moderate best-practice violation.
// COLOR_CONTRAST: manual review with impact "serious", which no severity count includes (FR-012).
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
  findings: [webFinding(IMAGE_ALT), webFinding(REGION), webFinding(COLOR_CONTRAST)],
  ...over,
});

describe("Audit", () => {
  it("accepts the baseline audit", () => {
    accepts(AuditSchema, audit());
  });

  describe("partialReasons is non-empty iff status is partial", () => {
    it("accepts a complete audit with no partial reasons", () => {
      accepts(AuditSchema, audit({ status: "complete", partialReasons: [] }));
    });

    it("rejects a complete audit with a partial reason", () => {
      rejects(AuditSchema, audit({ status: "complete", partialReasons: ["navigation_timeout"] }));
    });

    it("accepts a partial audit with a partial reason", () => {
      accepts(AuditSchema, audit({ status: "partial", partialReasons: ["navigation_timeout"] }));
    });

    it("rejects a partial audit with no partial reasons", () => {
      rejects(AuditSchema, audit({ status: "partial", partialReasons: [] }));
    });
  });

  describe("summary counts equal the counts recomputed from findings", () => {
    it("accepts an audit with no findings and zero counts", () => {
      const zero = { ...SUMMARY, critical: 0, moderate: 0, bestPractice: 0, manualReview: 0 };
      accepts(AuditSchema, audit({ findings: [], summary: zero }));
    });

    it.each(["critical", "serious", "moderate", "minor", "bestPractice", "manualReview"] as const)(
      "rejects a summary whose %s count is off by one",
      (field) => {
        rejects(AuditSchema, audit({ summary: { ...SUMMARY, [field]: SUMMARY[field] + 1 } }));
      },
    );

    it("rejects counting a manual-review finding's impact as a violation severity", () => {
      rejects(AuditSchema, audit({ summary: { ...SUMMARY, serious: 1, manualReview: 0 } }));
    });

    it("rejects leaving a best-practice violation out of its severity count", () => {
      rejects(AuditSchema, audit({ summary: { ...SUMMARY, moderate: 0 } }));
    });
  });

  describe("completedAt is not before startedAt", () => {
    it("accepts completedAt equal to startedAt", () => {
      accepts(AuditSchema, audit({ completedAt: "2026-11-11T10:00:00Z" }));
    });

    it("rejects completedAt before startedAt", () => {
      rejects(AuditSchema, audit({ completedAt: "2026-11-11T09:59:59Z" }));
    });
  });

  describe("engine.tags is exactly the research R2 tag set", () => {
    const withTags = (tags: string[]) =>
      audit({ engine: { name: "axe-core", version: "4.14.0", tags } });

    it("accepts the R2 tags in another order", () => {
      accepts(AuditSchema, withTags([...R2_TAGS].reverse()));
    });

    it.each([
      ["a wrong tag", R2_TAGS.map((tag) => (tag === "wcag22aa" ? "wcag22a" : tag))],
      ["an extra tag", [...R2_TAGS, "wcag22a"]],
      ["a duplicate tag", [...R2_TAGS.slice(0, -1), "wcag2a"]],
      ["a missing tag", R2_TAGS.filter((tag) => tag !== "best-practice")],
    ])("rejects %s", (_case, tags) => {
      rejects(AuditSchema, withTags(tags));
    });
  });

  describe("blockedRequests.sampleHosts holds hosts only", () => {
    const withHosts = (sampleHosts: string[]) =>
      audit({ blockedRequests: { count: sampleHosts.length, sampleHosts } });

    it("accepts host names and IP addresses", () => {
      accepts(AuditSchema, withHosts(["cdn.example.net", "203.0.113.7", "[2001:db8::1]"]));
    });

    it.each([
      ["a scheme", "https://cdn.example.net"],
      ["a port", "cdn.example.net:8443"],
      ["a path", "cdn.example.net/app.js"],
      ["a query", "cdn.example.net?v=1"],
      ["user info", "user@cdn.example.net"],
    ])("rejects a host with %s", (_case, host) => {
      rejects(AuditSchema, withHosts([host]));
    });
  });
});

describe.each([
  { output: "web output", schema: FindingSchema as Schema, finding: webFinding },
  { output: "scanner output", schema: ScannerFindingSchema as Schema, finding: scannerFinding },
])("Finding rules shared by $output", ({ schema, finding }) => {
  it("accepts a violation, a best-practice violation, and a manual-review finding", () => {
    accepts(schema, finding(IMAGE_ALT));
    accepts(schema, finding(REGION));
    accepts(schema, finding(COLOR_CONTRAST));
  });

  describe("impact is non-null for violations", () => {
    it("rejects a violation with a null impact", () => {
      rejects(schema, finding(IMAGE_ALT, { impact: null }));
    });

    it("accepts a manual-review finding with a null impact", () => {
      accepts(schema, finding(COLOR_CONTRAST, { impact: null }));
    });
  });

  describe("wcag is empty when isBestPractice", () => {
    it("rejects a best-practice finding with a WCAG criterion", () => {
      rejects(schema, finding(REGION, { wcag: ["1.3.1"] }));
    });

    it("accepts a WCAG criterion when isBestPractice is false", () => {
      accepts(schema, finding(IMAGE_ALT, { wcag: ["1.1.1"] }));
    });
  });

  describe("id is 16 lowercase hex characters", () => {
    it.each([
      ["15 characters", "0123456789abcde"],
      ["17 characters", "0123456789abcdef0"],
      ["uppercase hex", "0123456789ABCDEF"],
      ["a non-hex character", "0123456789abcdeg"],
      ["an empty string", ""],
    ])("rejects an id with %s", (_case, id) => {
      rejects(schema, finding(IMAGE_ALT, { id }));
    });
  });
});

describe("Finding (web output): evidence and evidenceSignature are present iff violation", () => {
  it("rejects a violation without evidence or signature", () => {
    rejects(FindingSchema, without(webFinding(IMAGE_ALT), "evidence", "evidenceSignature"));
  });

  it("rejects a violation with evidence but no signature", () => {
    rejects(FindingSchema, without(webFinding(IMAGE_ALT), "evidenceSignature"));
  });

  it("rejects a violation with a signature but no evidence", () => {
    rejects(FindingSchema, without(webFinding(IMAGE_ALT), "evidence"));
  });

  it.each([
    ["evidence and signature", { evidence: evidence(), evidenceSignature: SIGNATURE }],
    ["evidence only", { evidence: evidence() }],
    ["a signature only", { evidenceSignature: SIGNATURE }],
  ])("rejects a manual-review finding carrying %s", (_case, extra) => {
    rejects(FindingSchema, webFinding(COLOR_CONTRAST, extra));
  });
});

describe("ScannerFinding (scanner output): evidence and evidenceSignature are always absent", () => {
  it.each([
    ["evidence and signature", { evidence: evidence(), evidenceSignature: SIGNATURE }],
    ["evidence only", { evidence: evidence() }],
    ["a signature only", { evidenceSignature: SIGNATURE }],
  ])("rejects a violation carrying %s", (_case, extra) => {
    rejects(ScannerFindingSchema, scannerFinding(IMAGE_ALT, extra));
  });

  it("rejects a manual-review finding carrying evidence", () => {
    rejects(
      ScannerFindingSchema,
      scannerFinding(COLOR_CONTRAST, { evidence: evidence(), evidenceSignature: SIGNATURE }),
    );
  });
});

describe("AffectedNode length limits", () => {
  it("accepts html of 501 characters (500 plus the ellipsis)", () => {
    accepts(AffectedNodeSchema, node({ html: `${text(500)}…` }));
  });

  it("rejects html of 502 characters", () => {
    rejects(AffectedNodeSchema, node({ html: `${text(501)}…` }));
  });

  it("accepts a failureSummary of 1001 characters (1000 plus the ellipsis)", () => {
    accepts(AffectedNodeSchema, node({ failureSummary: `${text(1000)}…` }));
  });

  it("rejects a failureSummary of 1002 characters", () => {
    rejects(AffectedNodeSchema, node({ failureSummary: `${text(1001)}…` }));
  });
});

describe("SignedEvidenceV1 field limits", () => {
  it("accepts the baseline evidence", () => {
    accepts(SignedEvidenceV1Schema, evidence());
  });

  it("accepts 5 nodes", () => {
    accepts(
      SignedEvidenceV1Schema,
      evidence({ nodes: Array.from({ length: 5 }, () => evidenceNode()) }),
    );
  });

  it("rejects 6 nodes", () => {
    rejects(
      SignedEvidenceV1Schema,
      evidence({ nodes: Array.from({ length: 6 }, () => evidenceNode()) }),
    );
  });

  it("accepts a node selector of 500 characters", () => {
    accepts(SignedEvidenceV1Schema, evidence({ nodes: [evidenceNode({ selector: text(500) })] }));
  });

  it("rejects a node selector of 501 characters", () => {
    rejects(SignedEvidenceV1Schema, evidence({ nodes: [evidenceNode({ selector: text(501) })] }));
  });

  it("accepts help of 500 characters", () => {
    accepts(SignedEvidenceV1Schema, evidence({ help: text(500) }));
  });

  it("rejects help of 501 characters", () => {
    rejects(SignedEvidenceV1Schema, evidence({ help: text(501) }));
  });

  it("accepts a description of 1000 characters", () => {
    accepts(SignedEvidenceV1Schema, evidence({ description: text(1000) }));
  });

  it("rejects a description of 1001 characters", () => {
    rejects(SignedEvidenceV1Schema, evidence({ description: text(1001) }));
  });
});
