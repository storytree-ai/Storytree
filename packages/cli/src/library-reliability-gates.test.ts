import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseReliabilityGates } from "@storytree/library";

/**
 * ADR-0094 (go-green is a status transition: `mapped → healthy` = Adopt) declared `## Reliability
 * Gates` over the library's existing passing suites — `@storytree/library`, `@storytree/cli`,
 * `@storytree/storage-protocol` — each observe-and-signed to an `adopted` verdict
 * (`storytree gate run library#gate-N --pg`), the same path the two foundational ports use (ADR-0085).
 *
 * ADR-0097 (brownfield green is a PROVING PROCESS: brown → proposed → green, earned not flipped;
 * `amends: [94]`) then made the honest assessment require MORE than the three observe gates: the
 * library has `proposed` pockets with NO real test (`seed-corpus-scripts`; the Pg transactional path),
 * which an observe gate cannot honestly adopt (observing a smoke-import is the rubber-stamp ADR-0085
 * bans). Those owe `_(gate: build-tests)_` gates — earned by a genuine red→green, refused by `gate run`
 * until the work lands. So the live spec now declares FIVE gates: three `observe` (adopt the green
 * suites) + two `build-tests` (hold the crown back for the untested pockets). This test grounds the
 * spec against the live `stories/library/story.md`: RED before the section was authored (zero gates);
 * GREEN against the honest ADR-0097 floor.
 */

const LIVE_LIBRARY_STORY = (): string => {
  const repoRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
  return readFileSync(path.join(repoRoot, "stories", "library", "story.md"), "utf8").replace(/\r\n/g, "\n");
};

test("the live library story declares three observe gates (adopt) + two build-tests gates (earn) — ADR-0097", () => {
  const gates = parseReliabilityGates("library", LIVE_LIBRARY_STORY());

  // The honest ADR-0097 floor: 3 observe (adopt the green suites) + 2 build-tests (the untested pockets).
  assert.equal(gates.length, 5, `expected 5 reliability gates, got ${gates.length}: ${gates.map((g) => g.id).join(", ")}`);

  // Stable, positional `library#gate-N` ids — the join key `gate run` / the crown roll-up write against.
  assert.deepEqual(
    gates.map((g) => g.id),
    ["library#gate-1", "library#gate-2", "library#gate-3", "library#gate-4", "library#gate-5"],
  );

  // ---- The three `observe` gates (1–3): adopt the existing green suites (ADR-0085 / ADR-0094 d.5) ----
  const observeGates = gates.slice(0, 3);
  for (const gate of observeGates) {
    assert.equal(gate.kind, "observe", `${gate.id} must be an observe gate, got ${gate.kind}`);
    // An observe gate with no command can never be observe-and-signed — it must declare the command
    // the spine OBSERVES at a clean HEAD.
    assert.ok(
      gate.proofCommand !== undefined && gate.proofCommand.length > 0,
      `${gate.id} must declare an inline proofCommand to be observe-and-signable`,
    );
  }
  // The commands adopt exactly the three existing green suites (order = the story's).
  assert.deepEqual(
    observeGates.map((g) => g.proofCommand),
    [
      "pnpm --filter @storytree/library test",
      "pnpm --filter @storytree/cli test",
      "pnpm --filter @storytree/storage-protocol test",
    ],
  );
  // Gate 1 covers the five capabilities its suite genuinely exercises; gate 2 covers the CLI; gate 3
  // adopts the storage-protocol parity the store realization plugs into. The ADR-0097 `(covers:)` is
  // what greens a brownfield cap with no per-cap driven verdict.
  assert.deepEqual(observeGates[0]!.covers, [
    "library-schema-and-write-validation",
    "migrate-on-write-upcaster",
    "event-sourced-store-seam",
    "eager-batch-migrate",
    "library-health-gate",
  ]);
  assert.deepEqual(observeGates[1]!.covers, ["library-cli"]);
  assert.deepEqual(observeGates[2]!.covers, ["event-sourced-store-seam"]);

  // ---- The two `build-tests` gates (4–5): earned by real red→green, never observe-and-signed -------
  const buildTestsGates = gates.slice(3);
  for (const gate of buildTestsGates) {
    assert.equal(gate.kind, "build-tests", `${gate.id} must be a build-tests gate, got ${gate.kind}`);
  }
  // Gate 4 covers `seed-corpus-scripts` — the seventh capability NO honest observe gate covers (the
  // library suite only smoke-imports it). Until gate 4 is genuinely driven, that cap holds the crown
  // at `proposed`, which is what makes a green crown MEAN the untested pocket got real coverage (ADR-0097 §5).
  assert.deepEqual(
    buildTestsGates[0]!.covers,
    ["seed-corpus-scripts"],
    "gate 4 must cover seed-corpus-scripts (the cap no observe gate honestly covers)",
  );
  // Gate 5 (the Pg transactional path) covers NO capability — gate 1 already greens
  // `event-sourced-store-seam` honestly via its dominant behaviour; gate 5 is a pure own-proof
  // obligation for the genuinely-untested-offline live-write pocket, still crown-blocking until signed.
  assert.deepEqual(
    buildTestsGates[1]!.covers,
    [],
    "gate 5 covers no capability — it is a pure own-proof obligation for the Pg pocket",
  );
});
