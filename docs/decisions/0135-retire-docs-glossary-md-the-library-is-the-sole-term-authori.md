---
status: accepted
decided: 2026-06-28
supersedes: [125]
amends: [18, 23, 120]
---
# ADR-0135: Retire docs/glossary.md; the Library is the sole term authority

## Status

accepted (2026-06-28) — decided/directed by the owner in conversation on 2026-06-28. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Supersedes** ADR-0125 — it proposed *adding* reconcile machinery (`sync-glossary` + a drift gate) to
keep the glossary's source seed-canonical; this retires the glossary file outright instead, so that
machinery is moot. ADR-0125 flips to `superseded`.
**Amends** ADR-0018, ADR-0023, ADR-0120 — narrows the generated-view set to `assets.json` only (0018),
drops `docs/glossary.md` from the seed/export surface (0023 §11), and makes `check:corpus-build`
assets-only (0120 part 1). None overturned: `knowledge.json` stays the structured source, the non-agent
tier stays live-canonical, and `check:corpus-build` still gates the remaining generated view.

## Context

`docs/glossary.md` is a GENERATED VIEW of `apps/studio/data/knowledge.json` (`build-corpus.mjs`,
ADR-0018). An investigation on 2026-06-28 established it is **not load-bearing**: nothing reads it as
data at runtime — the studio and CLI render a term's meaning from the **definition artifacts**
(`whatItIs` / `whatItIsNot`), not the file; it is served only as a read-only reference doc, like the
ADRs. The one thing that tied it to agents was the hand-written `CLAUDE.md` line *"read
`docs/glossary.md` (authoritative terms)"* — a front-load that contradicts ADR-0023's
choose-your-own-adventure model (pull-based, just-in-time, map-only boot, ADR-0023 §9). The agent
context assembler (`renderAgentPrompt`) never injected the glossary; it was already faithful to that
model. So the file is **redundant**: the Library's definition artifacts already are the authoritative,
JIT-lookable term source.

ADR-0125 (proposed the same week) read the seed↔live drift on glossary-bearing docs as a canonicality
gap and proposed *adding* reconcile machinery to keep the file's source seed-canonical. That patches a
symptom of keeping a redundant generated-authoritative file. Removing the file dissolves the gap.

## Decision

Retire `docs/glossary.md`. The Library's definition artifacts are the SOLE authoritative term source;
terms are looked up just-in-time (`storytree library artifact <term>`); nothing front-loads a glossary.
Done in two stages so the irreversible data migration is not bundled with the deletion:

**Phase 1 (this PR).** Delete `docs/glossary.md`; strip the glossary half of `build-corpus.mjs` (it now
generates `assets.json` only); narrow `check:corpus-build` to `assets.json`; remove the
`repo-manifest.json` entry; reword `CLAUDE.md` and the studio README so terms point at the Library /
ADR-0002, not the file. The `CLAUDE.md` "read it first" line is replaced with JIT guidance — closing the
one drift from ADR-0023 §9's map-only boot. The **v1→v2 term map** (the only generator-only content) is
dropped as legacy-reading debt (`legacy/Agentic` is reference-only; per-term definitions carry their own
v1 notes).

**Phase 2 (follow-up PR).** The corpus-data cleanup, batched because it is all live-store / seed
mutation: (a) strip the now-inert `glossaryBody` / `glossaryTerm` / `glossarySection` fields + the
`doc:glossary.md` citations (seed `knowledge.json` + a guarded live-store migration of the 52 rows) and
remove the three optional fields from the schema; (b) reword or retire the corpus PROSE that still calls
the retired file authoritative — chiefly the "defer to the glossary" principle (injected into the
`librarian-curator` agent), plus the `library` definition, the `library-edit-ceremony` process, and the
`corpus-investigator` source-map — then regenerate the derived views (`build-corpus`, `build:agents`,
`build:claude`). Separated because all of this is live-store / seed mutation, and none of it breaks a
gate while it sits (dangling `doc:` refs and stale prose are not resolution-checked), so Phase 1 lands
with no live write.

## Consequences

- **Good — removes machinery instead of adding it.** The seed↔live canonicality tug-of-war ADR-0125
  addressed (`glossaryBody` seed-canonical yet invisible to the live store) simply disappears: no
  `sync-glossary`, no glossary drift gate, one fewer generated-authoritative file to keep in sync. The
  corpus has ONE authoritative term home — the definition artifacts — reachable JIT.
- **Good — the onboarding finally matches the machinery.** ADR-0023 §9 said boot is map-only and
  guidance is pulled on friction; the agent context assembler already obeyed that. Dropping the "read
  the glossary first" line removes the lone front-load, so the stated model and the built model agree.
- **Bound — the single browsable glossary page is gone.** Terms are browsed per-artifact (the studio
  already renders each definition); a reader wanting "all terms on one page" no longer has it.
- **Bound — the v1→v2 term map is dropped.** Reading legacy Agentic docs loses that index; the per-term
  v1 notes on definitions remain, and `legacy/Agentic` is reference-only.
- **Bound — staged; the corpus still mentions the file until Phase 2.** Until the follow-up, 52 docs
  keep inert `glossary*` fields + a dangling `doc:glossary.md` citation each (dead studio links, no gate
  failure — `doc:` refs are display-grouped, not resolution-gated), and a handful of corpus units still
  call the glossary authoritative in prose (the "defer to the glossary" principle + the librarian's
  injected guidance, the `library` definition, the edit-ceremony process). This ADR is the authority that
  overrides them; Phase 2 reconciles the corpus and regenerates the agent / CLAUDE.md / assets views.

## References

- [ADR-0023](0023-library-cli-choose-your-own-adventure.md) — the choose-your-own-adventure / pull-based
  JIT context model this realizes; the glossary front-load was the lone drift from it.
- [ADR-0018](0018-knowledge-tier-phase1-structured-source.md) — `knowledge.json` as the structured
  source + the generated-view model, narrowed here to `assets.json` only.
- [ADR-0120](0120-live-to-seed-reconciliation-export-corpus-and-unit-status-to.md) —
  `check:corpus-build` (now assets-only) + the body-diff that surfaced the seed↔live drift.
- [ADR-0125](0125-glossary-bearing-corpus-docs-are-seed-canonical-reconcile-th.md) — superseded:
  proposed reconcile machinery for the glossary's seed-canonical source; mooted by retiring the file.
- [ADR-0055](0055-the-library-agent-tier-is-seed-canonical-sync-agents-reconci.md) /
  [ADR-0103](0103-seed-to-live-reconcile-for-the-non-agent-corpus-tier-sync-co.md) — the seed-canonical
  agent tier + migrate-only `sync-corpus`; the seed/live model whose glossary corner this removes.
- Code: `apps/studio/data/build-corpus.mjs` (glossary half removed),
  `packages/library/src/store/render-agent.ts` (`renderAgentPrompt` never injected the glossary),
  `packages/cli/src/corpus-build-check.test.ts` (the assets-only drift gate).
