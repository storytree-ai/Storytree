---
id: "desktop-live-hierarchy-read"
tier: capability
story: desktop
arc: map-freshness-arc
title: "The desktop map reads the work hierarchy from the live store"
outcome: "An installed app built at an older commit paints work green without a rebuild, because its map now asks today's question."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [445, 302, 253]
# GREENFIELD, and deliberately NO `real:` arm — the same reason the studio's `map-live-hierarchy-read`
# states: `readUnitSourceFiles` (packages/cli/src/check-boundaries.ts) reads ONLY `real.sourceFile` +
# `real.scope.sourceGlobs`, so with no `real` arm this unit contributes nothing to `unitSourceFiles`
# and the ADR-0192 landlord rule does not fire over it. Every source file below is in `apps/desktop`,
# this story's OWN building. apps/desktop runs `node:test` under `bun test`, not vitest.
proof:
  command:
    file: pnpm
    args: ["--filter", "desktop", "test"]
  scope:
    testGlobs:
      - "apps/desktop/src/backend/hierarchy-live.test.ts"
    sourceGlobs:
      - "apps/desktop/src/backend/hierarchy-live.ts"
      - "apps/desktop/src/backend/local-backend.ts"
---

# The desktop map reads the work hierarchy from the live store

**Outcome —** An installed app built at an older commit paints work green without a rebuild, because
its map now asks today's question.

## Why this is one capability

The journey is one render on one machine: the installed app draws the forest, and every island's
colour rests on a join between what the tree declares and what has been signed. The source selection,
the runtime cache and the degradation announcement are one unit because they are one decision made
once per render — split them and none of the three draws a map.

## The fault it closes, and why the desktop is where it bit

The desktop app is the surface that actually suffered the 2026-08-25 incident, and it is worth being
exact, because neither the app nor the database was broken.

The map JOINS two sources. The **proof** — signed verdicts — is read live from Cloud SQL and is always
current. The **question** — which stories and capabilities exist, and each criterion's exact
`revisionId` — ships INSIDE the app, frozen at the commit it was built from. A verdict binds to a
criterion by `criterionId` + `revisionId` (ADR-0253). So an app built before a criterion was re-worded
read the database perfectly, found verdicts stamped with a revision it had never heard of, and
correctly painted yellow. **It asked an outdated question and got an honest answer.**

`agent`'s criterion was authored 2026-08-03 at `uatr1:b7b5052c7e21a3a2`, re-worded 08-12 to
`uatr1:380a683e4995990d`, and signed 08-22/23 against the NEW revision. An app built between those
dates paints it yellow forever until somebody rebuilds it. **The staler the client, the yellower the
map** — and an installed app is the stalest client there is.

## The degradation ladder, and why disk is last

Live, then the runtime cache, then disk.

**A runtime cache is legitimate; a committed mirror is not** (ADR-0445 D2). The committed corpus
mirror ADR-0302 D1 deleted drifted from the live store and was then read INSTEAD of it by generators
that reported "in sync" while reverting live edits. A runtime cache cannot enter that path: it is
never committed, never authoritative, never written back, always stamped, and it dies with the
process.

**Disk is last because for this app a disk read IS the incident**, not a neutral fallback — the frozen
copy is exactly what painted `agent` yellow for eleven days. It stays reachable only because a cold
boot against a down store must still draw a forest rather than nothing (ADR-0445 D5: the signal
discloses, it never blocks), and it can only be reached through a branch that states why.

## What this does NOT close

**The RULE half of the skew.** A stale app now reads current facts and still compiles them with its
own build's `rollupStoryGreen`. ADR-0445's Consequences say so; this closes the DATA half only.

## Guidance

- **Never fall back to the frozen copy while a cached live read exists.** That is the back door
  through which the whole fault re-enters, and it is asserted rather than left to prose.
- **The cache hands out COPIES.** `foldVerdicts` mutates the stories it is given, so serving the
  stored object directly would let one request's verdict overlay persist into the next and accumulate
  — a cache answering with yesterday's proof state while claiming to hold the hierarchy alone.
- **A snapshot that will not fold is a degradation, not a render.** A store written by a newer
  projection schema than this app understands is a real possibility once the version moves; pretending
  it parsed would put garbage on the map.
- **The two degradations have DIFFERENT remedies and must say so.** Serving the cache means newly
  authored work is missing; serving disk means re-worded criteria read as unproven. One
  undifferentiated warning sends an operator to the wrong fix.
- **Announce once per reason, not once per render.** `/api/tree` is polled; a line on every poll is a
  line the operator filters out, which is how a loud signal becomes a silent one.
- **The FOLD is shared, not re-implemented.** `tree-verdicts.ts` re-composes the studio's `readTree`
  by hand for the disk path, and that duplication is a standing cost. The live path takes the pure
  fold from `@storytree/library` instead, so the desktop and the studio cannot drift on the rules.

## Integration test

1. Drive the selection with a store that answers. Assert the read is live, the frozen disk copy is
   never called at all, and the projection stamp is carried.
2. Prime the cache with one good live read, then make the store throw. Assert the read comes from the
   cache, the disk copy is STILL not called, the cached read carries the current revision, and the
   reason is stated.
3. Drive a cold boot with nothing cached and no projection. Assert it reaches disk, says why, and
   carries no stamp.
4. Drive a snapshot the fold rejects. Assert it degrades rather than rendering.
5. Assert over the whole set of non-live selections that none lacks a stated reason.
6. Enrich one request's stories in place, then force a cached read. Assert the second caller sees no
   trace of the first's verdict overlay.
7. Assert the announcement distinguishes the cache consequence from the disk consequence, stays silent
   on a live read, and prints once under repeated polling.
8. **The incident, walked:** hold the disk copy at the OLD revision and the store at the NEW one.
   Assert that BEFORE, the question the frozen app asks is a revision nothing was signed against; and
   that AFTER — same build, same disk, nothing reinstalled — the question matches what was signed.

## Contracts

1. **`desktop-live-hierarchy-read-prefers-the-live-store`**
   - **asserts —** when the store answers, the hierarchy is read live, the app's frozen copy is not
     called, and the projection stamp rides along.
2. **`desktop-live-hierarchy-read-degrades-to-its-runtime-cache-not-its-frozen-copy`**
   - **asserts —** with a primed cache and a failing store the read comes from the cache carrying the
     current revision, the frozen copy is still never called, and each caller gets its own copy so one
     request's verdict overlay cannot leak into the next.
3. **`desktop-live-hierarchy-read-reaches-disk-only-on-a-cold-boot-and-says-so`**
   - **asserts —** disk is reached only with nothing cached; an unfoldable snapshot degrades rather
     than rendering; no non-live selection lacks a reason; and the announcement names the cache and
     disk consequences differently, silent on live and once per reason under polling.
4. **`desktop-live-hierarchy-read-greens-an-old-build-without-a-rebuild`**
   - **asserts —** with the disk copy frozen at the old revision and the store at the new one, the
     question the app asks BEFORE matches nothing that was signed, and AFTER — same build, same disk —
     matches the signed revision exactly.
