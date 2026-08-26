---
id: "map-live-hierarchy-read"
tier: capability
story: studio
arc: map-freshness-arc
title: "The map reads the work hierarchy from the live store"
outcome: "The forest map's question and its proof come from one clock, so a criterion re-worded since the app was built no longer reads as unproven."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [445, 302, 253]
# GREENFIELD, and deliberately NO `real:` arm — the same reason `store-connection-signal` and
# `arc-orientation-lens` state next door: `readUnitSourceFiles` (packages/cli/src/check-boundaries.ts)
# reads ONLY `real.sourceFile` + `real.scope.sourceGlobs`, so with no `real` arm this unit contributes
# nothing to `unitSourceFiles` and the ADR-0192 landlord rule does not fire over it. Every source file
# below is in `apps/studio`, this story's OWN building, except the pure fold in `@storytree/library` —
# which is the LIBRARY's building and is proven by `work-hierarchy-store-projection` next door.
# apps/studio is VITEST + jsdom, not node:test.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs:
      - "apps/studio/server/hierarchySource.test.ts"
      - "apps/studio/server/hierarchyLiveRead.test.ts"
    sourceGlobs:
      - "apps/studio/server/hierarchySource.ts"
      - "apps/studio/server/apiRouter.ts"
      - "apps/studio/server/libraryBackend.ts"
---

# The map reads the work hierarchy from the live store

**Outcome —** The forest map's question and its proof come from one clock, so a criterion re-worded
since the app was built no longer reads as unproven.

## Why this is one capability

The journey is one render: the map is drawn, and every island's colour rests on a join between what
the tree DECLARES and what has been SIGNED. Splitting the source selection from the fold would leave
two halves neither of which draws a map — the fold with nothing to fold, and the selection with
nothing to select.

## The fault it closes

The map JOINS two sources on different clocks.

The **proof** — signed verdicts — comes live from Cloud SQL and is always current. The **question** —
which stories and capabilities exist, and each criterion's exact `revisionId` — was read by
`readTree(storiesDir)` from `stories/**` on the app's OWN DISK, frozen at the commit the app was
built from. A verdict binds to a criterion by `criterionId` + `revisionId` (ADR-0253). So an app at
an older commit read the database PERFECTLY, found verdicts stamped with a revision it had never
heard of, and correctly painted yellow. **It asked an outdated question and got an honest answer.**

The worked example that produced the 2026-08-25 incident: `agent`'s criterion was authored 08-03 at
`uatr1:b7b5052c7e21a3a2`, re-worded 08-12 to `uatr1:380a683e4995990d`, and signed 08-22/23 against
the NEW revision. An app built between those dates paints it yellow forever until rebuilt. Criteria
declared on `main` went 261 (08-05) → 113 (08-24), so a month-old app enforces ~148 obligations that
no longer exist. **The staler the client, the yellower the map.**

## What this does NOT close

**The RULE half of the skew.** A stale app now reads CURRENT facts and still compiles them with its
own build's `rollupStoryGreen`. ADR-0445's Consequences say so in as many words. Anyone reading this
capability as "staleness is solved" is reading it too widely — it closes the DATA half only.

It also does not touch the four capabilities whose green is overwritten by a later `building` work
mark (`rollupStatus` = last event wins). That is a separate fault, owner-deferred on 2026-08-25 and
governed by ADR-0416 D3/D4.

## Guidance

- **Role decides which source a reader uses, not taste.** This is ADR-0302 D5's line applied to a new
  axis. The RENDERING readers move; the PROVING readers — the corpus guard, `check:coverage`,
  `check:boundaries`, `check:verification-decay`, the build drivers, `node-spec.ts` — keep reading
  `stories/**` from the commit under test, because a story pulled live while CI tests a branch would
  validate the wrong commit. There are 32 non-test disk readers; this moves the rendering ones and
  explicitly does not move the rest.
- **Disk stays canonical for AUTHORING and PROVING.** The store copy is a one-directional projection.
  `story-author` still writes markdown under `stories/**` and nothing else (ADR-0309 D3); nothing here
  is ever written back.
