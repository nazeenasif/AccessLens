// The published list of prohibited-destination cases for gate G0 (spec SC-003; task T036).
// SC-003 requires 100% of these to be refused. They cover direct IP literals, alternate encodings,
// DNS answers (through a stub resolver), redirect targets, and IP-literal hosts passed straight to
// resolveAndCheck (as a proxy connect target would be). Each redirect hop gets the same
// check; the scanner reports a refused main-frame hop as BLOCKED_REDIRECT (research R3). There
// are also allowed controls, so the suite can't pass by refusing everything.
//
// scripts/assert-required-tests.mjs imports this file to require every case's test in CI, so it
// must stay free of runtime imports other than type-only ones.
import type { ErrorCode } from "../../src/schemas/errors.ts";

type CaseCommon = {
  name: string;
  /**
   * What the stub resolver returns for the host: its answers, or a lookup error code.
   * Final rule (2026-11-13): TARGET_UNREACHABLE only when the IPv4 lookup returns no addresses,
   * which is [] or a not-found rejection (ENODATA, ENOTFOUND). Node's dns.lookup with family 4
   * rejects for an IPv6-only host rather than returning []. Any returned string that isn't a
   * canonical public IPv4 address, including an all-IPv6 answer, is BLOCKED_DESTINATION.
   */
  answers?: string[] | "ENOTFOUND" | "ENODATA";
  expected: ErrorCode | "allowed";
};

export type DestinationCase =
  | (CaseCommon & {
      kind: "direct" | "encoded" | "dns" | "redirect" | "allowed";
      /** The URL as submitted, or the redirect target for kind "redirect". */
      url: string;
    })
  | (CaseCommon & {
      kind: "host";
      /** A host passed straight to resolveAndCheck, skipping the URL policy (T039 review). */
      host: string;
    });

const literal = (name: string, url: string): DestinationCase => ({
  kind: "direct",
  name,
  url,
  expected: "BLOCKED_DESTINATION",
});
const encoded = (name: string, url: string): DestinationCase => ({
  kind: "encoded",
  name,
  url,
  expected: "BLOCKED_DESTINATION",
});
const resolved = (
  name: string,
  host: string,
  answers: NonNullable<DestinationCase["answers"]>,
  expected: DestinationCase["expected"] = "BLOCKED_DESTINATION",
): DestinationCase => ({ kind: "dns", name, url: `https://${host}/`, answers, expected });
const redirect = (
  name: string,
  url: string,
  expected: DestinationCase["expected"],
  answers?: DestinationCase["answers"],
): DestinationCase => ({ kind: "redirect", name, url, expected, ...(answers ? { answers } : {}) });

const host = (name: string, hostname: string): DestinationCase => ({
  kind: "host",
  name,
  host: hostname,
  expected: "BLOCKED_DESTINATION",
});

