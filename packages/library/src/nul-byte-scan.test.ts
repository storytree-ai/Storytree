import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * NO SOURCE FILE IN THIS PACKAGE MAY CARRY A RAW NUL BYTE.
 *
 * Not a style rule — a SEARCHABILITY rule, and the failure it guards is silent in the worst
 * direction. `grep` and `rg` classify a file holding a NUL as BINARY and skip it without saying so,
 * so every source search for anything in that file comes back empty, and an empty search result
 * reads as "this does not exist" rather than "this file was never read". A whole module drops out
 * of every scan an agent or a person runs, and nothing announces it.
 *
 * `composed-statement.ts` shipped exactly that on 2026-08-23: a deliberate NUL separator inside a
 * fingerprint's template literal, written as the literal character rather than as an escape. The
 * escape is identical at runtime, so there is never a reason to prefer the raw byte.
 *
 * SCOPED TO THIS PACKAGE deliberately. The rule is repo-wide in spirit, but a package-local test is
 * the cheap version that runs on every gate and catches the recurrence here; widening it to the
 * whole tree is a gate rung's job, not a unit test's, and would need the affected-scope classifier
 * to know about it.
 */

const SRC = dirname(fileURLToPath(import.meta.url));

/** Every `.ts` file under `src/`, recursively. */
async function sourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sourceFiles(full)));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

test("nul-byte-scan: no source file carries a raw NUL byte — grep would skip it in silence", async () => {
  const offenders: string[] = [];
  for (const file of await sourceFiles(SRC)) {
    // Read as BYTES. Decoding first would be fine here (a NUL is valid UTF-8), but the subject of
    // the rule is what a byte-oriented tool sees, so the check reads what that tool reads.
    const bytes = await readFile(file);
    if (bytes.includes(0)) offenders.push(file.slice(SRC.length + 1).replaceAll("\\", "/"));
  }
  assert.deepEqual(
    offenders,
    [],
    `these files hold a raw NUL and are invisible to grep/rg — write it as \\u0000 instead:\n  ${offenders.join("\n  ")}`,
  );
});
