import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseReliabilityGates } from "@storytree/library";

/**
 * ADR-0094 (go-green is a status transition: `mapped → healthy` = Adopt) decision 5: the library, as
 * the canonical brownfield (`mapped`) story, declares `## Reliability Gates` over its existing passing
 * suites — `@storytree/library`, `@storytree/cli`, `@storytree/storage-protocol` — so each is
 * observe-and-signed to an `adopted` verdict (`storytree gate run library#gate-N --pg`), the same path
 * the two foundational ports use (ADR-0085). This is the library's honest path off `mapped`, replacing
 * the fail-closed gate-as-proof `real:` Build arms ADR-0092 added (decisions 1 & 5, overtaken by 0094).
 *
 * This grounds the spec against the live `stories/library/story.md`: it must declare the three
 * `observe` gates with their inline `proofCommand`s, or the Adopt path the studio surfaces has nothing
 * to run. RED before the section was authored (no `## Reliability Gates` ⇒ zero gates); GREEN after.
 */

const LIVE_LIBRARY_STORY = (): string => {
  const repoRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
  return readFileSync(path.join(repoRoot, "stories", "library", "story.md"), "utf8").replace(/\r\n/g, "\n");
};

test("the live library story declares the three ADR-0094 observe reliability gates with proof commands", () => {
  const gates = parseReliabilityGates("library", LIVE_LIBRARY_STORY());

  // Exactly the three named suites (ADR-0094 d.5) — never a fail-closed Build over a mature artifact.
  assert.equal(gates.length, 3, `expected 3 reliability gates, got ${gates.length}: ${gates.map((g) => g.id).join(", ")}`);

  // Stable, positional `library#gate-N` ids — the join key `gate run` / the crown roll-up write against.
  assert.deepEqual(
    gates.map((g) => g.id),
    ["library#gate-1", "library#gate-2", "library#gate-3"],
  );

  // Every gate is an `observe` kind (the brownfield "the existing suite works" path) and carries the
  // inline command the spine OBSERVES — an observe gate with no command can never be observe-and-signed.
  for (const gate of gates) {
    assert.equal(gate.kind, "observe", `${gate.id} must be an observe gate, got ${gate.kind}`);
    assert.ok(
      gate.proofCommand !== undefined && gate.proofCommand.length > 0,
      `${gate.id} must declare an inline proofCommand to be observe-and-signable`,
    );
  }

  // The commands adopt exactly the three existing green suites ADR-0094 d.5 names (order = the story's).
  assert.deepEqual(
    gates.map((g) => g.proofCommand),
    [
      "pnpm --filter @storytree/library test",
      "pnpm --filter @storytree/cli test",
      "pnpm --filter @storytree/storage-protocol test",
    ],
  );
});
