---
id: "act2-beat-director"
tier: capability
story: website-experience
title: "The Act 2 beat director — the five-beat teaching script as pure, provable choreography"
outcome: "A pure, deterministic, visitor-paced director in @storytree/forest-world-r3f: beats are typed data (scene delta + camera target + narration key), advance() moves exactly one beat per call and parks on the final CTA state, a limb may turn green ONLY when its delta carries a signed-proof marker, the beat-4 wrong-way UI→DB road is flagged as an antipattern from the data — and the exported default script IS the five approved research-table beats, walking end-to-end."
status: proposed
proof_mode: integration-test
depends_on: [r3f-world-spike]
decisions: [134]
# Node-borne proof config (ADR-0057 keystone). NET-NEW in the spike-born package: the leaf authors a
# node:test file importing a NOT-YET-EXISTING act2-director module (red = module-not-found at HEAD),
# then writes it (green). The director is PURE .ts — beats-as-data in, scene states out; no React,
# no three.js, no timers (visitor-paced means state changes ONLY on advance()) — so it is
# node:test-provable and rides the same sync artifact as the mapper. install: true (it builds World
# fixtures via @storytree/forest-world and the r3f package's own descriptor types) + the typecheck
# wall. The NARRATION COPY is deliberately NOT here: beats carry narration KEYS; the words are
# site-side fictional content (the Cohoot precedent) keyed by beat id — structure/choreography is
# parent-side and provable, words stay with the surface.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/forest-world-r3f", "test"]
  scope:
    testGlobs: ["packages/forest-world-r3f/src/**/*.test.ts"]
    sourceGlobs: ["packages/forest-world-r3f/src/**/*.ts"]
  real:
    testFile: "packages/forest-world-r3f/src/act2-director.test.ts"
    sourceFile: "packages/forest-world-r3f/src/act2-director.ts"
    scope:
      testGlobs: ["packages/forest-world-r3f/src/act2-director.test.ts"]
      sourceGlobs: ["packages/forest-world-r3f/src/act2-director.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/forest-world-r3f", "typecheck"]
---

# The Act 2 beat director — the five-beat teaching script as pure, provable choreography

**Outcome —** A pure, deterministic, **visitor-paced** director in `@storytree/forest-world-r3f`:
beats are typed data (scene delta + camera target + narration key), `advance()` moves exactly one
beat per call and parks on the final CTA state, a limb may turn green ONLY when its delta carries a
signed-proof marker, the beat-4 wrong-way UI→DB road is flagged as an antipattern from the data —
and the exported default script IS the five approved beats, walking end-to-end.

**Depends on —** [`r3f-world-spike`](r3f-world-spike.md) — the director lives in the mapper's
package and emits the World / scene inputs the mapper draws.

