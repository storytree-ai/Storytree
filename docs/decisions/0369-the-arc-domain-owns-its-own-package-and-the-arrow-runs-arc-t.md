---
status: accepted
decided: 2026-08-14
amends: [192]
arc: arc-tier-extraction-arc
---
# ADR-0369: The arc domain owns its own package, and the arrow runs arc to drive

## Status

accepted (2026-08-14) — the extraction itself was **directed by the owner on 2026-08-09**, answering
the since-retired open question `oq-where-should-the-arc-tier-live-the-cli-shim-its-own-packa` with
its option (b): give the arc tier its own package and its own story. That direction is recorded as
the intent of `arc-tier-extraction-arc` and is the ratification (ADR-0110); this ADR records the
decision and settles the two questions the direction left open — which way the new package's
dependency arrow points, and what had to move with it. Delivered in one landing as
`arc-tier-extraction-arc-inc-01`.

**Amends [ADR-0192](0192-hosted-story-boundary-honesty-the-landlord-rule-now-packages.md).** ADR-0192
decision 2 refuses a *new* story whose code would sit inside another story's package — the
packages-forward rule. That rule is what refused the arc story when it was last proposed
(`capability-layer-coverage-arc` increment 6, 2026-08-08), and it is unchanged here: this ADR does not
carve an exception, it satisfies the rule by building the package first.
What it adds is the worked instance the rule always implied but never showed — the honest path out
of a cross-package organ is an extraction, and this is what one costs.

## Context

**The arc is the initiative overlay** (ADR-0183): a named multi-story owner intent tracked through an
increment log to a closed end-state. It has its own Library kinds (`arc`, `increment`,
`open-question`), its own ADR family (0183 / 0267 / 0305 / 0314 / 0335 / 0337 / 0347 / 0358), a studio
lens, a desktop mirror and a CLI verb surface. What it did not have was a building.

**It was a tenant of two packages at once.** The write verbs and their ADR-0023 render
(`arc.ts`, `increment.ts`, `question.ts`) lodged in `@storytree/cli`; the derived arc → children JOIN
(`arc-rollup.ts`) lodged in `@storytree/drive`. Neither placement was an accident and neither was a
competence claim:

- The join sat in `drive` for REACH. Its own header said so — *"because BOTH readers must share it and
  they cannot share cli"* — since the studio server may not import `@storytree/cli`. That is a
  statement about who can see the file, not about whose job it is.
- The verbs sat in `cli` because that is where the dispatcher is, and `stories/cli/story.md` is
  explicit that *"the shim owns the wiring, not the journeys"*.

`capability-layer-coverage-arc` increment 6 (2026-08-08) read all 305 `outcome:` lines in the work
hierarchy and confirmed the gap mechanically: **no story covered the arc domain.** It homed the organ
as two `cli` capabilities (`arc-derived-initiative-view`, `increment-freshness-check`) as a stopgap,
and recorded the compromise in the open modeling call this ADR now closes: *"The honest end-state is
its own story backed by its own workspace package, which is what ADR-0192 decision 2 requires of any
new story. That is a code move plus an owner-reviewed diff, not an ownership declaration, so it was
not taken here."*

**The stopgap had a live cost, not just an aesthetic one.** `arc-derived-initiative-view` owned a file
inside `drive-machinery`'s building, and the only reason no landlord rule fired was that the ADR-0094
brownfield shape leaves `proof.real` empty — `readUnitSourceFiles` skips a unit with no `real:` arm,
so rules 5 and 6 never looked. The capability said so in its own body: *"That silence is a mechanical
fact, not a decided exemption... If this organ ever earns a `real:` arm, its source file must be the
`packages/cli` half or the organ must move to its own package first."* The arc domain was therefore
unable to be proven red→green by storytree's own gate without first being extracted. It was frozen at
`mapped` by its address.

**The one thing the owner's direction did not settle was the arrow.** The parked increment's end-state
sentence read *"cli and drive consume it across a declared `depends_on` edge"* — written before anyone
had read the join's imports. They cannot both be true.

## Decision

