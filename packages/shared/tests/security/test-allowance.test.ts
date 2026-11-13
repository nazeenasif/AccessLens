// Test-allowance tests (task T191; ADR-0001 Amendment 4, proposal test 2).
// In test mode only, resolveAndCheck accepts an optional allowance: for an allowlisted host,
// every DNS answer must lie inside the fixture subnet. Any other answer, including public ones,
// is BLOCKED_DESTINATION. Hosts that aren't allowlisted get the normal rules, and with no
// allowance the behaviour is exactly the G0 behaviour.
//
// API expected from T192 (packages/shared/src/url-policy/resolve-and-check.ts):
//   export type TestAllowance = { hosts: readonly string[]; subnet: string };
//   resolveAndCheck(hostname, resolve?, allowance?: TestAllowance)
import { describe, expect, it } from "vitest";
import { resolveAndCheck, type TestAllowance } from "../../src/url-policy/resolve-and-check.ts";
import { validateUrl } from "../../src/url-policy/validate-url.ts";
import { DESTINATION_CASES, caseTitle, type DestinationCase } from "./destination-cases.ts";

const ALLOWANCE: TestAllowance = {
  hosts: ["fixtures.test", "pages.test"],
  subnet: "172.30.50.0/24",
};

const answering = (answers: string[]) => async () => [...answers];
const BLOCKED = { ok: false, code: "BLOCKED_DESTINATION" };

describe("allowlisted host resolving inside the fixture subnet is allowed", () => {
  it.each([
    ["one answer", ["172.30.50.10"]],
    ["several answers", ["172.30.50.10", "172.30.50.11"]],
    ["the subnet's first and last addresses", ["172.30.50.0", "172.30.50.255"]],
  ])("%s", async (_case, answers) => {
    const result = await resolveAndCheck("fixtures.test", answering(answers), ALLOWANCE);
    expect(result).toEqual({ ok: true, addresses: answers });
  });

  it("applies to every allowlisted host", async () => {
    const result = await resolveAndCheck("pages.test", answering(["172.30.50.20"]), ALLOWANCE);
    expect(result).toEqual({ ok: true, addresses: ["172.30.50.20"] });
  });
});

describe("allowlisted host resolving anywhere else is blocked", () => {
  it.each([
    ["a public address", ["93.184.216.34"]],
    ["another private range", ["10.0.0.5"]],
    ["the neighbouring outbound subnet", ["172.30.40.30"]],
    ["loopback", ["127.0.0.1"]],
    ["cloud metadata", ["169.254.169.254"]],
    ["just outside the subnet", ["172.30.51.0"]],
    ["mixed: fixture subnet and public", ["172.30.50.10", "93.184.216.34"]],
    ["mixed: fixture subnet and another private range", ["172.30.50.10", "10.0.0.5"]],
    ["mixed: public first", ["93.184.216.34", "172.30.50.10"]],
    ["an IPv6 answer", ["fd00::10"]],
  ])("%s", async (_case, answers) => {
    const result = await resolveAndCheck("fixtures.test", answering(answers), ALLOWANCE);
    expect(result).toEqual(BLOCKED);
  });
});

describe("non-allowlisted hosts are unaffected by the allowance", () => {
  it("a public host with public answers is still allowed", async () => {
    const result = await resolveAndCheck("example.com", answering(["93.184.216.34"]), ALLOWANCE);
    expect(result).toEqual({ ok: true, addresses: ["93.184.216.34"] });
  });

  it.each([
    ["a host resolving into the fixture subnet", "intruder.example", ["172.30.50.10"]],
    ["a sub-domain of an allowlisted host", "sub.fixtures.test", ["172.30.50.10"]],
    ["a host resolving to another private range", "internal.example", ["10.0.0.5"]],
  ])("%s is blocked as usual", async (_case, host, answers) => {
    const result = await resolveAndCheck(host, answering(answers), ALLOWANCE);
    expect(result).toEqual(BLOCKED);
  });

  it("an IP-literal host is still refused before any lookup", async () => {
    let called = false;
    const result = await resolveAndCheck(
      "172.30.50.10",
      async () => {
        called = true;
        return ["172.30.50.10"];
      },
      ALLOWANCE,
    );
    expect(result).toEqual({
      ok: false,
      code: "BLOCKED_DESTINATION",
      detail: { reason: "ip_literal" },
    });
    expect(called).toBe(false);
  });
});

describe("with no allowance, results are identical to the G0 suite", () => {
  // Every published G0 case that reaches the DNS check, with its hostname and stub answers.
  const dnsCases = DESTINATION_CASES.flatMap((c): { c: DestinationCase; host: string }[] => {
    if (c.kind === "host") return [{ c, host: c.host }];
    if (c.answers === undefined) return [];
    const url = validateUrl(c.url);
    return url.ok ? [{ c, host: new URL(url.url).hostname }] : [];
  });

  const stub = (answers: (typeof DESTINATION_CASES)[number]["answers"]) => async () => {
    if (answers === undefined) throw new Error("unexpected DNS lookup");
    if (typeof answers === "string") throw Object.assign(new Error(answers), { code: answers });
    return [...answers];
  };

  it("covers the published DNS, host, and allowed cases", () => {
    expect(dnsCases.length).toBeGreaterThanOrEqual(20);
  });

  it.each(dnsCases.map(({ c, host }) => [caseTitle(c), c, host] as const))(
    "%s",
    async (_title, c, host) => {
      const without = await resolveAndCheck(host, stub(c.answers));
      const explicitlyNone = await resolveAndCheck(host, stub(c.answers), undefined);
      const unrelated = await resolveAndCheck(host, stub(c.answers), ALLOWANCE);
      expect(explicitlyNone).toEqual(without);
      // An allowance for other hosts changes nothing for these cases.
      expect(unrelated).toEqual(without);
    },
  );
});
