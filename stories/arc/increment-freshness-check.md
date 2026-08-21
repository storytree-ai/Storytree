---
id: "increment-freshness-check"
tier: capability
story: arc
title: "The increment freshness check — staleness is measured against the repo, never assumed absent"
outcome: "A session about to consume a parked increment is told mechanically whether the repo moved under it since the increment was anchored."
status: proposed
proof_mode: integration-test
# An independent ROOT within `arc`. It declared `depends_on: [unified-command-dispatch]` under its
# previous `cli` home, because `increment check` is reached through the one dispatcher and returns
# that capability's `Envelope`. ADR-0369 retires both halves of that justification — see the body's
# "Depends on" paragraph — and a capability's `depends_on` may only name siblings inside its own
# story in any case, which `unified-command-dispatch` is no longer.
depends_on: []
# Deciding ADRs (ADR-0037 §2): ADR-0183 D2 makes the mechanical freshness check the first step of
# consuming a plan and fixes the remedy as RE-PLAN rather than repair; ADR-0305 D4 collapsed the five
# path-bearing body fields to two (`objective`, `body`), which is the surface this check mines;
# ADR-0369 D1 moves this organ into `@storytree/arc` and out of `stories/cli`.
decisions: [183, 305, 369]
# A greenfield capability registered after its implementation and tests (the arc that authored it:
# capability-layer-coverage-arc increment 6, 2026-08-08; the arc that re-homed it:
# arc-tier-extraction-arc increment 1, 2026-08-14). It resolves ONE `repo-manifest.json`
# `sourceOwnership` declaration: `packages/arc/src/increment.ts`.
#
# WHY THIS IS NOT PART OF `arc-derived-initiative-view`, ITS SIBLING IN THE SAME ORGAN. The splitting
# rule's SECOND trigger fires cleanly, and the extraction did not change it — sharing a package is
# not sharing a proof. This proof shares neither precondition nor observable with the arc view's. The
# arc view's precondition is a store holding an arc and its children, and its observable is what
# `arc show` renders. This one's precondition is a GIT CHECKOUT plus an `anchor.sha`, and its
# observable is a commit count against the paths an increment names — a number the store cannot
# produce and the rollup never carries. `increment.ts` imports nothing from `arc.ts` or
# `arc-rollup.ts` (only `@storytree/storage-protocol` and, since the extraction, `@storytree/drive`
# for the `Envelope` that used to come from the CLI's `./envelope.js`), and its suite seeds its own
# increment rows rather than creating them through the arc verbs — so no dependency edge to that
# capability is declared either. The two are siblings, not a chain.
#
# The `proof:` block is spec-borne (ADR-0057); there is deliberately NO `real:` arm: this landing was
# a MOVE rather than a re-proof. ADR-0395 classifies the unsigned greenfield unit as `proposed`;
# registration order does not make it brownfield or Adopt-bound. (This note also used to warn that a `real:` arm
# "would enter the pinned REAL-buildable snapshot in `packages/cli/src/node-build.test.ts`". Corrected
# in place 2026-08-14, ADR-0139: ADR-0341 D4 replaced that hardcoded catalogue with a DERIVED assertion,
# and the test now states "this file keeps no list to append to". There is nothing to enter and
# nothing to edit; the ADR-0085/0094 reason is the whole reason.) Both files are in `packages/arc`,
# this story's OWN building, so the
# ADR-0192 landlord rule has nothing to say about this unit in either shape — which was true before
# the move as well, when the building was `packages/cli`. Unlike its sibling, this unit never carried
# a hosting residual; what the move changed for it is the address, not the argument.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/arc", "test"]
  scope:
    testGlobs:
      - "packages/arc/src/increment.test.ts"
    sourceGlobs:
      - "packages/arc/src/increment.ts"
---

# The increment freshness check — staleness is measured against the repo, never assumed absent

**Outcome —** A session about to consume a parked increment is told mechanically whether the repo
moved under it since the increment was anchored.

**Depends on —** nothing. This is an independent root within [`arc`](story.md), and it became one in
the extraction ([ADR-0369](../../docs/decisions/0369-the-arc-domain-owns-its-own-package-and-the-arrow-runs-arc-t.md)).
It used to declare `unified-command-dispatch`, because `increment check` is reached through the one
dispatcher and returns that capability's `Envelope`. Both halves are now wrong:

- **Being dispatched by something is not depending on it — and the arrow has since inverted at the
  package boundary.** `@storytree/cli` runtime-depends on `@storytree/arc`; the reverse import does
  not exist. Declaring `arc → cli` would make the merged story graph CYCLIC and would be
  code-unbacked besides. The real coupling is declared where it points: provider-side, as
  [`arc`](story.md)'s `consumed_by: [cli]`.
