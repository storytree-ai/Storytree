import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { classifyDrift, normaliseScript, scriptHash, PUBLISHED_URL } from "./check-dist-drift.js";

/**
 * Machine floor for the D5 published-installer drift check.
 *
 * The check exists because the PUBLISHED object — not the repo copy — is what a fresh explorer machine
 * downloads and EXECUTES, and publishing is manual, so the two can silently diverge while the URL
 * keeps answering 200 with an old script.
 *
 * The invariant that decides whether this check is useful or noise: comparison must be LINE-ENDING
 * INSENSITIVE. A Windows checkout holds CRLF while the uploaded object may hold LF, so a raw byte
 * compare would report permanent phantom drift, the warning would be ignored, and a REAL stale publish
 * would hide in the noise. That is the case worth pinning hardest.
 */

test("CRLF vs LF is NOT drift — otherwise the check cries wolf on every Windows checkout", () => {
  const lf = "#Requires -Version 5.1\nWrite-Host 'hi'\n";
  const crlf = "#Requires -Version 5.1\r\nWrite-Host 'hi'\r\n";
  assert.equal(normaliseScript(crlf), normaliseScript(lf));
  assert.equal(scriptHash(crlf), scriptHash(lf));
  assert.equal(classifyDrift(crlf, lf).status, "match");
});

test("a trailing-whitespace difference is not drift", () => {
  assert.equal(classifyDrift("Write-Host 'hi'\n\n", "Write-Host 'hi'").status, "match");
});

test("a REAL content change IS drift, and the message names the fix", () => {
  const verdict = classifyDrift("Write-Host 'new'\n", "Write-Host 'old'\n");
  assert.equal(verdict.status, "drift");
  assert.match(verdict.message, /STALE/);
  assert.match(verdict.message, /gcloud storage cp/, "must name the exact republish command");
  assert.match(verdict.message, /NOT gsutil/i, "must steer away from the 401 trap");
});

test("nothing published (404) WARNs that the documented one-liner does not work", () => {
  const verdict = classifyDrift("anything", null);
  assert.equal(verdict.status, "unpublished");
  assert.match(verdict.message, /does NOT work/);
});

test("unreachable (offline) SKIPs — never a false 'drift' when we simply could not look", () => {
  const verdict = classifyDrift("anything", undefined);
  assert.equal(verdict.status, "skipped");
  assert.doesNotMatch(verdict.message, /WARN/, "offline must not read as a problem with the publish");
});

test("the checked URL is the one the installer + docs actually advertise (no drift between them)", () => {
  const install = readFileSync(fileURLToPath(new URL("../../../infra/install.ps1", import.meta.url)), "utf8");
  assert.ok(
    install.includes(PUBLISHED_URL),
    "the URL this check verifies must be the URL install.ps1's one-liner advertises",
  );
});

test("the real repo installer hashes stably (the check has something to compare)", () => {
  const install = readFileSync(fileURLToPath(new URL("../../../infra/install.ps1", import.meta.url)), "utf8");
  assert.equal(scriptHash(install), scriptHash(install));
  assert.equal(scriptHash(install).length, 12);
});
