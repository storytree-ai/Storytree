---
status: accepted
load_bearing: true
decided: 2026-08-04
supersedes: [55]
amends: [209, 247]
arc: session-decoupling-arc
---
# ADR-0307: The agent tier goes live-canonical: the committed seed stops being an authoring surface

## Status

accepted (2026-08-04) — decided/directed by the owner in conversation on 2026-08-04. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Supersedes** [ADR-0055](0055-the-library-agent-tier-is-seed-canonical-sync-agents-reconci.md). That decision made the Library's `agent`
tier **seed-canonical** — authored in `apps/studio/data/knowledge.json` and reconciled outward to the
live store by `sync-agents` — as the deliberate inverse of ADR-0023's live-canonical default. Its
entire mechanism is a committed seed file and a reconciler, and [ADR-0302](0302-online-or-nothing-the-live-store-is-the-only-source-of-truth.md)
D1/D4 remove both. This is a genuine re-decision, not an amendment: the direction of authorship
reverses. 0055 is kept as browsable history.

**Amends** [ADR-0209](0209-tier-model-judged-uat-below-irreducible-human-witness.md) — its D5 explicitly
"extend[s] ADR-0055's seed-canonical exception beyond agents" to the per-criterion `uat-criterion`
detail class, and D5 is accepted and load-bearing with **70 seed detail artifacts** resting on it
*(count corrected in place 2026-08-05, ADR-0139: this ADR was drafted saying "73", a figure inherited
unchecked from ADR-0209 and ADR-0247; `git ls-tree` shows the directory held 70 files on 2026-08-04
and had held 70 since 2026-08-03, when ADR-0294 increment 1 deleted four)*. The
posture 0055 established therefore has a second home, and the seed removal kills it in both. Only D5's
*canonicality direction* moves; D5's substance — one detail artifact per detailed UAT criterion, owned
by `story-author`, authored atomically with the hierarchy — is untouched, which is why this is an
`amends` and not a second supersession (ADR-0139).

## Context

ADR-0302 D1 decommits `apps/studio/data/knowledge.json` and D4 deletes the machinery that reconciles
it against the live store. ADR-0055 is the one accepted decision that cannot survive that unchanged,
because it does not merely *read* the seed — it names the seed as the **edit surface** for a whole
tier, and names `sync-agents` as the ceremony that carries edits live. Both disappear.

**Why 0055 chose the seed in the first place, and whether the reason survives.** Its case was that the
agent tier is rendered OFFLINE into harness-native views — `CLAUDE.md`, `AGENTS.md`,
`.claude/agents/*.md`, `.cursor/agents/*.md`, `.codex/agents/*.toml`, `.gemini/agents/*.md` — by
`build-agents.ts` / `build-claude-md.ts`, and a generator that reads a file needs no database. That
reason is real and it does **not** disappear: the harness still reads those views at session start,
before any tool can run (ADR-0302 D5). What changes is *where the generator reads from*. A generator
sourcing the live store still emits committed files; the outputs stay on disk exactly as D5 requires.
The seed was one way to feed the generator, never a requirement of the generator's contract.

**What the seed actually costs, measured 2026-08-04.** 1.25 MB mirroring 219 of 616 live artifacts —
36% of the corpus — and touched by **86 of the last 440 commits on `main` (19.5%)**. It is the single
most re-absorbed file in the repo. The agent tier is 12 of those 219 artifacts, so this ADR is not
where the churn is; it is the one *decision* standing between ADR-0302 and its own D1.

**The seed's second job, which is not authorship and must not be conflated with it.** Several
consumers read the seed as a *bootstrap corpus* rather than an authoring surface: the CLI's offline
`InMemoryStore`, `check-process-graph`, the leaf/curator prompt renderers, ~33 test files, and the
`UserPromptSubmit` definition hook. None of those edits anything. Re-homing them is ADR-0302 D1's
work and is deliberately **out of scope here** — this ADR settles only the authorship direction,
which is the part that is a *decision* rather than a migration.

