---
id: "increment-freshness-check"
tier: capability
story: cli
title: "The increment freshness check — staleness is measured against the repo, never assumed absent"
outcome: "A session about to consume a parked increment is told mechanically whether the repo moved under it since the increment was anchored."
status: mapped
proof_mode: integration-test
depends_on: [unified-command-dispatch]
# Deciding ADRs (ADR-0037 §2): ADR-0183 D2 makes the mechanical freshness check the first step of
# consuming a plan and fixes the remedy as RE-PLAN rather than repair; ADR-0305 D4 collapsed the five
# path-bearing body fields to two (`objective`, `body`), which is the surface this check mines.
decisions: [183, 305]
# A brownfield capability over already-implemented, already-tested code (the arc that authored it:
# capability-layer-coverage-arc increment 6, 2026-08-08). It resolves ONE story-grain
# `repo-manifest.json` declaration: `packages/cli/src/increment.ts` (was `cli`).
#
# WHY THIS IS NOT PART OF `arc-derived-initiative-view`, ITS SIBLING IN THE SAME ORGAN. The splitting
# rule's SECOND trigger fires cleanly: this proof shares neither precondition nor observable with the
# arc view's. The arc view's precondition is a store holding an arc and its children, and its
# observable is what `arc show` renders. This one's precondition is a GIT CHECKOUT plus an
# `anchor.sha`, and its observable is a commit count against the paths an increment names — a number
# the store cannot produce and the rollup never carries. `increment.ts` imports nothing from `arc.ts`
# or `arc-rollup.ts` (only `@storytree/storage-protocol` and `./envelope.js`), and its suite seeds its
# own increment rows rather than creating them through the arc verbs, so no dependency edge to that
# capability is declared either — the two are siblings, not a chain.
#
# The `proof:` block is spec-borne (ADR-0057); there is deliberately NO `real:` arm: ADR-0085/ADR-0094
# — mapped brownfield, so the green path is Adopt, never a manufactured red over mature code. A
# `real:` arm would also enter the pinned REAL-buildable snapshot in
# `packages/cli/src/node-build.test.ts`; verified, with no `real:` arm this id appears there zero
# times. Both files are in `packages/cli`, this story's OWN building, so the ADR-0192 landlord rule
# has nothing to say about this unit in either shape.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/cli", "test"]
  scope:
    testGlobs:
      - "packages/cli/src/increment.test.ts"
    sourceGlobs:
      - "packages/cli/src/increment.ts"
---

# The increment freshness check — staleness is measured against the repo, never assumed absent

**Outcome —** A session about to consume a parked increment is told mechanically whether the repo
moved under it since the increment was anchored.

**Depends on —** [`unified-command-dispatch`](unified-command-dispatch.md) — `increment check` is
reached through the one dispatcher and returns that capability's `Envelope`. Nothing within this
story otherwise; see the frontmatter note for why no edge runs to
[`arc-derived-initiative-view`](arc-derived-initiative-view.md).

> **Proof status (honest) — `mapped` (a real, standing, passing suite; observational; NOT
> `healthy`).** storytree's own prove-it-gate did not drive this red→green. That is what `mapped`
> records (ADR-0094), and it is why there is no `real:` arm.
>
> **The proof — 7 tests** in `packages/cli/src/increment.test.ts`, driving the real `incrementCommand`
> over a real `InMemoryStore` with the commit counter injected as a `CountCommitsSince` dep, so the
> git side is a seam rather than a live `git log`.
>
> **THE HONEST LIMIT.** Because the counter is injected, this suite reds when the JUDGE breaks and
> never when a real checkout drifts. The extraction convention, the threshold arithmetic and every
> refusal branch are proven; that a real `git log` is wired correctly at the call site is not, and no
> standing command covers it.

## Guidance

**Staleness is checked, never assumed absent (ADR-0183 D2).** `storytree increment check <id>`
git-logs the paths the increment names since its `anchor.sha`. Drift past the threshold means
RE-PLAN, not repair — a drifted increment is re-planned by the `planner`, never patched in place.
This is the proof tier's anchor / source-drift move applied to intentions.

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

## Contracts (6)

The test-proven leaf behaviours — each **one isolated automated test** with collaborators stubbed
(ADR-0002). Test titles are cited rather than line ranges, which rot.

1. **`named-paths-come-from-backticks`** — the mined path set is exactly the backtick-quoted path tokens
   - **asserts —** `extractIncrementPaths` pulls backtick-quoted tokens that look like paths from `objective` and `body`, deduped in first-appearance order, and rejects flags, commands, URLs and ordinary prose.
   - **covers —** `packages/cli/src/increment.ts` (`extractIncrementPaths`, `INCREMENT_BODY_FIELDS`)
   - **proven by —** `packages/cli/src/increment.test.ts`, *"extractIncrementPaths pulls backtick path tokens and rejects flags/commands/URLs/prose"* (REAL, passing)
2. **`fresh-when-nothing-moved`** — no commits against the named paths since the anchor reports fresh
   - **asserts —** With zero commits counted against every named path since `anchor.sha`, the check returns `ok:true` and reports the increment fresh.
   - **covers —** `packages/cli/src/increment.ts` (`incrementCheck`)
   - **proven by —** `packages/cli/src/increment.test.ts`, *"increment check is FRESH when no named path moved since the anchor"* (REAL, passing)
3. **`drift-past-threshold-says-re-plan`** — the remedy named is re-plan, not repair
   - **asserts —** Commit counts past the threshold return a drifted verdict whose guidance directs a re-plan rather than a repair of the existing increment.
   - **covers —** `packages/cli/src/increment.ts` (`incrementCheck`, the threshold branch)
   - **proven by —** `packages/cli/src/increment.test.ts`, *"increment check is DRIFTED past the threshold → re-plan, not repair"* (REAL, passing)
4. **`a-vacuous-increment-is-never-green`** — naming no paths is reported as vacuous, not as fresh
   - **asserts —** An increment whose mined path set is empty returns a vacuous verdict rather than the fresh verdict a zero drift count would otherwise produce.
   - **covers —** `packages/cli/src/increment.ts` (`incrementCheck`, the empty-path-set branch)
   - **proven by —** `packages/cli/src/increment.test.ts`, *"increment check is honest about an increment that names no paths (vacuous, not green)"* (REAL, passing)
5. **`a-spent-increment-is-never-blessed`** — executed-once outranks a clean drift count
   - **asserts —** An increment already executed is refused even when no named path has moved, so freshness can never re-authorise spent work.
   - **covers —** `packages/cli/src/increment.ts` (`incrementCheck`, the spent branch)
   - **proven by —** `packages/cli/src/increment.test.ts`, *"increment check refuses to bless a spent increment even when fresh (executed once, ADR-0183 D2)"* (REAL, passing)
6. **`a-broken-anchor-fails-honestly`** — every unusable input is guidance, never a throw and never a pass
   - **asserts —** A missing anchor, an unknown id, a wrong-kind doc and a malformed sha each return `ok:false` with a descriptive envelope rather than throwing or reporting fresh.
   - **covers —** `packages/cli/src/increment.ts` (`incrementCheck`, the refusal branches)
   - **proven by —** `packages/cli/src/increment.test.ts`, *"increment check fails honestly on a missing anchor, an unknown id, a wrong kind, and a bad sha"* (REAL, passing)
