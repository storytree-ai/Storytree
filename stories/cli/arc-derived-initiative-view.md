---
id: "arc-derived-initiative-view"
tier: capability
story: cli
title: "The arc's derived initiative view — children stamp the arc, the arc stamps nothing"
outcome: "A session arriving cold on a long-running initiative reads its whole current state from the arc alone."
status: mapped
proof_mode: integration-test
depends_on: [unified-command-dispatch]
# Deciding ADRs (ADR-0037 §2): ADR-0183 D3 puts every containment edge on the CHILD (the derived
# view); ADR-0267 D4/D7 gives arcs the map's top drawer and derives `waiting` from open questions —
# its Consequences are why the JOIN had to stop being CLI-only; ADR-0305 collapses the increment
# lifecycle to one durable typed tier (proposal → ready → active → closed); ADR-0314 D5 makes the
# `open-question` artifact mandatory on escalation, which is why `question new` exists and why its
# `--arc` is required where the schema's `arcRef` is optional.
decisions: [183, 267, 305, 314]
# A brownfield capability over already-implemented, already-tested code (the arc that authored it:
# capability-layer-coverage-arc increment 6, 2026-08-08). It resolves THREE story-grain
# `repo-manifest.json` declarations: `packages/cli/src/arc.ts`, `packages/cli/src/question.ts`
# (both were `cli`) and `packages/drive/src/arc-rollup.ts` (was `drive-machinery`).
#
# WHY THE JOIN IS OWNED HERE AND NOT BY `drive-machinery`, WHOSE BUILDING IT SITS IN. Its own header
# (`packages/drive/src/arc-rollup.ts:17-19`) says it lives in `drive` "because BOTH readers must
# share it and they cannot share cli" — a REACH statement, not a competence claim, and
# `drive-machinery`'s outcome (drive a registered node red→green and land the proven commit) does not
# cover an initiative-view join. The map has already settled this exact shape FIVE times in this
# direction: `packages/drive/src/envelope.ts` and `secrets.ts` -> `unified-command-dispatch`,
# `packages/drive/src/adr-*.ts` -> `cli-resident-corpus-tools`, `packages/drive/src/source-ownership-map.ts`
# and `subtree-match.ts` -> `organism-boundary-tooling` — every one a file ADR-0112 moved into `drive`
# for reach while ownership stayed with the story whose competence it is. `envelope.ts` is the closest
# twin and it is decisive: same package, same mover, same reason, already owned by a `cli` capability.
#
# THE TWO-SUITE COMMAND IS NOT A CONVENIENCE — EACH HALF SEES SOMETHING THE OTHER CANNOT, and the
# precedent for naming both is `drive-machinery`'s `post-build-curation-pass`. `pnpm --filter
# @storytree/cli test` reaches the join THROUGH `arc.ts`'s static `@storytree/drive` import, so
# `arc.test.ts`'s derivation assertions genuinely exercise `arc-rollup.ts` — but it never runs
# `arc-rollup.test.ts`, whose eight cases are the only ones holding the join's own purity and
# defensive branches. `pnpm --filter @storytree/drive test` runs those eight and never sees a single
# CLI verb. A single-package command would leave one half of this outcome unproven.
#
# The `proof:` block is spec-borne (ADR-0057); there is deliberately NO `real:` arm:
#   1. ADR-0085/ADR-0094 — mapped brownfield, so the green path is Adopt, never a manufactured red
#      over mature code. A `real:` arm would also enter the pinned REAL-buildable snapshot in
#      `packages/cli/src/node-build.test.ts`, where this id sorts BETWEEN `app-surface-world-view`
#      and `arc-explicit-id-fidelity` — exactly the adjacency `:627` pins. Verified: with no `real:`
#      arm this id appears in that catalog zero times, so the snapshot does not move.
#   2. `readUnitSourceFiles` (`packages/cli/src/check-boundaries.ts:210-234`) `continue`s on an absent
#      `real` (`:226`), so this unit contributes nothing to `unitSourceFiles` and neither the ADR-0192
#      landlord rule (rule 5) nor the packages-forward refusal (rule 6) fires over its `packages/drive`
#      file. That is a CONSEQUENCE of the ADR-0094 shape, never the reason for it — see the honesty
#      note in the body, which states the residual plainly rather than banking it.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "--filter", "@storytree/cli", "test"]
  scope:
    testGlobs:
      - "packages/drive/src/arc-rollup.test.ts"
      - "packages/cli/src/arc.test.ts"
      - "packages/cli/src/question.test.ts"
    sourceGlobs:
      - "packages/drive/src/arc-rollup.ts"
      - "packages/cli/src/arc.ts"
      - "packages/cli/src/question.ts"
---

# The arc's derived initiative view — children stamp the arc, the arc stamps nothing

**Outcome —** A session arriving cold on a long-running initiative reads its whole current state from
the arc alone.

