import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";
import { loadCorpus, diffAgents, diffCorpus, AGENT_KIND } from "@storytree/library/store";

import {
  DEFAULT_AGENTS_SYNC_DRAIN_CONFIG as AGENTS_CEILING,
  DEFAULT_CORPUS_SYNC_DRAIN_CONFIG as CORPUS_CEILING,
  evaluateAgentsSyncDrain,
  evaluateCorpusSyncDrain,
} from "./sync-drain.js";

/**
 * The `check:agents-sync` / `check:corpus-sync` drain ceilings (`verification-integrity-arc`,
 * ADR-0252 D3, in ADR-0168 D4's shape) — the last two worklists the `warn-list-hygiene` instrument
 * located. Pure: each core takes a diff projection, so every level is testable without a DB.
 *
 * WHAT IS PINNED HERE AND WHAT IS NOT. The live half of each check's population lives in the LIVE
 * store and the gate is offline by charter (`pnpm -r test` needs no DB), so a live-gated test would
 * land in the exact options-form-skip shape `check:verification-decay`'s `vacuous-proof` instrument
 * exists to locate. The live baselines are therefore pinned where they are observable — in
 * `sync-drain.ts`'s header, as a differential control that can be re-run, and end-to-end against the
 * real binaries by injecting and reverting. Pinned HERE is everything that needs no DB: the ceiling
 * values, the guard directions, and the one substrate fact a reader could not otherwise catch — that
 * an EMPTY seed still produces a plausible non-zero comparison population.
 */

// ---------------------------------------------------------------------------
// The ceilings themselves
// ---------------------------------------------------------------------------

test("both ceilings are ZERO — baselined on the real 2026-07-28 sweep, which found both lists empty", () => {
  assert.equal(AGENTS_CEILING.driftCeiling, 0);
  assert.equal(CORPUS_CEILING.missingCeiling, 0);
});

// ---------------------------------------------------------------------------
// check:agents-sync — RED, and the one guard
// ---------------------------------------------------------------------------

test("agents RED: a single drifted id breaches (C=0), from either direction", () => {
  const created = evaluateAgentsSyncDrain({ missing: ["planner"], extra: [], seedAgents: 12 });
  assert.equal(created.level, "red");
  assert.equal(created.count, 1);
  assert.equal(created.suppressed, undefined);

  const deleted = evaluateAgentsSyncDrain({ missing: [], extra: ["retired-agent"], seedAgents: 12 });
  assert.equal(deleted.level, "red");
  assert.equal(deleted.count, 1);
});

test("agents RED: a rename shows as BOTH — one missing and one extra, summed to 2", () => {
  // The injected end-to-end red: renaming one seed agent id produced exactly this pair.
  const v = evaluateAgentsSyncDrain({
    missing: ["zz-renamed-friction-analyst"],
    extra: ["friction-analyst"],
    seedAgents: 12,
  });
  assert.equal(v.level, "red");
  assert.equal(v.count, 2);
  assert.match(v.breaches[0] ?? "", /1 missing live, 1 extra live/);
});

test("agents GREEN: the in-sync baseline is `ok` and sets no breach", () => {
  const v = evaluateAgentsSyncDrain({ missing: [], extra: [], seedAgents: 12 });
  assert.equal(v.level, "ok");
  assert.deepEqual(v.breaches, []);
  assert.equal(v.suppressed, undefined);
});

test("agents GUARD: a seed holding NO agents suppresses the breach — the drain there would DELETE the live tier", () => {
  // Measured: an empty seed makes every live agent read as `extra`. Enforcing would hand the next
  // session a failing gate whose named remedy (`sync-agents --pg`, seed-canonical) wipes the tier.
  const v = evaluateAgentsSyncDrain({ missing: [], extra: Array.from({ length: 12 }, (_, i) => `a-${i}`), seedAgents: 0 });
  assert.equal(v.level, "warn");
  assert.equal(v.count, 12);
  assert.equal(v.breaches.length, 1, "the breach is still COMPUTED and REPORTED — never silently dropped");
  assert.match(v.suppressed ?? "", /DELETE the live agent tier/);
});

