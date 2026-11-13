// Gate G0 destination suite (task T036; spec SC-003, FR-002, FR-003; ADR-0001 §2 and §3 with
// Amendment 3; research R3). Every case in destination-cases.ts goes through the URL policy, then
// the DNS check with a stub resolver. Run in CI with `npm run test:security -- g0` (task T040).
//
// Exports expected:
//   T037 validate-url.ts:       validateUrl(input) → { ok: true; url } | { ok: false; code }
//   T039 resolve-and-check.ts:  resolveAndCheck(hostname, resolve) →
//                                 Promise<{ ok: true; addresses: string[] }
//                                       | { ok: false; code: "BLOCKED_DESTINATION" | "TARGET_UNREACHABLE" }>
//     where resolve(hostname) returns the host's answers (dns.lookup with family 4 and
//     all: true), or rejects with an error whose `code` is ENOTFOUND or ENODATA.
//     Final rule (2026-11-13): TARGET_UNREACHABLE only when the lookup returns no addresses
//     ([] or one of those rejections). Any returned string that isn't a canonical public IPv4
//     address, including an all-IPv6 answer, is BLOCKED_DESTINATION.
import { describe, expect, it } from "vitest";
import { ErrorCodeSchema } from "../../src/schemas/errors.ts";
import { resolveAndCheck } from "../../src/url-policy/resolve-and-check.ts";
import { validateUrl } from "../../src/url-policy/validate-url.ts";
import { caseTitle, DESTINATION_CASES, type DestinationCase } from "./destination-cases.ts";

type Lookup = (hostname: string) => Promise<string[]>;

/** A resolver that answers from the case table and counts its calls. */
function stubResolver(answers: DestinationCase["answers"]) {
  const calls: string[] = [];
  const resolve: Lookup = async (hostname) => {
    calls.push(hostname);
    if (answers === undefined) throw new Error(`unexpected DNS lookup for ${hostname}`);
    if (typeof answers === "string") {
      throw Object.assign(new Error(`${answers} ${hostname}`), { code: answers });
    }
    return [...answers];
  };
  return { resolve, calls };
}

async function checkDestination(c: DestinationCase, resolve: Lookup) {
  const url = validateUrl(c.url);
  if (!url.ok) return url.code;
  const result = await resolveAndCheck(new URL(url.url).hostname, resolve);
  return result.ok ? "allowed" : result.code;
}

describe("the published G0 case list (SC-003)", () => {
  it("covers direct, encoded, DNS-resolved and redirect-target cases, plus allowed controls", () => {
    const kinds = new Set(DESTINATION_CASES.map((c) => c.kind));
    expect([...kinds].sort()).toEqual(["allowed", "direct", "dns", "encoded", "redirect"]);
  });

  it("every expected outcome is an existing ErrorCode or 'allowed'", () => {
    const codes = new Set<string>(ErrorCodeSchema.options);
    for (const c of DESTINATION_CASES) {
      expect(c.expected === "allowed" || codes.has(c.expected), caseTitle(c)).toBe(true);
    }
  });

  it("case titles are unique", () => {
    const titles = DESTINATION_CASES.map(caseTitle);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe("G0: every published case gets its expected outcome", () => {
  it.each(DESTINATION_CASES.map((c) => [caseTitle(c), c] as const))("%s", async (_title, c) => {
    const { resolve } = stubResolver(c.answers);
    expect(await checkDestination(c, resolve)).toBe(c.expected);
  });
});

describe("G0: properties of the check", () => {
  it("IP-literal URLs are refused before any DNS lookup", async () => {
    for (const c of DESTINATION_CASES.filter((c) => c.kind === "direct" || c.kind === "encoded")) {
      const { resolve, calls } = stubResolver(undefined);
      expect(await checkDestination(c, resolve), caseTitle(c)).toBe("BLOCKED_DESTINATION");
      expect(calls, caseTitle(c)).toEqual([]);
    }
  });

  it("an allowed host is resolved once, and the validated addresses are the ones returned", async () => {
    // A rebinding resolver: public on the first lookup, loopback afterwards.
    const calls: string[] = [];
    const rebinding: Lookup = async (hostname) => {
      calls.push(hostname);
      return calls.length === 1 ? ["93.184.216.34"] : ["127.0.0.1"];
    };
    const result = await resolveAndCheck("rebind.example", rebinding);
    expect(result).toEqual({ ok: true, addresses: ["93.184.216.34"] });
    expect(calls).toEqual(["rebind.example"]);
  });

  it("a single non-public answer blocks the host, whatever its position", async () => {
    for (const answers of [
      ["10.0.0.5", "93.184.216.34", "151.101.1.69"],
      ["93.184.216.34", "10.0.0.5", "151.101.1.69"],
      ["93.184.216.34", "151.101.1.69", "10.0.0.5"],
    ]) {
      const result = await resolveAndCheck("mixed.example", async () => answers);
      expect(result, answers.join(", ")).toEqual({ ok: false, code: "BLOCKED_DESTINATION" });
    }
  });
});
