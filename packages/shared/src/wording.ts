// User-facing wording shared by the dashboard and exports (task T033): spec FR-013 (limitations
// statement), FR-014 / SC-006 (banned claims), data-model.md (partial-reason explanations),
// constitution Principle II.
import type { PartialReason } from "./schemas/audit.ts";

/** Shown with every result and export (FR-013). Worded so it passes findBannedClaims itself. */
export const LIMITATIONS_STATEMENT = [
  "Automated testing detects only a subset of accessibility issues, so these results are not a complete review.",
  "Manual testing with assistive technology, such as screen readers and keyboard-only navigation, is still required.",
  "These results do not certify WCAG conformance.",
  "Automated checks cover only one of the success criteria new in WCAG 2.2 (2.5.8 Target Size (Minimum)); the others need manual review.",
].join(" ");

/** One coverage explanation per partial reason. A new PartialReason fails typecheck until added. */
export const PARTIAL_REASON_EXPLANATIONS: Record<PartialReason, string> = {
  navigation_timeout:
    "The page started loading but didn't finish within the time limit. Content that appeared later wasn't tested.",
  request_limit_reached:
    "The page made more requests than one audit allows, so some resources weren't loaded. Content that depends on them may be missing from these results.",
  byte_limit_reached:
    "The page downloaded more data than one audit allows, so some resources weren't loaded. Content that depends on them may be missing from these results.",
  frames_not_inspected:
    "One or more frames on the page couldn't be tested, so their content isn't in these results.",
  subresources_blocked:
    "Some resources were blocked because they point to addresses AccessLens doesn't load, such as private networks. Content that depends on them may be missing from these results.",
};

// Claims AccessLens must never make about an audited page (FR-014). Matched against normalised
// text, with word boundaries so "certificate" or "accessible" on its own don't match.
// "meets WCAG" is deliberately not listed: axe rule descriptions, shown verbatim (FR-010), use it
// to describe a rule's threshold, not to make a claim about the page.
const BANNED_CLAIMS: readonly RegExp[] = [
  /\bcompliant\b/g,
  /\bfull compliance\b/g,
  /\bfully accessible\b/g,
  /\b100 ?% accessible\b/g,
  /\bcertified\b/g,
  /\bconformant\b/g,
  /\bpass(?:es)? wcag\b/g,
];

// Case, hyphens, line breaks, and repeated whitespace must not hide a claim.
const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[-\u2010\u2011]/g, " ")
    .replace(/\s+/g, " ");

/** The banned claims found in `text`, in order of appearance (normalised); empty when none. */
export function findBannedClaims(text: string): string[] {
  const normalized = normalize(text);
  return BANNED_CLAIMS.flatMap((pattern) =>
    [...normalized.matchAll(pattern)].map((match) => ({ at: match.index, claim: match[0] })),
  )
    .sort((a, b) => a.at - b.at)
    .map((match) => match.claim);
}
