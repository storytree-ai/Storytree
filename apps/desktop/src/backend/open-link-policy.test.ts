// open-link-policy — the terminal link-open scheme allowlist (embedded-terminal patterns survey,
// increment D). Terminal output is UNTRUSTED: any process in the pty can emit a URL, and an
// unvalidated shell.openExternal from terminal output is a CVE class (electerm advisory
// GHSA-fwf6-j56g-m97c — file:/UNC/javascript: targets execute or exfiltrate). The renderer's
// web-links addon filters too, but THIS module is the enforcing wall in the Electron MAIN
// (defense in depth: a compromised renderer can send any string over IPC). Headlessly provable —
// no electron import, exactly like pty-session-manager's discipline.

import { test } from "node:test";
import assert from "node:assert/strict";

import { isAllowedExternalUrl } from "./open-link-policy.js";

test("olp-allows-http-and-https-only: well-formed http/https URLs pass", () => {
  assert.equal(isAllowedExternalUrl("https://github.com/HuaMick/storytree/pull/772"), true);
  assert.equal(isAllowedExternalUrl("http://127.0.0.1:5173/#/tree"), true);
  assert.equal(isAllowedExternalUrl("https://example.com/a?b=c#d"), true);
  // Scheme matching is case-insensitive per the URL spec — the parser normalizes it.
  assert.equal(isAllowedExternalUrl("HTTPS://EXAMPLE.COM/path"), true);
});

test("olp-refuses-dangerous-schemes: file/javascript/vbscript/data and friends are refused", () => {
  // The electerm CVE class: a file: target opens the local filesystem / executes via handlers.
  assert.equal(isAllowedExternalUrl("file:///C:/Windows/System32/cmd.exe"), false);
  // UNC via file scheme (backslash form) — Windows-specific exfiltration/execution vector.
  assert.equal(isAllowedExternalUrl("file:\\\\attacker\\share\\payload.exe"), false);
  assert.equal(isAllowedExternalUrl("javascript:alert(1)"), false);
  // Case/whitespace obfuscation: the URL parser strips tab/newline and lowercases the scheme,
  // so these normalize to javascript: and must still be refused.
  assert.equal(isAllowedExternalUrl("JaVaScRiPt:alert(1)"), false);
  assert.equal(isAllowedExternalUrl("java\tscript:alert(1)"), false);
  assert.equal(isAllowedExternalUrl("vbscript:msgbox(1)"), false);
  assert.equal(isAllowedExternalUrl("data:text/html,<script>alert(1)</script>"), false);
  // Not in the allowlist even though they are common: anything but http/https is refused.
  assert.equal(isAllowedExternalUrl("ftp://example.com/file"), false);
  assert.equal(isAllowedExternalUrl("mailto:a@example.com"), false);
  assert.equal(isAllowedExternalUrl("ms-settings:windowsupdate"), false);
});

test("olp-refuses-malformed-and-non-string: garbage fails closed, never throws", () => {
  // Untrusted IPC payloads: the caller passes `unknown`, so non-strings must be refused typed.
  assert.equal(isAllowedExternalUrl(undefined), false);
  assert.equal(isAllowedExternalUrl(null), false);
  assert.equal(isAllowedExternalUrl(42), false);
  assert.equal(isAllowedExternalUrl({ href: "https://example.com" }), false);
  // Not parseable as an absolute URL at all.
  assert.equal(isAllowedExternalUrl(""), false);
  assert.equal(isAllowedExternalUrl("   "), false);
  assert.equal(isAllowedExternalUrl("not a url"), false);
  // Scheme-relative (no scheme) — nothing to allowlist, refused.
  assert.equal(isAllowedExternalUrl("//evil.example.com/payload"), false);
  assert.equal(isAllowedExternalUrl("example.com/no-scheme"), false);
  // Unbounded input from an untrusted channel: absurdly long strings are refused outright.
  assert.equal(isAllowedExternalUrl(`https://example.com/${"a".repeat(10_000)}`), false);
});