- **The `Envelope` no longer comes from the CLI's package.** It is `packages/drive/src/envelope.ts`,
  which this module now imports through `@storytree/drive` rather than through the CLI's local
  `./envelope.js` re-export — so the coupling is covered by the story-level `arc → drive-machinery`
  edge, a real package.json edge.

Nothing within this story either; see the frontmatter note for why no edge runs to
[`arc-derived-initiative-view`](arc-derived-initiative-view.md).

> **Proof status (honest) — `proposed` (a real, standing, passing suite; observational; NOT
> `healthy`).** storytree's own prove-it-gate did not drive this red→green, but the code was built
> inside Storytree, so ADR-0395 keeps its unsigned authored baseline at `proposed`.
>
> **The proof — 22 tests** in `packages/arc/src/increment.test.ts`, driving the real `incrementCommand`
> over a real `InMemoryStore` with the commit counter injected as a `CountCommitsSince` dep, so the
> git side is a seam rather than a live `git log`. (7 until `tool-signal-gaps-arc` added the
> completion probe and the premise check; their two seams — `pathExists` and `decisionsSince` — are
> injected for the same reason, so the whole verdict surface stays provable with no filesystem and no
> decision log.) Since ADR-0369 the command that runs them is `pnpm --filter @storytree/arc test`.
>
> **THE HONEST LIMIT.** Because the counter is injected, this suite reds when the JUDGE breaks and
> never when a real checkout drifts. The extraction convention, the threshold arithmetic and every
> refusal branch are proven; that a real `git log` is wired correctly at the call site is not, and no
> standing command covers it.

## Guidance

**Staleness is checked, never assumed absent (ADR-0183 D2).** `storytree increment check <id>`
git-logs the paths the increment names since its `anchor.sha`. Drift past the threshold means
RE-PLAN, not repair — a GENUINELY STALE increment is re-planned by the `planner`, never patched in
place. This is the proof tier's anchor / source-drift move applied to intentions.

**But drift alone does not establish staleness** (`tool-signal-gaps-arc`, contract 7). Drift is
anchor-vs-HEAD and carries no completion signal, so it cannot tell "never built" from "built, then
the ground moved elsewhere" — and those have OPPOSITE remedies. Where the increment is already
`active`/`closed`, or a CLOSED sibling on the same arc names it as delivered, the check says so and
offers `arc increment close` rather than the planner. The re-plan remedy above is what remains once
that question is asked and answered — not the unconditional response to a drifted verdict.

**A path is a backtick-quoted token.** The increment template puts each lane's file surface in
backtick fence hints, so extraction from backticks IS "the paths the increment names" — a token
containing `/`, with no spaces, that is not a flag and not a URL. Since ADR-0305 D4 the mined fields
are `objective` and `body`; the four dropped headings were always concatenated with these and mined
identically, and their prose folds into `body` with backticks intact, so the convention is unchanged.

**An increment that names no paths is VACUOUS, not fresh.** Reporting it green would let an increment
that cites no file surface pass a check that has nothing to measure — the check says so instead.
Likewise a spent increment is refused even when fresh, because "executed once" is a stronger fact
than "nothing moved".

**The git side reads the local checkout deliberately.** The consuming session's working tree is
exactly the surface the increment will be executed against, so that — not `origin/main` — is what
freshness must be measured against.

## Integration test

**Goal —** Drive the real `incrementCommand` over a real `InMemoryStore` holding a seeded increment
whose body names backtick-quoted paths, with the commit counter injected, and witness each of the
four verdicts the consuming session acts on: fresh, drifted-past-threshold, vacuous, and spent —
plus the honest refusals for a missing anchor, an unknown id, a wrong kind and a malformed sha.

## Contracts (8)

The test-proven leaf behaviours — each **one isolated automated test** with collaborators stubbed
(ADR-0002). Test titles are cited rather than line ranges, which rot.

1. **`named-paths-come-from-backticks`** — the mined path set is exactly the backtick-quoted path tokens
   - **asserts —** `extractIncrementPaths` pulls backtick-quoted tokens that look like paths from `objective` and `body`, deduped in first-appearance order, and rejects flags, commands, URLs and ordinary prose.
   - **covers —** `packages/arc/src/increment.ts` (`extractIncrementPaths`, `INCREMENT_BODY_FIELDS`)
   - **proven by —** `packages/arc/src/increment.test.ts`, *"extractIncrementPaths pulls backtick path tokens and rejects flags/commands/URLs/prose"* (REAL, passing)