export const DESTINATION_CASES: readonly DestinationCase[] = [
  // Direct IP literals: every IP-literal URL is refused (M1 decision Q2).
  literal("IPv4 loopback", "http://127.0.0.1/"),
  literal("RFC 1918 10/8", "http://10.0.0.1/"),
  literal("RFC 1918 172.16/12", "http://172.16.0.1/"),
  literal("RFC 1918 192.168/16", "http://192.168.1.1/"),
  literal("cloud metadata", "http://169.254.169.254/latest/meta-data/"),
  literal("CGNAT", "http://100.64.0.1/"),
  literal("unspecified", "http://0.0.0.0/"),
  literal("broadcast", "http://255.255.255.255/"),
  literal("multicast", "http://224.0.0.1/"),
  literal("TEST-NET-1 documentation range", "http://192.0.2.1/"),
  literal("6to4 relay (ADR-0001 Amendment 3)", "http://192.88.99.1/"),
  literal("web on the scan-ctl network", "http://172.30.20.10/"),
  literal("scanner on the scan-ctl network", "http://172.30.20.20/"),
  literal("egress-proxy on the scan-egress network", "http://172.30.30.30/"),
  literal("public IPv4 literal (Q2)", "http://93.184.216.34/"),
  literal("IPv6 loopback", "http://[::1]/"),
  literal("IPv6 unique local", "http://[fc00::1]/"),
  literal("IPv6 link-local", "http://[fe80::1]/"),
  literal("public IPv6 literal (Q2)", "https://[2606:4700:4700::1111]/"),
  // Alternate encodings: the URL parser rewrites them to dotted IPv4, which is then refused.
  encoded("decimal loopback", "http://2130706433/"),
  encoded("hex loopback", "http://0x7f000001/"),
  encoded("octal loopback", "http://0177.0.0.1/"),
  encoded("mixed hex loopback", "http://0x7f.0.0.1/"),
  encoded("short loopback", "http://127.1/"),
  encoded("long octal loopback", "http://017700000001/"),
  encoded("loopback with a trailing dot", "http://127.0.0.1./"),
  encoded("octal cloud metadata", "http://0251.0376.0251.0376/"),
  encoded("hex cloud metadata", "http://0xa9fea9fe/"),
  encoded("decimal cloud metadata", "http://2852039166/"),
  encoded("IPv4-mapped IPv6 loopback", "http://[::ffff:7f00:1]/"),
  encoded("IPv4-mapped IPv6, dotted form", "http://[0:0:0:0:0:ffff:127.0.0.1]/"),
  // DNS answers: any non-public answer blocks the whole host.
  resolved("localhost", "localhost", ["127.0.0.1"]),
  resolved("name resolving to RFC 1918", "internal.example", ["10.0.0.5"]),
  resolved("name resolving to cloud metadata", "metadata.example", ["169.254.169.254"]),
  resolved("name resolving to CGNAT", "cgnat.example", ["100.64.10.10"]),
  resolved("name resolving to the web container", "web.example", ["172.30.20.10"]),
  resolved("name resolving to AS112", "as112.example", ["192.31.196.1"]),
  resolved("name resolving to AS112 direct delegation", "as112-direct.example", ["192.175.48.1"]),
  resolved("name resolving to AMT", "amt.example", ["192.52.193.1"]),
  resolved("mixed public and private answers", "mixed.example", ["93.184.216.34", "10.0.0.5"]),
  resolved("private answer listed first", "mixed-first.example", ["192.168.0.10", "93.184.216.34"]),
  // T036 review (2026-11-13): an IPv6 address among IPv4 answers is never trusted.
  resolved("IPv6 address among IPv4 answers", "dualstack.example", [
    "93.184.216.34",
    "2606:4700:4700::1111",
  ]),
  // T036 final rule (2026-11-13): returned IPv6 strings are answers, so they block.
  resolved("all-IPv6 answer", "v6strings.example", ["2606:4700:4700::1111", "::1"]),
  resolved("IPv6-only host (no IPv4 answer)", "v6only.example", [], "TARGET_UNREACHABLE"),
  resolved("IPv6-only host (ENODATA)", "v6only-nodata.example", "ENODATA", "TARGET_UNREACHABLE"),
  resolved("unknown host (ENOTFOUND)", "missing.example", "ENOTFOUND", "TARGET_UNREACHABLE"),
  // Redirect targets: each hop is checked as if it had been submitted.
  redirect("to cloud metadata", "http://169.254.169.254/latest/meta-data/", "BLOCKED_DESTINATION"),
  redirect("to decimal loopback", "http://2130706433/admin", "BLOCKED_DESTINATION"),
  redirect("to a name resolving to loopback", "http://localhost/", "BLOCKED_DESTINATION", [
    "127.0.0.1",
  ]),
  redirect("to a non-http scheme", "file:///etc/passwd", "UNSUPPORTED_SCHEME"),
  redirect("to a non-default port", "http://internal.example:8080/", "PORT_NOT_ALLOWED"),
  redirect("to a URL with credentials", "https://admin:x@example.com/", "CREDENTIALS_IN_URL"),
  // IP-literal hosts passed straight to resolveAndCheck (T039 review, 2026-11-13): refused with
  // detail ip_literal, without any DNS lookup.
  host("IPv4 loopback", "127.0.0.1"),
  host("RFC 1918", "10.0.0.1"),
  host("cloud metadata", "169.254.169.254"),
  host("public IPv4", "93.184.216.34"),
  host("decimal loopback", "2130706433"),
  host("hex loopback", "0x7f000001"),
  host("octal loopback", "0177.0.0.1"),
  host("short loopback", "127.1"),
  host("IPv6 loopback", "::1"),
  host("bracketed IPv6 loopback", "[::1]"),
  host("IPv4-mapped IPv6", "::ffff:127.0.0.1"),
  host("public IPv6", "2606:4700:4700::1111"),
  host("bracketed public IPv6", "[2606:4700:4700::1111]"),
  // Allowed controls.
  {
    kind: "allowed",
    name: "public host",
    url: "https://example.com/",
    answers: ["93.184.216.34"],
    expected: "allowed",
  },
  {
    kind: "allowed",
    name: "public host with several public answers",
    url: "example.org/page",
    answers: ["93.184.216.34", "151.101.1.69"],
    expected: "allowed",
  },
];

/** The test title for a case; the CI audit requires each of these titles to pass. */
export const caseTitle = (c: DestinationCase) => `${c.kind}: ${c.name} → ${c.expected}`;