**D1 — The arc domain is its own workspace package and its own story.** `packages/arc`
(`@storytree/arc`) owns `arc-rollup.ts`, `arc.ts`, `increment.ts` and `question.ts`, moved verbatim
with their four suites. `stories/arc` bounds it, and the THREE capabilities that already describe this
exact code move with it out of `stories/cli`: `arc-derived-initiative-view`,
`increment-freshness-check` and `arc-explicit-id-fidelity`. ADR-0192 D2 is satisfied the way it asks
to be satisfied: the package first, the story second.

**The third one had no choice, and that is the load-bearing detail.** Unlike its two brownfield
siblings, `arc-explicit-id-fidelity` HAS a `real:` arm, so `readUnitSourceFiles` reads its
`sourceFile` and the landlord rules DO fire over it. Leaving it in `stories/cli` while its source sat
in `packages/arc` would have made `cli` a story hosted in another story's building — refused by the
packages-forward rule (rule 6) **regardless of any declared edge**, because `cli` is not in the frozen
`hostedStories.register`. Rule 5 would have passed on the `consumed_by: [cli]` edge; rule 6 alone is
what makes the move mandatory rather than tidy. It is also the first unit that could finally declare
`depends_on: [arc-derived-initiative-view]` — the arrow the other capability's prose has asserted all
along ("the arrow runs from it to this, never back") but which was unauthorable while a capability's
`depends_on` could name only siblings in the same story.

**Its proof command spans two packages, and that is honest rather than transitional.** The behaviour
moved to `packages/arc/src/arc.ts`; its three regressions stayed in `packages/cli/src/cli.test.ts` and
BELONG there, because they drive the real dispatcher end-to-end (`run(["arc","new",…])` over a
counting store) rather than calling `arcNew` directly — moving them would have narrowed an integration
test into a unit test. So its write scope now genuinely spans two buildings and its proof must observe
both.

**D2 — The arrow runs arc → drive, and the parked end-state's "drive consumes it" half is
WITHDRAWN.** The join reads `@storytree/drive`'s ADR-frontmatter scanner (`loadTitledAdrMetas`) and
its work-hierarchy scanner (`loadWorkHierarchyIndex` / `resolveCites`), and every verb returns drive's
`Envelope`. So `@storytree/arc` depends on `@storytree/drive`, and drive importing it back would be a
package cycle `check:boundaries` would refuse and nothing would gain. `drive`'s barrel therefore drops
its `arc-rollup` re-export, and the three surfaces that served the rollup — the CLI, the studio server
(`handleArcs`), the desktop backend (`local-backend.ts`) — import `@storytree/arc` directly.

**This changes nothing about ADR-0267's guarantee, which was the reason for the drive placement in the
first place.** There is still exactly ONE join. It moved one building further down, and the studio
server still does not import `@storytree/cli`. The property that mattered was "both readers share the
same derivation", never "the derivation lives in drive".

**D3 — Three helpers move DOWN so the arc package never imports the CLI.** An extraction that left the
verbs reaching back up into `@storytree/cli` would be a cycle wearing a different hat, so:

- `kebabSlug` — the title → id slug `adr new`, `arc new` and `question new` all derive ids with — moves
  to `@storytree/library` beside the citation tokens. `packages/cli/src/adr.ts` re-exports it.
- `ASSET_REF_PREFIX` moves to `@storytree/library` beside `STORY_REF_PREFIX` / `CAPABILITY_REF_PREFIX`
  and `parseCiteRef`, which already knew the `asset` scheme. `packages/cli/src/asset-citation.ts`
  re-exports it. Two packages agreeing on a token by copying it is the drift that module exists to
  prevent.