2. **`fresh-when-nothing-moved`** — no commits against the named paths since the anchor reports fresh
   - **asserts —** With zero commits counted against every named path since `anchor.sha`, the check returns `ok:true` and reports the increment fresh.
   - **covers —** `packages/arc/src/increment.ts` (`incrementCheck`)
   - **proven by —** `packages/arc/src/increment.test.ts`, *"increment check is FRESH when no named path moved since the anchor"* (REAL, passing)
3. **`drift-past-threshold-says-re-plan`** — the remedy named is re-plan, not repair
   - **asserts —** Commit counts past the threshold return a drifted verdict whose guidance directs a re-plan rather than a repair of the existing increment.
   - **covers —** `packages/arc/src/increment.ts` (`incrementCheck`, the threshold branch)
   - **proven by —** `packages/arc/src/increment.test.ts`, *"increment check is DRIFTED past the threshold → re-plan, not repair"* (REAL, passing)
4. **`a-vacuous-increment-is-never-green`** — naming no paths is reported as vacuous, not as fresh
   - **asserts —** An increment whose mined path set is empty returns a vacuous verdict rather than the fresh verdict a zero drift count would otherwise produce.
   - **covers —** `packages/arc/src/increment.ts` (`incrementCheck`, the empty-path-set branch)
   - **proven by —** `packages/arc/src/increment.test.ts`, *"increment check is honest about an increment that names no paths (vacuous, not green)"* (REAL, passing)
5. **`a-spent-increment-is-never-blessed`** — executed-once outranks a clean drift count
   - **asserts —** An increment already executed is refused even when no named path has moved, so freshness can never re-authorise spent work.
   - **covers —** `packages/arc/src/increment.ts` (`incrementCheck`, the spent branch)
   - **proven by —** `packages/arc/src/increment.test.ts`, *"increment check refuses to bless a spent increment even when fresh (executed once, ADR-0183 D2)"* (REAL, passing)
6. **`a-broken-anchor-fails-honestly`** — every unusable input is guidance, never a throw and never a pass
   - **asserts —** A missing anchor, an unknown id, a wrong-kind doc and a malformed sha each return `ok:false` with a descriptive envelope rather than throwing or reporting fresh.
   - **covers —** `packages/arc/src/increment.ts` (`incrementCheck`, the refusal branches)
   - **proven by —** `packages/arc/src/increment.test.ts`, *"increment check fails honestly on a missing anchor, an unknown id, a wrong kind, and a bad sha"* (REAL, passing)
7. **`drifted-but-delivered-is-not-re-planned`** — drift over already-delivered work does not recommend the planner
   - **asserts —** A DRIFTED increment that is `active`/`closed`, or that a CLOSED sibling on the same arc names in its `objective`/`body`/`outcome.note`, reports that it may have nothing left to build and offers `arc increment close` rather than `storytree agents planner`. Drift with NO completion evidence still recommends re-planning, and says it looked.
   - **covers —** `packages/arc/src/increment.ts` (`deliveredBySibling`, `arcIdOf`, `probeDelivery`, the `alreadyDone` branch)
   - **proven by —** `packages/arc/src/increment.test.ts`, *"DRIFTED + a closed sibling recording delivery does NOT recommend the planner"* (REAL, passing)
   - **why it is its own contract —** drift is anchor-vs-HEAD and carries NO completion signal, so "never built" and "built, then the ground moved" were indistinguishable while having opposite remedies (`tool-signal-gaps-arc`, friction `drifted-increment-may-be-already-delivered`; measured on `explorer-onboarding-plan-1`, which cost a whole session re-planning work landed three weeks earlier).
8. **`the-premise-is-checked-not-just-the-anchor`** — signals the commit count cannot carry are reported on BOTH verdicts
   - **asserts —** Named paths that no longer exist and decisions landed since the anchor date are reported under a `PREMISE` heading on a FRESH verdict as well as a DRIFTED one; a glob is never called vanished; the decision list is capped most-recent-first with an uncapped count and `adr list --current` named for the rest; no signal prints no block.
   - **covers —** `packages/arc/src/increment.ts` (`premiseSignals`, `IncrementPremiseDeps`, the premise render)
   - **proven by —** `packages/arc/src/increment.test.ts`, *"the premise block fires on a FRESH increment — it is ORTHOGONAL to drift"* (REAL, passing)
   - **why it is its own contract —** a parked entry prescribes a remedy against the world as it was when parked, and the anchor answers only "did the ground move"; the costly case is FRESH-but-dead-on-arrival, which the drift verdict cannot see at all (friction `a-parked-entrys-premise-can-be-overtaken-with-no-freshness-check`). Both seams are injected and OPTIONAL, so an absent one degrades to the prior behaviour rather than to a wrong answer.
