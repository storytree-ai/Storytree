---
status: accepted
decided: 2026-06-22
amends: [32]
---
# ADR-0095: Agent-memory graduates into the Library — the outer loop's working notes feed the durable substrate

## Status

accepted (2026-06-22), designed and ratified the same day at the owner's request. The owner asked how
Claude's **agent-memory** (the harness's per-user file store at `~/.claude/projects/<project>/memory/`)
relates to the **Library**, intuiting they *overlap* — "short-term vs long-term memory" — with **no
process yet to convert one into the other**. Investigation confirmed the overlap is **structural, not
incidental**: both are curated, indexed, `[[link]]`ed, deduped durable note-stores with a periodic
garbage-collection pass — the same pattern at two altitudes. The owner named the trajectory that makes
the missing bridge **load-bearing rather than cosmetic**: *"when the outer loop gets removed in full …
we would just be relying on the library and ADRs (as well as whatever other memory we build, maybe
per-user, but that's for the future)."*

The owner **delegated the modeling forks** ("I think you can decide most of these") and resolved the
load-bearing ones directly — all folded into the Decisions below:

- a graduated memory is **deleted, not cached** (Decision 6), to force **dogfooding the Library** as the
  canonical read surface;
- the **librarian-curator runs as part of general session orchestration — before each merge ceremony**
  — and is the role that graduates (Decision 7), generalising [ADR-0067](0067-the-inner-loop-runs-a-scoped-librarian-curator-after-a-green.md);
- graduation also **derives definitions / principles from the memory files**, which flow into **agent
  guidance** through the existing render pipeline (Decision 4; [ADR-0051](0051-the-agent-renderer-shapes-claude-md-and-the-leaf-prompt-from.md) /
  [ADR-0053](0053-cli-builds-its-guidance-prose-from-the-library.md));
- the bar is **genuine durability — no Library bloat** (Decision 8);
- and a scoping rule: **the Library, ADRs excepted, holds only durable, reusable ("able") artifacts —
  never ad-hoc, short-lived, event-specific material** (Decision 5).

This ADR **decides the shape; it builds nothing** — the candidate-generation engine, the
agent-definition edits, and the guidance-render wiring are follow-on units it authorises. It **amends
[ADR-0032](0032-cite-graduation-mechanism.md)** by adding **agent-memory as a third signal source** for
the graduation synthesis the librarian performs, alongside comments and cites.

## Context

**Three tiers, not two.** The owner's "short vs long" intuition is right in spirit but the boundary
sits one tier over. There are three durable-ness tiers, and the genuinely *short-term* one is **not**
agent-memory:

| Tier | What it holds | Lifespan | Ceremony |
| --- | --- | --- | --- |
| **Context window** | the live conversation | one session (summarised when long) | none |
| **Agent-memory** (`~/.claude/.../memory/`) | what *this agent* learned about working with *this owner* on *this* project — feedback, project meta-state, traps | across sessions; **private**, per-user, per-machine | low — jot it, no PR, no gate |
| **The Library** (Cloud SQL, [ADR-0023](0023-library-cli-choose-your-own-adventure.md)) | the project's institutional knowledge — the software being grown | permanent; **shared** by every session, agent, and the studio | high — live store, curation, reference-integrity, the gate |

So agent-memory is *already* a long-term store. The axis that actually separates it from the Library is
not lifespan but **ceremony and scope**: agent-memory is a fast, private, lossy scratchpad; the Library
is the slow, shared, canonical record.

**The overlap is the same machine twice.** Agent-memory independently reinvented the Library's
primitives: a budget-bounded always-loaded **index** (`MEMORY.md`) over atomic **one-fact files**;
**typed frontmatter** (`user`/`feedback`/`project`/`reference`) mirroring the Library's `kind`;
`[[wiki-links]]` mirroring `depends_on`/`consumed_by`/`references[]`; dedupe-before-write mirroring the
librarian-curator; delete-when-wrong mirroring `artifact retire`; and the `consolidate-memory` skill as
its GC, mirroring the librarian-curator pass. The one Library discipline agent-memory **lacks** is a
decision log with supersession edges — it overwrites or deletes; it has no "this superseded that, keep
the history."

**The missing bridge.** Nothing promotes a durable fact *out of* the private agent-memory silo *into*
the shared Library. A trap learned at 11pm lives in `~/.claude/` forever, invisible to other sessions,
to the studio, to other agents — and it **dies with the silo** (per-user, per-machine). The bloat is
real and live: at authoring time this project's agent-memory holds **115 files** and a **71 KB index
against a ~24 KB budget**, so the harness is already truncating recall. The local GC (`consolidate-memory`)
keeps the *silo* tidy; it does nothing to move durable residue into the *commons*. And most of those
115 files are **event-specific narratives** ("PR #X fixed Y on date Z") — exactly the material the
able-things-only rule (Decision 5) keeps *out* of the Library, whose durable essence (a trap, a
principle) is small and whose event-record already lives in git.

**Why now — the trajectory.** The human outer loop ([ADR-0030](0030-all-in-on-claude-agent-sdk.md): the
human owns the outer loop) is **transitional**. As it is automated and eventually removed, the durable
substrate that *survives* is the **Library + ADRs**. Whatever the outer loop learned that lives *only*
in agent-memory is lost at that point unless it has a path into the substrate. Graduation is that path:
**the outer loop paying its learnings forward into what outlives it.**

**The pattern already exists — for other sources.** [ADR-0032](0032-cite-graduation-mechanism.md)
decided that graduation is *intelligence, not arithmetic*: a synthesis agent reads the signal-graph and
emits open-questions / proposals into the OQ→ADR flow. Its declared inputs today are **comments +
cites**. `friction-analyst` already emits recommendations *"targeting durable Library guidance via the
signal → Library graduation loop (ADR-0032)."* And [ADR-0034](0034-process-artifacts-ways-of-working.md)
gave ways-of-working a durable home: the `process` artifact kind. Most `feedback`- and `project`-type
agent-memories **are** ways-of-working signal. The bridge the owner intuits is therefore **not a new
pipeline; it is one more source feeding the conceived one.**

## Decision

1. **Agent-memory is the outer loop's working notes — a transitional *staging* tier, explicitly not a
   terminal store.** Its job is to be cheap-to-write *and* to eventually graduate its durable residue.
   This justifies keeping it low-ceremony (no PR, no gate): nothing load-bearing is *meant* to live only
   there forever.

2. **Graduation adds agent-memory as a third signal source into ADR-0032's loop — the librarian-curator
   performs it, not a new pipeline.** The librarian reads agent-memory alongside comments and cites and
   synthesises durable Library artifacts (and, where the residue is a decision, OQs / proposed ADRs)
   into the existing flow ([ADR-0018](0018-knowledge-tier-phase1-structured-source.md) §6). No new
   graduation machine, no threshold scan ([ADR-0032](0032-cite-graduation-mechanism.md) §5 stands —
   graduation is judgment, not arithmetic).

3. **The judgment is outer-loop curation; the candidate-generation engine is inner-loop-provable — and
   they are separated.** Deciding *whether* a memory is durable, general, and worth canonicalising is
   curation — no isolatable red→green test, so it is **not** routed through the prove-it-gate. But the
   mechanical core **is** a pure function `(memoryCorpus, librarySnapshot) → graduationCandidates[]`
   (parse frontmatter, classify, diff against existing Library artifacts to suppress duplicates, emit
   candidates with provenance) with a deterministic red→green test, and **should be built as a real
   capability**. This is the same `prove-the-mechanism / attest-or-curate-the-judgment` split adopted
   for procedural geometry and visual work ([ADR-0069](0069-parameterise-the-forest-world-geometry-as-a-procedural-pipel.md)
   / [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md)).

4. **Graduation target is chosen by what the memory durably *is* — and derived definitions / principles
   feed agent guidance.**
   - `feedback` / `project` (ways-of-working) → a **`process` artifact**
     ([ADR-0034](0034-process-artifacts-ways-of-working.md)) or a **principle / guardrail**.
   - the durable **definitions** and **principles** a memory implies → the **definition / principle**
     kinds — which then **flow into agent guidance** (the generated `CLAUDE.md` regions and the leaf
     prompt) automatically through the render pipeline ([ADR-0051](0051-the-agent-renderer-shapes-claude-md-and-the-leaf-prompt-from.md)
     / [ADR-0053](0053-cli-builds-its-guidance-prose-from-the-library.md)), "injected as needed",
     pull-based. This closes the loop: a session's learning becomes durable guidance the next session
     pulls.
   - durable **design rationale** → an **open-question** or a **proposed ADR**.
   - `reference` → the Library's **reference tier** (definitions / glossary / techstack).
   - `user` (who the owner is, preferences) → **deferred, and explicitly *not* graduated to the shared
     Library** — the future *per-user* memory tier (Open call 1); its eventual home is `studio-members`,
     not the institutional commons. Privacy/scope, not just sequencing.

5. **The Library, ADRs excepted, holds only durable, reusable ("able") artifacts — never event-specific
   cruft.** (Owner's scoping rule.) **ADRs are the one exception**, because they *are* the
   decision-event history — point-in-time, append-only. Every other kind — definition, principle,
   guardrail, pattern, process, capability, story, reference — must be a **durable, general, reusable**
   thing. So graduation **extracts the durable essence** from an event-specific memory (the reusable
   principle / definition / process) and graduates *only that*; the event-specific record itself ("this
   PR, this date, this fix") stays in **git history / the relevant ADR** and never becomes a non-ADR
   artifact. A memory with **no** durable reusable essence mints **no** non-ADR artifact — it either
   informs an ADR or is simply pruned.

6. **A graduated memory is deleted, not cached — to dogfood the Library.** (Owner's call, overriding the
   proposal's backlink suggestion.) Once a memory's durable essence is in the Library (or its
   event-record is captured by an ADR / git), the agent-memory file is **removed**. No local
   backlink-cache: keeping one would let sessions read the cache instead of the Library, and we want the
   Library **exercised as the canonical read surface** (the *live-store-is-the-edit-surface* dogfooding
   posture). Recall of graduated knowledge thereafter is the normal pull-based Library read
   ([ADR-0023](0023-library-cli-choose-your-own-adventure.md)) — and, for guidance, the rendered
   injection of Decision 4.

7. **Graduation runs inside general session orchestration — a librarian-curator pass before each merge
   ceremony.** (Owner's call.) This **generalises [ADR-0067](0067-the-inner-loop-runs-a-scoped-librarian-curator-after-a-green.md)**
   (the inner loop already runs a scoped librarian-curator after a green) and the session-orchestrator's
   existing landing step (spawn the librarian to keep the decision log honest): the same pass now also
   **graduates durable agent-memory** and **derives definitions / principles for agent guidance**, and
   it runs **before each merge ceremony** as a standard orchestration step — *green unit → librarian
   pass (curate + graduate) → merge*. Bounded to that punctuation, not eager or continuous.

8. **The bar is genuine durability — no Library bloat.** (Owner's primary guardrail.) The librarian
   graduates **only** material that is genuinely durable, general, and **not** already reconstructible
   from the repo / git / `CLAUDE.md` / an existing artifact ([ADR-0024](0024-blind-reconstruction-test-for-documentation.md)
   / [ADR-0029](0029-agents-as-library-artifact-category.md) §7). Redundant, speculative, or
   event-specific candidates are **rejected**, not graduated. This discriminating judgment is the whole
   reason graduation is curation (intelligence) and not a threshold scan (arithmetic), per ADR-0032
   §2/§5 — and it is the explicit defence against the Library bloat the owner called out.

9. **Direction is memory → Library (deposit), primary.** Seeding agent-memory *from* the Library is
   unnecessary: the pull-based-context architecture already has a session read the Library just-in-time,
   and Decision 4 routes durable knowledge into agent guidance directly. Agent-memory stays the *private
   scratch* tier; the Library + its rendered guidance are the *canonical read* tier.

## Consequences

**Good.**
- Agent-memory becomes **honestly transitional**: its learnings reach the substrate that survives the
  outer loop's eventual removal, and the Library is **dogfooded as the canonical read surface** because
  deletion (Decision 6) leaves no cache to lean on.
- **The loop closes** — memory → Library → agent guidance (Decision 4): what one session learns becomes
  durable guidance the next session pulls, via the render pipeline already built (ADR-0051/0053).
- The **librarian-curator gains a concrete expanded role at a natural cadence** (pre-merge), generalising
  ADR-0067 rather than inventing a touchpoint.
- The **able-things-only rule** (Decision 5) keeps the Library from accumulating event cruft, and —
  applied to today's 115-file / 71 KB overflow — explains it: the silo is full of event narratives whose
  durable essence is small. Graduation-then-deletion is the structural drain; `consolidate-memory` is the
  immediate stopgap.

**Bad / costs.**
- **Deletion is destructive.** A mis-graduation that drops a memory whose essence did *not* actually land
  in the Library loses it. Mitigated by Decision 8 (genuine-only; the librarian extracts *before*
  deleting), by git/ADRs holding the event-record, and by the pass being ratified curation — but the
  engine must **capture-then-delete** as one step, never delete speculatively (a follow-on build
  constraint).
- **A new read coupling:** the engine reads per-user agent-memory files (node-only, filesystem) and feeds
  the Library; it must stay inside the organism boundary ([ADR-0068](0068-make-the-organism-model-physical-real-story-isolation-and-th.md)
  / [ADR-0074](0074-enforce-the-organism-boundary-gate-the-cross-story-dependenc.md)) and must not leak
  per-user/private content into the shared store (Decision 4's `user` carve-out).
- **The genuineness bar can err both ways** — too loose bloats the Library, too strict loses knowledge.
  The owner's "genuine" bar is the dial; mis-tuning is the main risk, defended on evidence (the posture
  ADR-0032 §5 took toward cite-stuffing), not pre-emptively.
- **Two GC passes** now exist — `consolidate-memory` (tidies the silo) and graduation (drains it). They
  must sequence so consolidation doesn't delete a memory before it graduates; simplified by graduation
  itself doing the delete.

## Open modeling calls

1. **The per-user tier** (the owner's "for the future"). `user`-type memory is deliberately *not*
   graduated to the shared Library (Decision 4). When built, is its home `studio-members` (`UserDoc`),
   and what is the consent/scope boundary that keeps per-user preference out of institutional knowledge?
   **Record as an open-question now, decide later** — out of scope here.
2. **Trust in agent-authored signal.** ADR-0032 §6 left agent-cite identity semantics open; the
   librarian's trust in *agent-memory* signal sits on the same unresolved `actor`-provenance question.
   Graduation inherits it rather than resolving it.

*(Resolved by the owner's delegation / direction, now in the Decisions: the candidate-generation engine
**extends the `feedback-graduation` story** — ADR-0032 already reshaped it around `signal-synthesis`,
and agent-memory is one more source; **delete-after-graduation** over a backlink-cache, Decision 6;
**pre-merge-ceremony librarian pass** over a standalone command, Decision 7.)*

## Follow-on (this ADR authorises; built separately)

- the inner-loop-provable **engine** `(memory, library) → candidates[]` (Decision 3), under
  `feedback-graduation`;
- the **agent-definition edits** — `librarian-curator` (it graduates, derives definitions/principles for
  guidance) and `session-orchestrator` (it runs the librarian pass before each merge ceremony) — which
  are **seed-canonical** ([ADR-0055](0055-the-library-agent-tier-is-seed-canonical-sync-agents-reconci.md)):
  edit `knowledge.json`, regenerate (`pnpm build:claude`), `sync-agents --pg`;
- the **guidance-render wiring** so derived definitions/principles surface in `CLAUDE.md` / the leaf
  prompt (ADR-0051/0053).

## References

- [ADR-0032](0032-cite-graduation-mechanism.md) — **the loop this amends**: graduation as a synthesis
  agent reading a signal-graph (comments + cites) into the OQ→ADR flow; this ADR adds agent-memory as a
  third source. §2 (intelligence not arithmetic) and §5 (no threshold / anti-gaming pre-solve) carry
  through and back the genuineness bar (Decision 8); §6 (identity) is Open call 2.
- [ADR-0034](0034-process-artifacts-ways-of-working.md) — `process` artifacts, the durable home for
  ways-of-working; a primary graduation target for `feedback`/`project` memory.
- [ADR-0067](0067-the-inner-loop-runs-a-scoped-librarian-curator-after-a-green.md) — the scoped
  librarian-curator after a green; **generalised** here to a pre-merge orchestration pass that also
  graduates (Decision 7).
- [ADR-0051](0051-the-agent-renderer-shapes-claude-md-and-the-leaf-prompt-from.md) /
  [ADR-0053](0053-cli-builds-its-guidance-prose-from-the-library.md) — the agent-guidance render
  pipeline derived definitions/principles flow into (Decision 4); [ADR-0055](0055-the-library-agent-tier-is-seed-canonical-sync-agents-reconci.md)
  — the agent tier is seed-canonical (the follow-on agent edits).
- [ADR-0030](0030-all-in-on-claude-agent-sdk.md) — the human owns the outer loop; the transitional outer
  loop whose eventual removal makes this bridge load-bearing.
- [ADR-0069](0069-parameterise-the-forest-world-geometry-as-a-procedural-pipel.md) /
  [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — the
  prove-the-mechanism / attest-or-curate-the-judgment split this reuses (Decision 3).
- [ADR-0023](0023-library-cli-choose-your-own-adventure.md) — the Library as the live shared source of
  truth; the canonical read surface deletion (Decision 6) forces sessions onto.
- [ADR-0024](0024-blind-reconstruction-test-for-documentation.md) /
  [ADR-0029](0029-agents-as-library-artifact-category.md) §7 — the don't-store-the-reconstructible /
  reference-don't-restate filter the genuineness bar applies (Decision 8).
- [ADR-0018](0018-knowledge-tier-phase1-structured-source.md) §6 — the OQ→ADR lifecycle the synthesis
  emits into.
- The `graduation-synthesist` / `librarian-curator` / `friction-analyst` agents — the curation roles that
  own the judgment.
- [ADR-0050](0050-adr-number-allocation.md) — number allocation; **note:** authored **offline** (fresh
  worktree, no live DB), so the allocator fell back to `max+1` and first picked `0094` — which a
  **parallel session had already landed** on `main`. The `git fetch && git merge origin/main` staleness
  check before opening the PR caught the collision and bumped this to `0095` (re-validated by the
  `adr-number-unique` gate). A live demonstration of exactly the parallel-authoring race the atomic
  allocator prevents — and the offline backstop that catches it.
- The harness agent-memory store (`~/.claude/projects/<project>/memory/`, its `MEMORY.md` index, and the
  `consolidate-memory` skill) — the private tier this drains; **not** a repo path, named for orientation.
- Owner design conversation, 2026-06-22.