test("agents GUARD: a live-side wipe is NOT suppressed — that breach is real and its drain repairs it", () => {
  // The asymmetry is deliberate: `sync-agents --pg` CREATES what the seed holds, so 12 missing is a
  // breach the named command fixes. Only the seed-side emptiness makes the command destructive.
  const v = evaluateAgentsSyncDrain({ missing: Array.from({ length: 12 }, (_, i) => `a-${i}`), extra: [], seedAgents: 12 });
  assert.equal(v.level, "red");
  assert.equal(v.suppressed, undefined);
});

// ---------------------------------------------------------------------------
// check:corpus-sync — RED, and the withhold
// ---------------------------------------------------------------------------

test("corpus RED: a single seed-only artifact breaches (M=0)", () => {
  // The injected end-to-end red: one net-new seed principle produced exactly this.
  const v = evaluateCorpusSyncDrain(
    { missing: ["zz-injected-seed-only-principle"], seedScope: 174 },
    { seedUnitsRead: 300 },
  );
  assert.equal(v.level, "red");
  assert.equal(v.count, 1);
  assert.match(v.breaches[0] ?? "", /of 174 are absent from the live store/);
});

test("corpus GREEN: the reconciled baseline is `ok`", () => {
  const v = evaluateCorpusSyncDrain({ missing: [], seedScope: 173 }, { seedUnitsRead: 300 });
  assert.equal(v.level, "ok");
  assert.deepEqual(v.breaches, []);
  assert.equal(v.unverified, undefined);
});

test("corpus GUARD: an empty seed FILE withholds the `ok` verdict rather than certifying a clean corpus", () => {
  // Measured against the real binary: a `[]` seed prints `OK — … (13)`, because `libraryTemplates()`
  // supplies 13 artifacts no seed file can remove. A false clean stating a plausible population is
  // exactly the shape a reader cannot catch.
  const v = evaluateCorpusSyncDrain({ missing: [], seedScope: 13 }, { seedUnitsRead: 0 });
  assert.equal(v.level, "warn");
  assert.match(v.unverified ?? "", /contributed NO units/);
});

test("corpus GUARD: an inflated live-side count is ENFORCED — its drain is migrate-only, so it can only repair", () => {
  // `sync-corpus --pg` never overwrites or deletes, so unlike its sibling there is no state in which
  // the named drain is destructive — nothing to suppress.
  const v = evaluateCorpusSyncDrain(
    { missing: Array.from({ length: 173 }, (_, i) => `a-${i}`), seedScope: 173 },
    { seedUnitsRead: 300 },
  );
  assert.equal(v.level, "red");
  assert.equal(v.suppressed, undefined);
});

// ---------------------------------------------------------------------------
// The substrate fact the guard rests on, over the REAL comparators
// ---------------------------------------------------------------------------

test("substrate: the real diffs confirm the guard directions against a deficient LIVE store", async () => {
  const seed = new InMemoryStore();
  await loadCorpus(seed);
  const empty = new InMemoryStore();

  const agents = await diffAgents(seed, empty);
  const corpus = await diffCorpus(seed, empty);

  // Both INFLATE — neither check can be deflated to a false clean by an empty live store.
  assert.ok(agents.missing.length > 0, "an empty live store inflates the agent tier's `missing`");
  assert.equal(agents.extra.length, 0);
  assert.ok(corpus.missing.length > 0, "an empty live store inflates the migration gap");

  // And that inflation is enforced on both, since each drain repairs rather than destroys.
  assert.equal(
    evaluateAgentsSyncDrain({ ...agents, seedAgents: (await seed.queryDocs({ kind: AGENT_KIND })).length }).level,
    "red",
  );
  assert.equal(
    evaluateCorpusSyncDrain({ missing: corpus.missing, seedScope: corpus.seed.length }, { seedUnitsRead: 1 }).level,
    "red",
  );
});
