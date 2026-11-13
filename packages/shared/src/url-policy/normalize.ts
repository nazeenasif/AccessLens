// URL normalisation (task T037; spec "Missing scheme" edge case, as noted 2026-11-13).
// Decides the scheme, parses with the WHATWG URL parser, and strips the fragment. The parser
// also lowercases the scheme and host, converts IDN hosts to punycode, drops default ports, and
// rewrites every encoded IPv4 form (decimal, hex, octal, short, trailing dot) to dotted form.

export type Normalized =
  { ok: true; url: URL } | { ok: false; code: "INVALID_URL" | "UNSUPPORTED_SCHEME" };

// A leading scheme name and colon, not followed by a digit (so "example.com:8080" is a host
// with a port, but "javascript:alert(1)" and "user:pass@host" are schemes).
const SCHEME_WITHOUT_SLASHES = /^[a-zA-Z][a-zA-Z0-9+.-]*:(?!\d)/;

export function normalizeUrl(input: string): Normalized {
  const text = input.trim();
  if (text === "") return { ok: false, code: "INVALID_URL" };

  let absolute: string;
  if (text.includes("://")) absolute = text;
  else if (SCHEME_WITHOUT_SLASHES.test(text)) return { ok: false, code: "UNSUPPORTED_SCHEME" };
  else absolute = `https://${text}`;

  let url: URL;
  try {
    url = new URL(absolute);
  } catch {
    return { ok: false, code: "INVALID_URL" };
  }
  url.hash = "";
  return { ok: true, url };
}