> **Proof status (honest) — BUILT, leaf-proven; the authored status stays `proposed`.** The gated
> SDK leaf authored the NET-NEW director through the real prove-it-gate: the test observed red at
> HEAD (module-not-found — `act2-director.ts` did not exist), then the pure module green (run
> `real-mr32b6ib`, signed PASS @ `2358bc4` 2026-07-02, persisted to `events.verdict`; package
> typecheck + suite observed green in the installed worktree). Consolidated on top (never amending
> the verdict commit): the `zod` dep (orchestrator glue, a leaf never touches package.json) and the
> exported ZOD contract this spec names — `BeatScript` / `Beat` / `BeatDelta` / `LimbDelta`
> (`packages/forest-world-r3f/src/act2-director.ts:120`/`:104`/`:48`), with `advance()`
> (`act2-director.ts:196`) parsing each beat before applying it so a green-without-marker limb is
> REFUSED at runtime (`Beat.parse`, `act2-director.ts:203`; the `LimbDelta` refine,
> `act2-director.ts:60`) — the teaching claims are runtime contracts, not type hints; the named
> `defaultScript` export (`act2-director.ts:220`, the five approved beats) and the pure director
> surface re-exported from the root barrel (`packages/forest-world-r3f/src/index.ts:32`); and
> contract-id-led tests (`storytree coverage act2-beat-director` → 4/4) adding the two-walk
> determinism, mutated-script refusal, and contract-parse assertions. The five beats were APPROVED
> CONTENT before the build — the beat table in
> [docs/research/vibe-coding-gripes-2026.md](../../docs/research/vibe-coding-gripes-2026.md) ("The
> Act 2 spine") carried through ADR-0134 and the owner decisions of 2026-07-02; the choreography is
> now a provable ENGINE rather than ad-hoc site script.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: the beat contract, the advance state machine, and the
default five-beat script are one organism — a script player — proven by integration (a full walk of
the real default script through the real state machine), not a single isolated assertion.

THE MODEL. A `Beat` = `{ id, narrationKey, camera, delta }` where `delta` describes what the world
GAINS this beat in the mapper's semantic vocabulary (plant a story node; attach a wisp; branch
capabilities with per-limb proof state; add roads with an optional declared-violation flag; widen to
the full forest). `DirectorState` = `{ beatIndex, world, camera, done }`. `advance(state, script)`
is a pure function — no timers, no RNG, no auto-play: VISITOR-PACED is a structural property (state
changes only when the visitor's Next-tap calls advance), which is the deliberate inverse of Act 1's
all-at-once (ADR-0134 §3).

THE FIVE APPROVED BEATS (the exported default script — the research-table rows, verbatim in spirit):

1. **Plant a story** — a seed grows into a tree with its OUTCOME on a label (intent is a thing on
   the map, not buried in a chat log).
2. **Watch a wisp** — a soft wisp drifts over the tree (presence without obligation).
3. **It branches** — capability limbs appear; a limb turns green ONLY on a signed passing proof —
   the delta for a green limb MUST carry the signed-proof marker; a "done"-without-proof delta
   cannot colour it (the verification-gap answer, enforced in data).
4. **Stories connect** — roads draw the DAG; one road is the wrong-way UI→DB road skipping the
   service layer, flagged as an antipattern FROM ITS DATA (a declared layer violation), visibly
   distinct the moment it is drawn.
5. **Pull back** — the camera widens to the whole legible forest (green = proven, sapling =
   in-progress, withered = broken), then `done: true` — the CTA state.

WORDS STAY SITE-SIDE. Beats carry `narrationKey`s; the plain-language copy and the fictional story
names live in the web repo keyed by beat id (the fictional-data precedent, ADR-0093 §3/§4). The
exported zod contract is what keeps site-side data honest — the site parses its beat copy against
it at build time.

FENCES: no React, no three.js, no timers/tweens in this module (interpolation is the canvas layer's
job); no live data ever (the diorama is fictional by boundary); do not encode narration STRINGS
here.

## Integration test

**Goal —** Prove the real default script through the real state machine: five visitor-paced steps,
the proof-gated green, the flagged wrong-way road, the CTA park.

1. Walk `advance()` from the initial empty-land state through the full exported default script →
   assert exactly five steps to `done: true`, one beat per call, deterministic across two walks
   (deep-equal states), and no state change without a call (visitor-paced structurally).
2. After beat 3 → assert the branched limbs' proof states: every green limb's delta carried the
   signed-proof marker; construct a mutated script whose beat-3 delta claims green WITHOUT the
   marker → assert the director refuses it (contract violation), so a faked "done" cannot colour
   the tree even in fiction.
3. After beat 4 → assert the road set contains exactly one antipattern-flagged road (the UI→DB
   skip), flagged because its data declares the layer violation — not by id or copy.
4. Parse the exported default script with the exported zod contract → assert it validates (the same
   contract the site uses for its narration keys), and `advance()` past `done` is a no-op (the CTA
   state parks; no wrap-around).

## Contracts (4)

Each one isolated automated test (`node:test`, the `@storytree/forest-world-r3f` suite). Per
ADR-0122 each contract id leads a distinctly-named test so `storytree coverage act2-beat-director`
reports 4/4.

1. **`abd-advance-is-visitor-paced-and-deterministic`** — one tap, one beat, same walk every time
   - **asserts —** `advance()` moves exactly one beat per call, two walks of the same script are
     deep-equal, state never changes without a call, and past-`done` advances are parking no-ops.
   - **covers —** `packages/forest-world-r3f/src/act2-director.ts`
2. **`abd-green-only-on-signed-proof`** — the beat-3 thesis is a data contract, not copy
   - **asserts —** a limb renders green only when its delta carries the signed-proof marker; a
     green-without-marker delta is refused loudly.
   - **covers —** `packages/forest-world-r3f/src/act2-director.ts`
3. **`abd-wrong-way-road-is-flagged-from-data`** — the antipattern is visible by construction
   - **asserts —** the beat-4 UI→DB road emits an antipattern-flagged road descriptor because its
     data declares the layer violation, distinct from every well-directed road.
   - **covers —** `packages/forest-world-r3f/src/act2-director.ts`
4. **`abd-default-script-is-the-five-approved-beats`** — the shipped choreography is the approved one
   - **asserts —** the exported default script validates against the exported contract, is exactly
     the five beats above in order, and walks end-to-end to the CTA state.
   - **covers —** `packages/forest-world-r3f/src/act2-director.ts`

## Guidance — the slice that earns the signed verdict

The bootstrap rung (ADR-0057 §3, NET-NEW), after `r3f-world-spike` has borne the package:

- **The new test —** `packages/forest-world-r3f/src/act2-director.test.ts` (`node:test` +
  `node:assert/strict`). Import `{ advance, defaultScript, BeatScript }` from
  `"./act2-director.js"`. Name each test for its contract id (`abd-…`).
- **The RED the spine observes —** module-not-found: `act2-director.ts` does not exist at HEAD.
- **The GREEN —** write the pure module: the zod beat contract, the `advance` state machine, the
  exported default five-beat script emitting deltas in the mapper's semantic vocabulary. After it,
  the package suite + typecheck stay green; the artifact reaches the site through
  `web-experience-sync` unchanged.

Rules:

- **Pure and visitor-paced by construction** — no timers, no auto-play, no RNG in this module.
- **The teaching claims are contracts** — proof-gated green and the flagged wrong-way road live in
  the data model, so the site cannot accidentally ship a diorama that contradicts the thesis.
- **Keys, not copy** — narration text never enters the parent package.
- **The mapper's vocabulary is the interface** — deltas speak scene-semantics (`kind` / status /
  road), never pixels.