## Decision

### D1 — The `agent` tier is live-canonical, like every other tier

`agent` joins the ADR-0023 default: the shared Cloud SQL store is the source of truth, edited through
`storytree library artifact edit <id> --pg` (and the studio), never by hand-editing a committed file.
The ADR-0055 exception is withdrawn. With it goes the two-surface dance that made agent edits
uniquely expensive — a seed edit, a `sync-agents --pg`, and a `build:guidance` regeneration, in that
order, or the live tier went stale.

### D2 — The harness-native views stay committed, and stay generated

Unchanged from ADR-0302 D5 and restated so D1 is not misread as decommitting them: `CLAUDE.md`,
`AGENTS.md` and the five harness agent directories remain committed files, because the harness reads
them before any tool can run. *(Count corrected in place 2026-08-08, ADR-0139: OpenCode's
`.opencode/agent` became the fifth harness agent directory — the committed-and-generated decision is
unchanged.)* They remain **generated projections** — of the live store now rather
than of the seed. `check:guidance` and `check:agents` keep verifying they match their source; only
the source moves.

### D3 — `sync-agents` and `check:agents-sync` are deleted, not repointed

They exist solely to reconcile seed→live for this tier. With no seed there is nothing to reconcile
and no drift to detect. They go under ADR-0302 D4's "deleted, not left inert" rule. `check:agents`
(view-vs-source) is a **different** check and survives.

*(As landed 2026-08-05: D1, D2 and D3 are all shipped. `sync-agents.ts`, `check-agents-sync.ts` and
the `library sync-agents` command are gone; `build:guidance` / `build:agents` read the live store via
`packages/drive/src/corpus-store.ts` and fail loudly when it is unreachable. The migration was proved
rather than asserted — both generators re-rendered CLAUDE.md, AGENTS.md, all four harness agent
directories and `definitions.generated.json` **byte-identically** from the live store, so the two
surfaces demonstrably agreed at the moment of the switch.

D5 landed separately on 2026-08-05 and is now COMPLETE. All 70 committed `uat-criterion` detail
bodies were migrated into the live store and `apps/studio/data/seed-kinds/` was deleted; there is no
seed-authored kind left anywhere. Re-measuring before the migration corrected the scope in one
material way: the 22 live rows were **not** a subset of the 70 seed files. Four
(`drive-machinery#uat-1/2/5/6`) existed only live — orphans of criteria the story later dropped — so
the union was **74**, not 70, and a full seed→live `reconcileDetails` would have DELETED those four
and overwritten the other 18. The migration was therefore create-only: 52 new rows, the 22
pre-existing ones untouched, each new doc wrapped in the Library envelope and pushed through
`upcastAndValidate` (the seed files were bare bodies, so a raw upsert would have written 74
envelope-less rows). `detail-seed-sync.ts` was DELETED under D3's rule rather than kept: it had no
production caller — the `loadCorpus` and `sync-uat-details --pg` consumers named in its own doc
comment never existed — and its delete-target-extras semantics were actively wrong for every
remaining direction. `story-author`'s write fence narrows back to a single admitted root,
`stories/**`: a detail body is now a live `--pg` write, so the file fence has nothing left to admit
for it.)*

### D4 — A generator may hold a store connection; a session-start hook may not

The line this ADR draws for the re-homing work, so it is decided once rather than per consumer.
`build:guidance` / `build:agents` are **invoked** — by a session, by the gate, by CI — and may open a
store connection. Anything on the harness's own startup or per-prompt path may not: it runs before
tooling exists, inside a latency budget, and must work in a checkout with no `node_modules`. Such a
consumer gets a small **generated projection** committed beside the views it serves — the same
argument as D2, applied to data instead of prose.

### D5 — The seed-canonical POSTURE is withdrawn wherever it was extended, not only for agents

