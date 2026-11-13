// URL normalisation and validation tests (task T034): spec FR-001 (amended 2026-11-13: IP-literal
// hosts are rejected), FR-002, FR-004, edge cases "Missing scheme" and "Ports"; research R3;
// M1 decisions Q2 and Q3, and the T034 review rules (2026-11-13):
//   - length: ≤ 2048 characters before parsing and after normalising, else INVALID_URL;
//   - ports: http only on 80, https only on 443;
//   - scheme: input containing "://" is parsed as-is. Otherwise a leading
//     [a-zA-Z][a-zA-Z0-9+.-]*: not followed by a digit means an unsupported scheme; anything
//     else gets "https://" prefixed.
//
// Export expected from T037 (packages/shared/src/url-policy/validate-url.ts):
//   validateUrl(input: string):
//     | { ok: true; url: string }
//     | { ok: false; code: ErrorCode; detail?: { reason: "ip_literal" } }
// `url` is the normalised absolute URL. validate-url.ts may use normalize.ts internally.
import { describe, expect, it } from "vitest";
import { validateUrl } from "../../src/url-policy/validate-url.ts";

const MAX = 2048;
const accepted = (input: string) => {
  const result = validateUrl(input);
  if (!result.ok) throw new Error(`expected ${JSON.stringify(input)} to pass, got ${result.code}`);
  return result.url;
};
const refusal = (input: string) => {
  const result = validateUrl(input);
  return result.ok ? `accepted as ${result.url}` : result.code;
};

describe("normalisation", () => {
  it.each([
    ["adds https:// when the scheme is missing", "example.com", "https://example.com/"],
    ["keeps the path and query", "example.com/docs?page=2", "https://example.com/docs?page=2"],
    ["keeps an explicit http scheme", "http://example.com", "http://example.com/"],
    ["strips the fragment", "https://example.com/page#section", "https://example.com/page"],
    ["strips the fragment when the scheme is missing", "example.com/#top", "https://example.com/"],
    [
      "converts an IDN host to punycode",
      "https://bücher.example/",
      "https://xn--bcher-kva.example/",
    ],
    ["converts an IDN host without a scheme", "bücher.example", "https://xn--bcher-kva.example/"],
    ["lowercases the scheme and host", "HTTPS://EXAMPLE.COM/Path", "https://example.com/Path"],
    ["drops the default https port", "https://example.com:443/", "https://example.com/"],
    ["drops the default http port", "http://example.com:80/", "http://example.com/"],
  ])("%s", (_case, input, expected) => {
    expect(accepted(input)).toBe(expected);
  });
});

describe("length (Q3: ≤ 2048 before parsing and after normalising → INVALID_URL)", () => {
  const withPath = (prefix: string, length: number) => prefix + "a".repeat(length - prefix.length);

  it("accepts a URL of exactly 2048 characters", () => {
    const input = withPath("https://example.com/", MAX);
    expect(input).toHaveLength(MAX);
    expect(accepted(input)).toHaveLength(MAX);
  });

  it("rejects raw input of 2049 characters", () => {
    expect(refusal(withPath("https://example.com/", MAX + 1))).toBe("INVALID_URL");
  });

  it("rejects input that fits but grows past 2048 when normalised", () => {
    // 2048 characters without a scheme; adding "https://" makes it 2056.
    const input = withPath("example.com/", MAX);
    expect(input).toHaveLength(MAX);
    expect(refusal(input)).toBe("INVALID_URL");
  });
});

describe("scheme (FR-001 → UNSUPPORTED_SCHEME)", () => {
  it.each([
    "ftp://example.com/",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:text/html,<b>hi</b>",
    "ws://example.com/",
  ])("rejects %s", (input) => {
    expect(refusal(input)).toBe("UNSUPPORTED_SCHEME");
  });
});

describe("credentials (FR-004 → CREDENTIALS_IN_URL)", () => {
  it.each([
    "https://user:pass@example.com/",
    "https://user@example.com/",
    "https://:pass@example.com/",
  ])("rejects %s", (input) => {
    expect(refusal(input)).toBe("CREDENTIALS_IN_URL");
  });
});

describe("ports (http only on 80, https only on 443 → PORT_NOT_ALLOWED)", () => {
  it.each([
    "https://example.com:8443/",
    "http://example.com:8080/",
    "https://example.com:22/",
    "http://example.com:443/",
    "https://example.com:80/",
  ])("rejects %s", (input) => {
    expect(refusal(input)).toBe("PORT_NOT_ALLOWED");
  });
});

describe("input without a scheme", () => {
  it.each([
    ["host:port is a host with a port", "example.com:8080", "PORT_NOT_ALLOWED"],
    ["a word followed by a non-digit is a scheme", "user:pass@example.com", "UNSUPPORTED_SCHEME"],
    ["javascript: is a scheme", "javascript:alert(1)", "UNSUPPORTED_SCHEME"],
    ["user:<digits>@host is credentials", "user:1234@example.com", "CREDENTIALS_IN_URL"],
  ])("%s: %s → %s", (_case, input, code) => {
    expect(refusal(input)).toBe(code);
  });

  it("host:443 gets https:// and its default port is dropped", () => {
    expect(accepted("example.com:443")).toBe("https://example.com/");
  });
});

describe("malformed input → INVALID_URL", () => {
  it.each([
    ["an empty string", ""],
    ["only whitespace", "   "],
    ["a scheme with no host", "https://"],
    ["a space in the host", "http://exa mple.com/"],
    ["a port above 65535", "https://example.com:65536/"],
    ["an IPv4 octet above 255", "http://256.1.1.1/"],
  ])("rejects %s", (_case, input) => {
    expect(refusal(input)).toBe("INVALID_URL");
  });
});

describe("IP-literal URLs (FR-001 as amended: BLOCKED_DESTINATION, detail ip_literal)", () => {
  it.each([
    ["a public IPv4 address", "http://93.184.216.34/"],
    ["a public IPv4 address without a scheme", "93.184.216.34/"],
    ["a private IPv4 address", "https://10.0.0.1/"],
    ["IPv4 loopback", "http://127.0.0.1/"],
    ["IPv4 loopback without a scheme", "127.0.0.1"],
    ["decimal IPv4 (2130706433 = 127.0.0.1)", "http://2130706433/"],
    ["hex IPv4 (0x7f000001)", "http://0x7f000001/"],
    ["octal IPv4 (0177.0.0.1)", "http://0177.0.0.1/"],
    ["mixed hex IPv4 (0x7f.0.0.1)", "http://0x7f.0.0.1/"],
    ["short IPv4 (127.1)", "http://127.1/"],
    ["IPv4 with a trailing dot", "http://127.0.0.1./"],
    ["octal cloud metadata (0251.0376.0251.0376)", "http://0251.0376.0251.0376/"],
    ["IPv6 loopback", "http://[::1]/"],
    ["IPv4-mapped IPv6", "http://[::ffff:7f00:1]/"],
    ["IPv4-mapped IPv6 in dotted form", "http://[0:0:0:0:0:ffff:127.0.0.1]/"],
    ["a public IPv6 address", "https://[2606:4700:4700::1111]/"],
  ])("rejects %s", (_case, input) => {
    expect(validateUrl(input)).toEqual({
      ok: false,
      code: "BLOCKED_DESTINATION",
      detail: { reason: "ip_literal" },
    });
  });
});