**Depends on —** [`unified-command-dispatch`](unified-command-dispatch.md) — the arc, increment and
question verbs are reached through the one dispatcher (`commands.ts:2772-2815`) and every one of them
returns that capability's `Envelope`. No edge to
[`arc-explicit-id-fidelity`](arc-explicit-id-fidelity.md) is declared here and the direction is why:
that capability is a `proposed` refinement OF this one's `arcNew`, so the arrow runs from it to this,
never back. Declaring the reverse would put a cycle in the story graph.

> **Proof status (honest) — `mapped` (a real, standing, passing suite; observational; NOT
> `healthy`).** storytree's own prove-it-gate did not drive any of this red→green. That is what
> `mapped` records (ADR-0094), and it is why there is no `real:` arm.
>
> **The proof — 71 tests across three files.** `packages/cli/src/arc.test.ts` (51),
> `packages/cli/src/question.test.ts` (12), `packages/drive/src/arc-rollup.test.ts` (8).
>
> **THE RESIDUAL, STATED PLAINLY BECAUSE THE FRONTMATTER NOTE ONLY EXPLAINS WHY THE GATE IS SILENT.**
> This capability owns a file in `drive-machinery`'s building. ADR-0192 decision 2 pushes genuinely
> new hosted work toward its own package, and the only reason no rule fires here is that the ADR-0094
> brownfield shape leaves `real:` empty — the rules read `proof.real`, not this map. That silence is a
> mechanical fact, not a decided exemption. What makes the declaration honest is the FIVE-precedent
> line in the frontmatter (`envelope.ts`, `secrets.ts`, `adr-*.ts`, `source-ownership-map.ts`,
> `subtree-match.ts` — all `packages/drive` files owned by `cli` capabilities), not the silence. If
> this organ ever earns a `real:` arm, its source file must be the `packages/cli` half or the organ
> must move to its own package first.

## Guidance

**The invariant this capability exists to hold (ADR-0183 D3).** Every containment edge lives on the
CHILD — a plan's `arcRef`, an open question's `arcRef` (ADR-0267 D4), an ADR's frontmatter `arc:`
stamp, a story's frontmatter `arc:` stamp. The arc row itself is never edited when a child lands
(ADR-0305 D3). So the upward view is a QUERY and can never drift from the work it describes, and
`packages/drive/src/arc-rollup.ts` is the one place that query lives.

**The three files and the one job.** `arc-rollup.ts` derives the join and is PURE at its core
(`deriveArcRollup`); `arc.ts` owns the arc and increment WRITE verbs plus the rendering of that
rollup into an ADR-0023 envelope; `question.ts` owns `question new`, which is an arc-stamped write
whose whole purpose is to put something into the rollup's `waiting` leg. They are import-independent
of one another except for `arc.ts`'s dependency on the join, and they are one capability because they
share one observable: what `arc show` reports.

**`--arc` is required here though `arcRef` is optional on the schema.** A permissive schema and a
fail-closed authoring path are the two halves of keeping old rows readable while refusing to mint new
bad ones. An unhomed question is not a lesser question but an INVISIBLE one — the arc surface derives
its waiting set by querying `arcRef`, so a question without one is authored into a tier nothing reads.

**An increment closes; it is never deleted (ADR-0305 D2/D5).** The lifecycle is
`proposal → ready → active → closed` with no `consumed` and no `superseded` state, because the
difference between those two terminal states was a REASON rather than a state. `--note` is therefore
REQUIRED when there is no `--pr`, so a closure that is not a landing cannot read as one.

## Integration test

**Goal —** Seed a store with an arc, stamp each child surface onto it independently — an increment
parked then closed, a question authored through `question new --arc`, an ADR and a story stamped on
disk — then drive `arc show` and witness the view derive every one of them from the children's own
stamps, with no edge ever authored on the arc itself.

Real collaborators, no stubs within the organism: the CLI-side suites drive the real `arcCommand` /
`questionCommand` over a real `InMemoryStore` and a real temp checkout for the frontmatter stamps, so
the real `loadArcRollup` in `@storytree/drive` runs underneath. `question.test.ts` closes the loop
explicitly — it imports `arcCommand` (`:9`) and asserts a question authored through the write verb is
what `arc show` then reports as waiting.

## Contracts (8)

The test-proven leaf behaviours — each **one isolated automated test** with collaborators stubbed
(ADR-0002). Test titles are cited rather than line ranges, which rot.

1. **`child-stamps-derive-the-view`** — the join reads all four child legs off the children and leaks no other arc's children
   - **asserts —** `loadArcRollup` joins increments, plans, ADRs and stories for exactly the requested arc; a child stamped to a different arc never appears.
   - **covers —** `packages/drive/src/arc-rollup.ts` (`deriveArcRollup`, `loadArcRollup`, `arcRefOf`, `storyArcStamps`)
   - **proven by —** `packages/drive/src/arc-rollup.test.ts`, *"loadArcRollup joins all four child legs and leaks no other arc's children"*; and end-to-end through the render in `packages/cli/src/arc.test.ts`, *"arc show derives plans (arcRef), ADRs (frontmatter stamp), and stories (frontmatter stamp)"* (both REAL, passing)