ADR-0055 was not the only home of "this kind is authored in the committed seed". ADR-0209 D5 extended
it to the `uat-criterion` detail class, on the stated ground that it lets "offline builds and CI
resolve the same proof contract" — the exact capability ADR-0302 D2/D3 retire. The reason evaporates
with the seed, so the rule follows: **every kind is live-canonical, with no seed-authored exception
remaining.** Any future "author this one in the seed" proposal is a re-decision against ADR-0302 D1,
not a precedent available from 0055 or 0209.

This was found by the gate rather than by design — `adr-health`'s story-decisions check named four
stories (`model-uat-pilot`, `model-uat-witness`, `scoped-glue-actuator`, `uat-criterion-detail`) that
cite ADR-0055 as deciding, and re-pointing them to a decision covering only agents would have been a
false citation. They are re-pointed to this ADR, which is why it must carry the general posture.

Migration scope this adds, so it is costed rather than discovered: the 70 detail artifacts move with
the rest of the corpus under ADR-0302 D1, and `packages/uat-criterion/src/detail-seed-sync.ts` — a
structural clone of `sync-agents` that reconciles store→store over the `Store` seam — is re-read
under D3's rule. It imports nothing from `@storytree/library/store`, so deleting the ADR-0302 D4
family does not break it; whether it survives on its own terms is that increment's call, not this
ADR's. *(That call was made on 2026-08-05: deleted. See the "as landed" note under D3.)*

## Consequences

**Good.** One authorship direction for the whole Library; the `agent`-tier exception that every
session had to remember is gone, and with it a documented trap. Editing an agent becomes one `--pg`
write plus a regeneration, instead of a three-step ordered ceremony. Two more gate rungs retire
alongside ADR-0302 D4's. ADR-0302 D1 loses its last blocking *decision* — what remains is migration.

**Bad, and accepted.** Regenerating guidance now needs the database, so a session cannot author an
agent offline at all — a real narrowing, and exactly what "online or nothing" buys. `check:guidance`
and `check:agents` run in CI, so CI must hold a database credential before D1 lands: this makes
ADR-0302 D3 a hard prerequisite of D1 rather than a parallel workstream. Git also stops recording
agent-tier edits as reviewable diffs; the live store's `events.library_event` becomes the audit
trail, which is a different and less browsable surface.

**Neutral.** No code changes here. This settles the authorship direction; the migration is ADR-0302
D1's increment.

## References

- [ADR-0055](0055-the-library-agent-tier-is-seed-canonical-sync-agents-reconci.md) — superseded: the seed-canonical agent tier.
- [ADR-0209](0209-tier-model-judged-uat-below-irreducible-human-witness.md) — **amended**: D5's
  canonicality direction reverses; D5's substance is untouched.
- [ADR-0247](0247-retire-the-model-uat-witness-tier-the-witness-split-is-human.md) — **amended**
  *(edge recorded 2026-08-05, ADR-0139)*: its decision 3 restated ADR-0209 D5's seed-canonical posture
  in its own words ("the `uat-criterion` kind is seed-canonical and reconciled … Nothing here weakens
  the ADR-0055 seed-canonical exception"). D5 here withdraws the posture *wherever it was extended*,
  so that clause is void and is annotated in place there. 0247's own decision — keep ADR-0209 D5–D7 —
  is untouched, which is why this is an `amends` rather than a second supersession.
- [ADR-0302](0302-online-or-nothing-the-live-store-is-the-only-source-of-truth.md) — D1/D4 remove the
  seed and the reconcilers; D5 keeps the views committed. D3 is a hard prerequisite, per Consequences.
- [ADR-0023](0023-library-cli-choose-your-own-adventure.md) — the live-canonical default this rejoins.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — why this is born accepted.
- `packages/cli/src/build-agents.ts`, `build-claude-md.ts` — the generators whose source moves.
- `packages/library/src/store/sync-agents.ts`, `packages/cli/src/check-agents-sync.ts` — deleted by D3.
