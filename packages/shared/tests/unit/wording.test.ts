// Wording tests (task T031): spec FR-013 (limitations statement), FR-014 and SC-006 (banned claims),
// data-model.md (one coverage explanation per PartialReason), constitution Principle II.
//
// Exports expected from T033 (packages/shared/src/wording.ts):
//   LIMITATIONS_STATEMENT        string
//   PARTIAL_REASON_EXPLANATIONS  Record<PartialReason, string>
//   findBannedClaims(text)       string[]: the claims found in `text`; empty when there are none
//
// Content checks look for a single sentence that carries each required point, so the wording
// stays free but a point can't be satisfied by words scattered across unrelated sentences.
import { describe, expect, it } from "vitest";
import {
  findBannedClaims,
  LIMITATIONS_STATEMENT,
  PARTIAL_REASON_EXPLANATIONS,
} from "../../src/wording.ts";
import { COMPONENTS } from "../support/contract.ts";

const NEGATION = /\b(not|no|never|cannot)\b|n't\b/i;

const sentences = (text: string) => text.split(/(?<=[.!?])\s+/);
const someSentence = (text: string, ...patterns: RegExp[]) =>
  sentences(text).some((sentence) => patterns.every((pattern) => pattern.test(sentence)));

describe("limitations statement (FR-013)", () => {
  it("is a non-empty string", () => {
    expect(typeof LIMITATIONS_STATEMENT).toBe("string");
    expect(LIMITATIONS_STATEMENT.trim()).not.toBe("");
  });

  it("says automated testing detects only a subset of accessibility issues", () => {
    // Requiring "issues" keeps the WCAG 2.2 sentence below from satisfying this on its own.
    expect(
      someSentence(
        LIMITATIONS_STATEMENT,
        /\bautomated\b/i,
        /\b(only|subset|some|not all|limited|portion)\b/i,
        /\b(issues|barriers|problems)\b/i,
      ),
    ).toBe(true);
  });

  it("says manual testing with assistive technology is required", () => {
    expect(
      someSentence(LIMITATIONS_STATEMENT, /\bmanual\b/i, /\bassistive technolog(y|ies)\b/i),
    ).toBe(true);
  });

  it("says results don't certify WCAG conformance", () => {
    expect(someSentence(LIMITATIONS_STATEMENT, NEGATION, /\bcertif/i, /\bconformance\b/i)).toBe(
      true,
    );
  });

  it("states the WCAG 2.2 coverage gap", () => {
    expect(
      someSentence(
        LIMITATIONS_STATEMENT,
        /\bWCAG 2\.2\b/,
        /\b(only|one|few|limited|small|minimal|not)\b/i,
      ),
    ).toBe(true);
  });
});

describe("partial-reason explanations (data-model.md)", () => {
  const reasons = (COMPONENTS.PartialReason?.enum ?? []) as string[];
  const explanations: Record<string, unknown> = PARTIAL_REASON_EXPLANATIONS;

  it("reads the PartialReason values from the contract", () => {
    expect(reasons.length).toBeGreaterThan(0);
  });

  it.each(reasons)("%s has a non-empty explanation", (reason) => {
    const explanation = explanations[reason];
    expect(typeof explanation).toBe("string");
    expect(String(explanation).trim()).not.toBe("");
  });

  it("has no explanation for a reason that doesn't exist", () => {
    expect(Object.keys(explanations).sort()).toEqual([...reasons].sort());
  });
});

describe("findBannedClaims (FR-014, SC-006, Principle II)", () => {
  it.each([
    ["compliant", "This page is compliant."],
    ["WCAG compliant", "Your site is WCAG compliant."],
    ["ADA compliant", "Now ADA compliant!"],
    ["fully accessible", "This page is fully accessible."],
    ["certified", "Certified by AccessLens."],
    ["certified accessible", "The checkout is certified accessible."],
    ["passes WCAG", "Your homepage passes WCAG 2.2 AA."],
    ["100% accessible", "Congratulations: 100% accessible."],
    ["WCAG conformant", "The page is WCAG 2.1 AA conformant."],
    ["full compliance", "This page achieves full compliance."],
  ])("flags %s", (_claim, text) => {
    expect(findBannedClaims(text).length).toBeGreaterThan(0);
  });

  it.each([
    ["uppercase", "THIS PAGE IS COMPLIANT"],
    ["title case", "Fully Accessible Website"],
    ["a hyphen", "a fully-accessible checkout"],
    ["a line break", "This page is fully\naccessible."],
    ["extra spaces", "fully   accessible"],
  ])("flags a claim written with %s", (_variant, text) => {
    expect(findBannedClaims(text).length).toBeGreaterThan(0);
  });

  it.each([
    ["a violation count", "3 detected violations"],
    ["the manual-review label", "Needs manual review"],
    ["the empty-results message", "No automated violations detected"],
    ["comparison wording", "No longer detected"],
    ["the best-practice label", "Best practice — not a WCAG requirement"],
    ["the AI labels", "AI-generated · Unverified suggestion"],
    ["'accessible' on its own", "Make the menu button accessible to keyboard users."],
    ["'certificate'", "The site's TLS certificate could not be verified."],
    // Only the word boundaries keep these clean (a banned word sits inside a longer word).
    ["'noncompliant'", "The plugin is noncompliant with its own style guide."],
    ["'uncertified'", "An uncertified plugin was found."],
    ["'1100% accessible'", "Load grew by 1100% accessible to more users."],
    // Out of scope by decision (PHR 30): "surpasses"/"exceeds WCAG" aren't banned phrases.
    ["'surpasses WCAG 2 AA'", "The contrast surpasses WCAG 2 AA thresholds."],
    [
      "verbatim axe text (shown unchanged, FR-010)",
      "Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds",
    ],
  ])("doesn't flag %s", (_case, text) => {
    expect(findBannedClaims(text)).toEqual([]);
  });

  it("finds every claim in a longer text", () => {
    expect(findBannedClaims("Fully accessible and certified.").length).toBeGreaterThanOrEqual(2);
  });
});

describe("the wording module's own text", () => {
  // Every results view and export shows these (FR-013, US5), and exports are scanned with
  // findBannedClaims (T164, T177), so they must pass it.
  it("the limitations statement contains no banned claim", () => {
    expect(findBannedClaims(LIMITATIONS_STATEMENT)).toEqual([]);
  });

  it("no partial-reason explanation contains a banned claim", () => {
    for (const explanation of Object.values(PARTIAL_REASON_EXPLANATIONS)) {
      expect(findBannedClaims(String(explanation))).toEqual([]);
    }
  });
});
