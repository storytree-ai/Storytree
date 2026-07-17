// open-link-policy — the terminal link-open scheme allowlist (embedded-terminal patterns
// survey, increment D). Terminal output is UNTRUSTED (any process in the pty can emit a URL),
// and an unvalidated shell.openExternal from terminal output is a CVE class (electerm advisory
// GHSA-fwf6-j56g-m97c: file:/UNC/javascript: targets execute or exfiltrate). This module is the
// ENFORCING wall, applied in the Electron main right before shell.openExternal — the renderer's
// own web-links filter is only belt (a compromised renderer can send any string over IPC).
//
// No `electron` import, no `node:` import — headlessly provable (open-link-policy.test.ts), the
// same discipline as pty-session-manager.

/** A generous ceiling for a real clickable URL — an unbounded string from an untrusted IPC
 *  channel is refused outright before it reaches the URL parser. */
const MAX_URL_LENGTH = 2048;

/**
 * Whether `raw` is a string the terminal may hand to `shell.openExternal`: a well-formed
 * absolute URL whose scheme is on the http/https allowlist. Everything else — non-strings,
 * unparseable strings, and EVERY other scheme (file:, javascript:, data:, ms-settings:, …) —
 * is refused, typed false, never a throw. The WHATWG URL parser does the normalization work
 * (strips tab/newline obfuscation, lowercases the scheme), so `java\tscript:` and
 * `JaVaScRiPt:` cannot sneak past a naive prefix check.
 */
export function isAllowedExternalUrl(raw: unknown): raw is string {
  if (typeof raw !== "string") {
    return false;
  }
  if (raw.length === 0 || raw.length > MAX_URL_LENGTH) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}