2. **`waiting-is-derived-never-invented`** — `waiting` comes from open questions, and no `blocked` state is manufactured
   - **asserts —** The rollup's `waiting` leg is derived from the arc's open questions (ADR-0267 D7); no `blocked` flag is invented where the children do not carry one.
   - **covers —** `packages/drive/src/arc-rollup.ts` (`deriveArcRollup`, the question leg)
   - **proven by —** `packages/drive/src/arc-rollup.test.ts`, *"ADR-0267 D7: `waiting` is derived from open questions, and `blocked` is NOT invented"* (REAL, passing)
3. **`the-join-is-pure`** — the derivation reaches no store and no filesystem
   - **asserts —** `deriveArcRollup` returns identical output for identical inputs with no store or `fs` in reach, so the two surfaces that render it cannot diverge on I/O.
   - **covers —** `packages/drive/src/arc-rollup.ts` (`deriveArcRollup`)
   - **proven by —** `packages/drive/src/arc-rollup.test.ts`, *"deriveArcRollup is PURE — the same inputs join identically with no store or fs in reach"* (REAL, passing)
4. **`writer-and-reader-agree`** — an arc scaffolded by the write verb is immediately readable by the view path
   - **asserts —** `arc new` stamps every mechanical field and the resulting row is read back by the derived view without a migration or a second write.
   - **covers —** `packages/cli/src/arc.ts` (`arcNew`), `packages/drive/src/arc-rollup.ts` (`loadArcRollup`)
   - **proven by —** `packages/cli/src/arc.test.ts`, *"a scaffolded arc is immediately readable by the arc VIEW path (writer + reader agree)"* (REAL, passing)
5. **`an-increment-closes-and-is-never-deleted`** — closure is terminal, write-once, and requires a reason when it is not a landing
   - **asserts —** `arc increment close` marks one increment terminal rather than removing it; a second closure is refused; `--note` is required when there is no `--pr`.
   - **covers —** `packages/cli/src/arc.ts` (`arcIncrementClose`)
   - **proven by —** `packages/cli/src/arc.test.ts`, *"arc increment close marks one TERMINAL — it is closed, never deleted (ADR-0305 D5)"* and *"arc increment close REQUIRES a reason when there is no --pr (ADR-0305 D2's collapsed states)"* (REAL, passing)
6. **`a-question-is-homed-or-refused`** — `--arc` is required, must resolve, and must name an arc
   - **asserts —** `question new` refuses a missing `--arc`, a dangling `--arc`, and an `--arc` naming a doc of another kind — before writing anything.
   - **covers —** `packages/cli/src/question.ts` (`questionNew`, the arc fence)
   - **proven by —** `packages/cli/src/question.test.ts`, *"question new refuses a dangling arc — a question no arc surfaces is the measured failure"* and *"question new refuses an --arc that names a doc of some other kind"* (REAL, passing)
7. **`a-homed-question-surfaces-as-waiting`** — the write verb and the derived view meet on one observable
   - **asserts —** A question authored through `question new --arc` is exactly what `arc show` subsequently reports in the arc's waiting leg.
   - **covers —** `packages/cli/src/question.ts` (`questionNew`), `packages/cli/src/arc.ts` (`arcCommand` render), `packages/drive/src/arc-rollup.ts` (the question leg)
   - **proven by —** `packages/cli/src/question.test.ts`, *"a question authored here is what arc show then reports as WAITING"* (REAL, passing)
8. **`live-canonical-writes-refuse-offline`** — arcs and questions are live-only, and the refusal is guidance
   - **asserts —** `arc new` and `question new` refuse without a live store, returning `ok:false` with a `--pg` pointer rather than writing to the offline seed.
   - **covers —** `packages/cli/src/arc.ts` (`arcNew`), `packages/cli/src/question.ts` (`questionNew`)
   - **proven by —** `packages/cli/src/arc.test.ts`, *"arc new refuses offline — arcs are live-canonical"*; `packages/cli/src/question.test.ts`, *"question new refuses offline — questions are live-canonical"* (REAL, passing)

## Open modeling call (for the owner)

**This organ has no owning organism story, and homing it under the CLI shim is a compromise, not a
resolution.** `stories/cli/story.md:63` states that "the shim owns the wiring, not the journeys" and
that deep per-domain journeys belong to their organism story. The arc tier is a genuine per-domain
journey — it has its own kinds in the library schema (`arc`, `increment`, `open-question`), its own
ADR family (0183 / 0267 / 0305 / 0314), a studio lens owned by `studio`
([`arc-orientation-lens`](../studio/arc-orientation-lens.md)) and a desktop mirror — so unlike
`guided-setup-repair` and `verification-decay-instruments`, which entered this story because no
organism owns a dev's own machine or the repo's verification apparatus, this one has a domain that
is simply UNMODELLED.

The honest end-state is its own story backed by its own workspace package, which is what ADR-0192
decision 2 (packages-forward) requires of any new story. That is a code move plus an owner-reviewed
diff, not an ownership declaration, so it was not taken here. Until then this capability keeps the
organ addressable and provable under the story whose suite observes it, and it adds one more case to
this story's still-open modeling call 1 (the shim-vs-journey split) without resolving it.
