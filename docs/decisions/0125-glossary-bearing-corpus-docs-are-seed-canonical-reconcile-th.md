---
status: proposed
decided: 2026-06-27
amends: [23, 103, 120]
---
# ADR-0125: Glossary-bearing corpus docs are seed-canonical; reconcile them to live

## Status

proposed — surfaced 2026-06-27 while landing ADR-0120, whose new `check:corpus-content` body-diff found
10 drifted docs (8 stale-in-live). The owner DEFERRED the model call — reconciled both directions by
hand for now (PR #438) and asked for an ADR to settle which side is canonical. Born `proposed`, not
owner-directed: part 1 (the canonicality rule) is an owner-level model fork that must be ratified
before part 2 (the reconcile tooling) is built — design-time alignment was explicitly withheld
(ADR-0110), so this awaits a green flip.

**Amends** ADR-0023, ADR-0103, ADR-0120 — carves the glossary-bearing subset out of ADR-0023's
live-canonical default (as ADR-0055 carved out agents), adds the seed→live overwrite that ADR-0103's
migrate-only `sync-corpus` deliberately lacks, and makes ADR-0120's `check:corpus-content`
classification canonicality-aware. It overturns none of them: every non-glossary-bearing non-agent doc
stays live-canonical, `sync-corpus` stays migrate-only, `export-corpus` stays live→seed.

## Context

`docs/glossary.md` is a GENERATED VIEW of `apps/studio/data/knowledge.json` (ADR-0018):
`apps/studio/data/build-corpus.mjs` renders each glossary member from its seed `glossaryBody` /
`glossaryTerm`, with membership keyed by the `glossarySection` field (`assertGlossaryMembership`). The
generator is DB-free — it reads the seed, never the live store, and runs in CI. **So to change the
glossary you must edit the SEED.** That makes every glossary-bearing doc de-facto SEED-canonical for its
rendered content — the identical shape ADR-0055 already recognised for the `agent` tier (authored in the
seed, rendered offline by `build:claude` / `build:agents`, therefore seed-canonical).

But the model on the books says the opposite. ADR-0023 declares the WHOLE non-agent tier LIVE-canonical
(the live Cloud SQL store is the edit surface; `knowledge.json` is a lagging export), and the reconcile
tooling only ever flows in two directions that both respect that:

- `sync-corpus` (ADR-0103) is seed→live but MIGRATE-ONLY — it adds a seed artifact ABSENT from live,
  and by design "will not push seed content over a present live row."
- `export-corpus` (ADR-0120) is live→seed — it mirrors the canonical live body UP into the lagging seed.

There is NO tool that overwrites a STALE live row from a canonical seed. So a seed edit to an
already-live glossary-bearing doc strands: the live copy silently goes stale while the seed (the
glossary's source) is canonical — the exact inverse of ADR-0023's stated direction.

This is not hypothetical. The ADR-0078 root-port rename (`verdict-contract`→`proof-protocol`,
`base`→`storage-protocol`) and a newline normalization were applied as bulk SEED edits and never reached
live. ADR-0120's `check:corpus-content` (the first body-level seed↔live diff) surfaced the residue on
2026-06-27 — 10 drifted docs:

- **8 were STALE-IN-LIVE** — `boundary`, `event`, `one-model-boundary`, `pi-adapter`, `proof-mode`,
  `stack-pi-coding-agent`, `stack-typescript-node-pnpm`, `rename-tree-to-forest` — their live rows still
  carried the pre-ADR-0078 package names and literal-`\n` corruption. (That corruption is invisible to
  the structural guards: a literal `\n` is a valid string, so `Knowledge.safeParse` and the
  `version-floor` gate pass it; only a body-level diff catches it.)
- **2 were genuine live edits** — `orchestrate-route-supplement`, `prove-and-promote-ceremony`
  (graduation writes edits to the seed per ADR-0095, but these carried later live-surface edits).

PR #438 reconciled by hand in BOTH directions — a one-shot `PgLibraryStore.upsertDoc` script restored
the 8 stale live rows from the seed, and `export-corpus` carried the 2 genuine edits up. It is clean
today, but the root cause is untouched, so it WILL re-accrue on the next glossary edit or bulk seed
sweep.

A precision the naive reading misses: only **4 of the 8** stale docs are glossary-bearing (`boundary`,
`event`, `pi-adapter`, `proof-mode`); the other 4 are a `techstack` / principle that the SAME bulk seed
sweep touched. A glossary-bearing doc is FORCED seed-canonical (the only way to change the glossary). A
non-glossary live-canonical doc swept in the seed is a different failure — a bulk edit applied to the
wrong surface — that the same missing seed→live push would also have carried across.

## Decision

Two parts: a canonicality rule (the owner-level fork — why this is `proposed`), and the tooling that
makes it self-heal. **Part 1 awaits owner ratification; part 2 is built once it is green.**

**1. The glossary-bearing subset is SEED-canonical (the whole doc).** A non-`agent` doc that carries
`glossarySection` — i.e. it renders into the offline-generated `docs/glossary.md` — is seed-canonical:
the seed (`knowledge.json`) is its edit surface, and the live row is a projection. This is ADR-0055's
rule applied to the same forcing condition (an offline-generated view whose source must be the seed),
narrowing ADR-0023's live-canonical default exactly as ADR-0055 narrowed it for agents. Every OTHER
non-agent doc stays LIVE-canonical; ADR-0023 stands for the rest.

   - **Whole doc, not just the glossary fields** (the precise boundary). The seed-canonical unit is the
     ENTIRE doc, keyed by `glossarySection` membership — NOT a per-field split where only `glossaryBody`
     / `glossaryTerm` are seed-canonical and the rest stays live. Rejected because: (a) per-field
     canonicality within one row is not enforceable by a per-doc upsert reconcile, which can only mirror
     a whole body; (b) the renames that triggered this touched the prose fields (`whatItIs` /
     `description`) and `glossaryBody` together, so the fields move as a unit; and (c) `build-corpus`'s
     glossary FALLBACK recomposes the term from `whatItIs` / `whatItIsNot` / `description` when
     `glossaryBody` is absent, so those prose fields ARE glossary-rendered content — the "just the
     glossary fields" line is illusory. Whole-doc is the only enforceable cut, and it mirrors agents.

**2. A seed→live OVERWRITE reconcile for the subset, parallel to `sync-agents`.** Add the seed→live push
that does not exist today (`sync-corpus` is migrate-only, `export-corpus` is the wrong direction): upsert
every seed glossary-bearing doc into the live store, OVERWRITING a drifted live body (the migrate-only
skip flips here, because for this subset the seed is canonical — same as `sync-agents` overwrites because
agents are seed-canonical); NEVER delete (a live-only doc is not a seed glossary member); idempotent;
validated at the write boundary. Surface and gate it the same way the two existing syncs are:

   - **`storytree library sync-glossary --pg`** (recommended) — a dedicated reconciler mirroring
     `reconcileAgents` / `syncSeedAgents`, fenced to `glossarySection`-carrying docs. Preferred over the
     alternative — a `--overwrite-glossary` mode bolted onto `sync-corpus` — because mixing an overwrite
     path into `sync-corpus` muddies its one clean invariant ("never push seed over a present live row");
     a separate verb keeps each reconcile's policy legible (migrate-only / overwrite-subset / live→seed).
   - **`check:glossary-sync`** — a best-effort, WARN-only, SKIP-offline gate step (the
     `check:agents-sync` / `check:corpus-sync` shape): DB reachable + a glossary-bearing doc drifted in
     live → WARN naming `sync-glossary --pg`; local-only (CI is DB-free); always exits 0.
   - **Re-aim `check:corpus-content` (ADR-0120) by canonicality.** Today it classifies drift as
     `value-drift` (resolve "by direction", ambiguous) vs `degraded-live`. For a glossary-bearing doc the
     direction is no longer ambiguous — the seed is canonical, so the fix is `sync-glossary --pg`, not a
     guess. The body-diff already knows each doc's kind/fields; route glossary-bearing drift to the
     seed→live restore and reserve "resolve by direction" for the genuinely live-canonical remainder.

   After a glossary-bearing seed edit the ceremony gains one step, symmetric with agents:
   `pnpm db:up && pnpm storytree library sync-glossary --pg`.

## Consequences

- **Good — the drift self-heals instead of needing a hand reconciliation.** A glossary / rename seed
  edit is carried into live by one tested command, not a one-shot `upsertDoc` script run by eye (PR
  #438's recipe). `check:glossary-sync` turns a stale live row into a visible WARN at the local gate, and
  `check:corpus-content` stops asking the operator to guess direction for the cases the model now answers.
- **Good — the model finally matches the mechanism.** The glossary has generated from the seed since
  ADR-0018; this stops pretending those source docs are live-canonical. It is the same exception ADR-0055
  already carved for agents, for the same reason (offline render), so the corpus gains ONE consistent
  rule: *a doc whose authoritative view is generated offline from the seed is seed-canonical.*
- **Bound — the seed-canonical subset is the stable reference tier.** Glossary-bearing docs are
  definitions and the carried-from-v1 principles — the slowest-changing corner of the corpus — so losing
  live-edit on ~50 docs (they must be edited in the seed + synced) costs little, exactly as it costs
  little for agents. The hot, parallel-session-edited artifacts (`open-question` / `proposal` / most
  `process` / `pattern`) are not glossary-bearing and stay live-canonical, so ADR-0023's
  parallel-iteration property is untouched.
- **Bound — the non-glossary bulk-edit residue is acknowledged, not fully closed.** The 4 stale docs that
  are NOT glossary-bearing (the `techstack` / principle the rename also swept) stay LIVE-canonical; their
  canonical edit surface remains `artifact edit --pg`. A deliberate bulk seed sweep of live-canonical
  docs can be carried across by the same reconcile invoked over an explicit id set (a `--ids` escape
  hatch), but routing bulk mechanical edits through the seed for live-canonical docs is an
  operator-discipline question this ADR parks — the minimal, ratifiable landing is the glossary-bearing
  subset.
- **Bound — `sync-glossary` re-stamps the subset on every run** (one `library_event` per doc,
  idempotent), the same harmless audit cost ADR-0055 accepted for `sync-agents`.
- **Until ratified + built, the hand recipe stands.** This ADR is `proposed`; the model call in part 1 is
  the owner's. Until it is flipped green and part 2 lands, `check:corpus-content` keeps surfacing the
  drift and the PR #438 recipe (restore stale live←seed; `export-corpus` for genuine live edits) is the
  manual close.

## References

- [ADR-0023](0023-library-cli-choose-your-own-adventure.md) — the live-canonical default for the
  non-agent tier; amended here to carve out the glossary-bearing subset (as ADR-0055 carved out agents).
- [ADR-0055](0055-the-library-agent-tier-is-seed-canonical-sync-agents-reconci.md) — the seed-canonical
  `agent` tier and `sync-agents` reconcile this mirrors: same forcing condition (offline render), same
  overwrite-and-never-delete policy, same WARN gate.
- [ADR-0103](0103-seed-to-live-reconcile-for-the-non-agent-corpus-tier-sync-co.md) — `sync-corpus`,
  migrate-only seed→live; amended by adding the seed→live OVERWRITE path its policy deliberately omits.
- [ADR-0120](0120-live-to-seed-reconciliation-export-corpus-and-unit-status-to.md) — `export-corpus`
  (live→seed) and `check:corpus-content` (the body-diff that surfaced this); amended to make the drift
  classification canonicality-aware.
- [ADR-0018](0018-knowledge-tier-phase1-structured-source.md) — `knowledge.json` as the structured source
  and the glossary as a generated VIEW: the offline-render fact that forces the subset seed-canonical.
- [ADR-0078](0078-rename-root-ports-role-not-position.md) — the `verdict-contract`→`proof-protocol` /
  `base`→`storage-protocol` rename whose seed-only application produced the 8 stale live rows.
- [ADR-0095](0095-agent-memory-graduates-into-the-library-as-a-signal-sourc.md) — graduation writes edits
  to the seed, the reason a non-agent doc legitimately receives seed edits (and the source of the 2
  genuine value-drifts).
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — design-time owner direction
  IS ratification; the owner withheld it here (deferred the model call), so this is born `proposed`.
- Code: `apps/studio/data/build-corpus.mjs` (`renderGlossaryTerm` / `assertGlossaryMembership` — the
  `glossarySection` membership predicate the subset is fenced on); `packages/library/src/store/sync-corpus.ts`
  (migrate-only), `export-corpus.ts` (live→seed + degraded classification), `sync-agents.ts`
  (`reconcileAgents` — the overwrite shape to mirror); `packages/cli/src/check-corpus-content.ts` (the
  body-diff WARN to re-aim).