- `cli-actor.ts` — the `cli@<branch>` write stamp (ADR-0290) — moves to `@storytree/drive`, and
  `packages/cli/src/cli-actor.ts` becomes a re-export shim. This is the `envelope.ts` / `secrets.ts`
  precedent (ADR-0112's reach-move) applied a third time, for the same reason: a write verb in a third
  package must stamp identically to its siblings and cannot import the CLI to do it.

**D4 — The attribution fence follows the write paths, not the package.** `write-attribution.ts`'s
scan is widened from one source root to two (`packages/cli/src` **and** `packages/arc/src`). A fence
scoped to a directory silently stops covering whatever moves out of it, and three of the paths this
one names by name (`arc.ts`, `question.ts`, `increment.ts`) are exactly what moved. The suite's
anti-vacuity assertion — which names its expected files explicitly — is what turned that into a loud
failure rather than a green test covering less. `packages/drive` stays out of scope for the reason it
always was (`CURATOR_ACTOR`, a deliberate non-branch identity), not by omission.

## Consequences

**The arc domain can now be proven.** The two brownfield capabilities remain ADR-0094 `mapped` with no
`real:` arm — this landing is a move, not a re-proof, and manufacturing a red over mature code is
what ADR-0085/0094 forbid. But the BLOCKER is gone: every source file they name is now in their own
story's building, so a future `real:` arm trips no landlord rule. The honesty note in
`arc-derived-initiative-view` that stated the residual plainly is discharged rather than deleted. Nor
does a later `real:` arm cost a snapshot edit: ADR-0341 D4 replaced `node-build.test.ts`'s hardcoded
REAL-buildable catalogue with an assertion derived from `stories/`, so the old warning that such an
arm "enters the pinned snapshot" was already stale and is corrected in place on both specs.

**The two-suite proof command did not disappear — it MOVED.** `arc-derived-initiative-view`'s
`--filter @storytree/drive --filter @storytree/cli` pair existed only because the join and the verbs
were in different packages, each half seeing something the other could not; all four of its suites are
now `pnpm --filter @storytree/arc test`, and the 71 tests it cites run together for the first time.
But the SAME argument now applies to `arc-explicit-id-fidelity`, whose source and regression this
extraction is what split. A single `@storytree/cli` filter there would leave most of `arc.ts` — the
file its IMPLEMENT phase is scoped to write — unobserved, which is exactly the failure the collapsed
command used to guard against. One package's two-suite need was paid off and another's was created;
the extraction did not remove the shape, it relocated it to the unit whose files are now the split
ones.

**Three consumers gained a declared dependency**: `@storytree/cli`, `apps/studio`, `apps/desktop`. Each
edge is declared story-side in the same commit as its `package.json` entry, because `check:boundaries`
reads "code-backed" from `package.json` and a split across commits reds the gate in one direction or
the other with no green intermediate state.

**The studio and desktop keep loading it lazily.** Both reach the rollup through a `loadArc()` memo
mirroring their existing `loadDrive()`, for the vite config-load reason documented at those call
sites: a static import of a raw-TS workspace barrel breaks the dev server, and `pnpm gate` does not
run `vite build`, so only CI Build would catch it.

**What this does NOT do.** `packages/cli/src/arc-proposal-drain.ts` and
`check-arc-proposal-drain.ts` stay in the CLI: they are ADR-0311-retired gate machinery that happens
to mention arcs, not the arc domain, and moving retired code would be churn. `adopt-plan.ts` likewise
stays — it is story adoption, not arc planning. If either is ever revived, its home is a fresh
question.

**The cost is one more package in a monorepo that already had 22.** That is the price ADR-0192 D2
names, and the alternative — an organ addressable by no story, unable to earn a proof, carrying a
standing open modeling call — is the one this replaces.

## References

- [ADR-0183](0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md) — the arc as initiative
  overlay; D3 puts every containment edge on the CHILD, which is what makes the join a query.
- [ADR-0267](0267-arcs-take-the-map-s-primary-top-drawer-slot-the-library-beco.md) — the derived join must stop being CLI-only; the
  Consequences that put `arc-rollup.ts` in `drive` in the first place.
- [ADR-0192](0192-hosted-story-boundary-honesty-the-landlord-rule-now-packages.md) — the landlord rule
  and the packages-forward refusal this satisfies rather than excepts.
- [ADR-0112](0112-extract-the-build-orchestrate-drivers-into-packages-drive.md) — the reach-move
  precedent D3 applies for the third time.
- [ADR-0094](0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md) — why both capabilities
  stay `mapped` with no `real:` arm across the move.
- `capability-layer-coverage-arc` increment 6 (PR #1233) — the survey that established no story
  covered the arc domain, and the open modeling call this closes.
- `packages/arc/src/index.ts` — the barrel, which states the shape D1–D3 encode.