- **A fallback to disk is reachable and must never be silent.** ADR-0302's lesson is that a second
  copy of a canonical thing drifts and is then read INSTEAD of the source by something reporting
  health while serving the stale copy. So the disk read stays — a studio that cannot see the store
  must still draw a forest — but it can only be reached through a branch that states WHY, in a value
  the caller logs and the tests assert on.
- **`null` has two meanings and they must not be collapsed.** The json backend has no projection at
  all; a pg store returns `null` when the loader has never run. Different remedies, so different
  reasons.
- **The FOLDS belong to the reader, never to the loader.** The projection carries RAW authored facts:
  every criterion including would-be ones, every gate including retired ones, the DECLARED
  `uatWitness`. `effectiveUatWitness`, the would-be filter, `activeReliabilityGates` and
  `crownObligations` are RULES, and baking them into the loader would put the LOADER's rule version in
  the store and hand every reader a second, invisible staleness axis.
- **The two readers must agree field for field.** `readTree` and the live fold are two readers of one
  hierarchy; if they disagree, an island changes colour on which source happened to answer. That
  agreement is proven by driving ONE tree through both and comparing, never by asserting the fold
  against a hand-built snapshot — an expectation derived from its own subject cannot fail.
- **Change no payload shape.** The wire the client already consumes is unchanged; a new field would
  break the studio/desktop parity deep-equals for no gain, and the shipped connection light
  (ADR-0448) already tells an operator whether the store is answering.

## Integration test

1. Drive the selection with a store that answers. Assert the read is live, the disk walk is never
   called at all, and the projection's stamp is carried.
2. Drive it with a store holding no projection, with a backend offering none, and with an advisory
   read that throws in breach of its own contract. Assert each falls back to disk with a DISTINCT
   stated reason, and assert over the whole set that no disk selection lacks one.
3. Assert the announcement names the CONSEQUENCE an operator will see ("will show as unproven"), not
   merely that a fallback happened; that it is silent on a live read; and that it prints once per
   reason, since `/api/tree` is polled and a line on every poll is a line that gets filtered out.
4. Build one temp tree carrying every shape the readers must agree about — a healthy story, a missing
   capability file, a would-be UAT section, a retired gate, a story declaring no witness, and a spec
   that does not parse. Drive it through BOTH readers and compare the stories, the capabilities in
   declaration order, the criteria and their revision ids, the crown obligations and the coverage set.
5. On the same tree assert each fold the reader owns: the undeclared witness resolves to `human`
   while the store still holds `null`; the would-be section contributes no marker-walk entry while
   the projection still carries its criterion; the retired gate leaves the coverage set; and a story
   whose spec does not parse contributes no obligations at all.

## Contracts

1. **`map-live-hierarchy-read-prefers-the-live-store`**
   - **asserts —** when the store answers, the hierarchy is read live, the disk walk is not called,
     and the projection stamp rides along so a reader can say how current the answer is.
2. **`map-live-hierarchy-read-falls-back-only-with-a-stated-reason`**
   - **asserts —** an absent projection, a backend that serves none, and a throwing advisory read each
     fall back to disk with its own distinct reason — and no disk selection anywhere lacks one.
3. **`map-live-hierarchy-read-announces-a-disk-fallback-once-per-reason`**
   - **asserts —** the fallback line names the consequence in the operator's terms, stays silent on a
     live read, prints once per reason under polling, and prints again for a NEW reason.
4. **`map-live-hierarchy-read-reproduces-the-disk-read-field-for-field`**
   - **asserts —** over one tree, the live path and `readTree` agree on the story set, every story
     field, the capabilities in declaration order with every field, the criterion ids at the same
     revisions, the crown obligation union, and the coverage set.
5. **`map-live-hierarchy-read-applies-the-folds-the-reader-owns`**
   - **asserts —** the witness default, the would-be filter, the retired-gate drop and the
     no-obligations-for-an-unparseable-spec rule are applied by the READER, with the raw fact still
     present in the projection underneath each one.
