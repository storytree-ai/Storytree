---
status: proposed
amends: [32]
---
# ADR-0095: Agent-memory graduates into the Library — the outer loop's working notes feed the durable substrate

## Status

proposed — designed 2026-06-22 by the orchestrator session at the owner's request. The owner asked how
Claude's **agent-memory** (the harness's per-user file store at `~/.claude/projects/<project>/memory/`)
relates to the **Library**, intuiting they *overlap* — "short-term vs long-term memory" — with **no
process yet to convert one into the other**. Investigation confirmed the overlap is **structural, not
incidental**: both are curated, indexed, `[[link]]`ed, deduped durable note-stores with a periodic
garbage-collection pass — the same pattern at two altitudes. The owner then named the trajectory that
makes the missing bridge **load-bearing rather than cosmetic**: *"when the outer loop gets removed in
full … we would just be relying on the library and ADRs (as well as whatever other memory we build,
maybe per-user, but that's for the future)."*

This ADR **decides the shape; it builds nothing.** It **amends [ADR-0032](0032-cite-graduation-mechanism.md)**
by adding **agent-memory as a third signal source** for the (still-unbuilt) graduation synthesis agent
that ADR-0032 named — alongside comments and cites. The owner ratifies the Open modeling calls below.

## Context

**Three tiers, not two.** The owner's "short vs long" intuition is right in spirit but the boundary
sits one tier over. There are three durable-ness tiers, and the genuinely *short-term* one is **not**
agent-memory:

| Tier | What it holds | Lifespan | Ceremony |
| --- | --- | --- | --- |
| **Context window** | the live conversation | one session (summarised when long) | none |
| **Agent-memory** (`~/.claude/.../memory/`) | what *this agent* learned about working with *this owner* on *this* project — feedback, project meta-state, traps | across sessions; **private**, per-user, per-machine | low — jot it, no PR, no gate |
| **The Library** (Cloud SQL, ADR-0023) | the project's institutional knowledge — the software being grown | permanent; **shared** by every session, agent, and the studio | high — live store, curation, reference-integrity, the gate |

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
keeps the *silo* tidy; it does nothing to move durable residue into the *commons*.

**Why now — the trajectory.** The human outer loop ([ADR-0030](0030-all-in-on-claude-agent-sdk.md): the
human owns the outer loop) is **transitional**. As it is automated and eventually removed, the durable
substrate that *survives* is the **Library + ADRs**. Whatever the outer loop learned that lives *only*
in agent-memory is lost at that point unless it has a path into the substrate. Graduation is that path:
**the outer loop paying its learnings forward into what outlives it.**

**The pattern already exists — for other sources.** ADR-0032 decided that graduation is *intelligence,
not arithmetic*: a future **synthesis agent** reads the signal-graph and emits open-questions / proposals
into the OQ→ADR flow. That agent is named and unbuilt — the `graduation-synthesist`. Its declared inputs
today are **comments + cites**. `friction-analyst` already emits recommendations *"targeting durable
Library guidance via the signal → Library graduation loop (ADR-0032)."* And [ADR-0034](0034-process-artifacts-ways-of-working.md)
gave ways-of-working a durable home: the `process` artifact kind. Most `feedback`- and `project`-type
agent-memories **are** ways-of-working signal — exactly the raw material this loop digests. The bridge
the owner intuits is therefore **not a new pipeline; it is one more source feeding the conceived one.**

## Decision

1. **Agent-memory is the outer loop's working notes — a transitional *staging* tier, explicitly not a
   terminal store.** Its job is to be cheap-to-write *and* to eventually graduate its durable residue.
   This justifies keeping it low-ceremony (no PR, no gate): nothing load-bearing is *meant* to live only
   there forever.

2. **Graduation adds agent-memory as a third signal source into ADR-0032's loop — it does not invent a
   parallel mechanism.** The `graduation-synthesist` reads agent-memory alongside comments and cites and
   synthesises **open-questions / proposals** into the existing OQ→ADR / `process` flow
   ([ADR-0018](0018-knowledge-tier-phase1-structured-source.md) §6). No new graduation machine, no
   threshold scan (ADR-0032 §5 stands — graduation is judgment, not arithmetic).

3. **The judgment is outer-loop; the candidate-generation engine is inner-loop-provable — and they are
   separated.** Deciding *whether* a memory is durable, general, and worth canonicalising is curation
   (the synthesist proposes, the librarian/guidance-curator places, the owner ratifies a substantive
   fork) — no isolatable red→green test, so it is **not** routed through the prove-it-gate. But the
   mechanical core **is** a pure function `(memoryCorpus, librarySnapshot) → graduationCandidates[]`
   (parse frontmatter, classify by type, diff against existing Library artifacts to suppress duplicates,
   emit candidates with provenance) with a deterministic red→green test, and **should be built as a real
   capability**. This is the same `prove-the-mechanism / attest-or-curate-the-judgment` split adopted for
   procedural geometry and visual work ([ADR-0069](0069-parameterise-the-forest-world-geometry-as-a-procedural-pipel.md)
   / [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md)).

4. **Graduation target is chosen by memory type:**
   - `feedback` / `project` (ways-of-working) → a **`process` artifact** ([ADR-0034](0034-process-artifacts-ways-of-working.md))
     or a **principle / guardrail** (via the guidance-curator).
   - durable **design rationale** → an **open-question** or a **proposed ADR** (synthesist → owner).
   - `reference` → the Library's **reference tier** (definitions / glossary / techstack), via the
     librarian-curator.
   - `user` (who the owner is, preferences) → **deferred, and explicitly *not* graduated to the shared
     Library.** This is the future *per-user* memory tier the owner flagged; its natural eventual home is
     `studio-members` (`UserDoc`), not the institutional commons. Privacy/scope, not just sequencing —
     see Open call 4.

5. **Direction is memory → Library (deposit), primary.** The reverse — seeding agent-memory *from* the
   Library — is **deferred**: the pull-based-context architecture already has a session read the Library
   just-in-time, so the Library does not need to be copied *into* agent-memory. Agent-memory stays the
   *private scratch* tier; the Library stays the *canonical read* tier.

6. **Graduation is a deliberate curation pass, never eager auto-promotion.** It fires at natural
   punctuation (the orchestrator spawns the synthesist at a unit boundary, or on a periodic sweep — the
   `consolidate-memory` cadence, but aimed at the commons), proposes candidates, and a human/curator
   ratifies. Eager auto-promotion would pollute the canonical store with un-vetted scratch — the failure
   mode ADR-0032 §5 already refuses for cites.

7. **The graduation filter respects don't-store-the-reconstructible.** A memory already reconstructible
   from the repo / git / `CLAUDE.md` / an existing ADR is **not** a graduation candidate
   ([ADR-0024](0024-blind-reconstruction-test-for-documentation.md)); graduation moves only the
   non-obvious residue, and reference-don't-restates its source rather than duplicating it
   ([ADR-0029](0029-agents-as-library-artifact-category.md) §7).

## Consequences

**Good.**
- Agent-memory becomes **explicitly transitional staging**, which is the honest model: its learnings have
  a path into the substrate that survives the outer loop's eventual removal, instead of dying in a
  per-machine silo.
- The `graduation-synthesist` gets its **first concrete additional input** — a step toward building the
  agent ADR-0032 named but left unbuilt.
- Durable ways-of-working stop accumulating *only* in agent-memory (where today's 71 KB / 24 KB overflow
  shows the cost): the genuinely institutional ones land as `process` artifacts / principles / ADRs that
  every session and the studio can read.
- It reuses an **already-decided loop** (ADR-0032) rather than minting a new mechanism — low conceptual
  surface area.

**Bad / costs.**
- **A new read coupling:** the candidate-generation engine must read agent-memory files — a node-only,
  filesystem, per-user surface — and feed the Library. It must stay inside the organism boundary
  ([ADR-0068](0068-make-the-organism-model-physical-real-story-isolation-and-th.md) / [ADR-0074](0074-enforce-the-organism-boundary-gate-the-cross-story-dependenc.md))
  and must not leak per-user/private content into the shared store (Decision 4, Open call 4).
- **A judgment surface that can mis-promote.** Graduation is intelligence; a weak synthesist could
  canonicalise noise. Mitigated by Decision 6 (ratified, never eager) and Decision 7 (the
  reconstructible filter) — the same posture ADR-0032 took toward cite-stuffing: defend on evidence, not
  pre-emptively.
- **Two GC passes now exist** — `consolidate-memory` (tidies the silo) and graduation (drains durable
  residue to the commons). They must be sequenced so consolidation doesn't delete a memory before it
  graduates (Open call 2).

## Open modeling calls (for the owner)

1. **Build the engine as a capability, and where?** The pure `(memory, library) → candidates[]` core is
   inner-loop-provable (Decision 3). Does it extend the existing `feedback-graduation` story (which
   ADR-0032 already reshaped around `signal-synthesis`), or is agent-memory-as-a-source its own story
   under the no-cycle rule? **Recommendation:** extend `feedback-graduation` — same loop, one more source.
2. **Does graduation consume or cache the memory?** After a memory graduates, is its agent-memory file
   **deleted**, or **left as a local cache with a `graduated → asset:<id>` backlink**? **Recommendation:**
   leave it with a backlink — the session keeps fast local recall, the canonical copy is the Library, and
   `consolidate-memory` learns to skip backlinked files. (Agent-memory has no supersession log of its own;
   the backlink *is* its provenance edge.)
3. **Trigger cadence.** Unit-boundary spawn by the orchestrator, a periodic sweep, or an explicit
   `storytree memory graduate` command the owner runs (the `consolidate-memory` analogue for the
   commons)? **Recommendation:** an explicit command first (cheapest, fully owner-controlled), promote to
   an automatic unit-boundary spawn once the synthesist is trusted.
4. **The per-user tier (the owner's "for the future").** `user`-type memory is deliberately *not*
   graduated to the shared Library (Decision 4). When it is built, is its home `studio-members`
   (`UserDoc`), and what is the consent/scope boundary that keeps per-user preference out of institutional
   knowledge? **Record as an open-question now, decide later** — out of scope here.
5. **Trust in agent-authored signal.** ADR-0032 §6 left agent-cite identity semantics open; the
   synthesist's trust in *agent-memory* signal sits on the same unresolved `actor`-provenance question.
   Graduation inherits it rather than resolving it.

## References

- [ADR-0032](0032-cite-graduation-mechanism.md) — **the loop this amends**: graduation as a future
  synthesis agent reading a signal-graph (comments + cites) into the OQ→ADR flow; this ADR adds
  agent-memory as a third source. §5 (no threshold/anti-gaming pre-solve) and §6 (identity as provenance,
  still open) carry through.
- [ADR-0034](0034-process-artifacts-ways-of-working.md) — `process` artifacts, the durable home for
  ways-of-working; the primary graduation target for `feedback`/`project` memory.
- [ADR-0030](0030-all-in-on-claude-agent-sdk.md) — the human owns the outer loop; the transitional outer
  loop whose eventual removal makes this bridge load-bearing.
- [ADR-0069](0069-parameterise-the-forest-world-geometry-as-a-procedural-pipel.md) / [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md)
  — the prove-the-mechanism / attest-or-curate-the-judgment two-stage split this reuses (Decision 3).
- [ADR-0023](0023-library-cli-choose-your-own-adventure.md) — the Library as the live shared source of
  truth (Cloud SQL); the commons agent-memory deposits into.
- [ADR-0024](0024-blind-reconstruction-test-for-documentation.md) / [ADR-0029](0029-agents-as-library-artifact-category.md)
  §7 — the don't-store-the-reconstructible / reference-don't-restate filter graduation applies (Decision 7).
- [ADR-0018](0018-knowledge-tier-phase1-structured-source.md) §6 — the OQ→ADR lifecycle the synthesist
  emits into.
- The `graduation-synthesist` agent (named, unbuilt — *"the v2 home of V1 memory-curator's
  graduate-durable-rules role"*) and `friction-analyst` (already emits ADR-0032-targeted recommendations)
  — the curation roles that own the judgment.
- [ADR-0050](0050-adr-number-allocation.md) — number allocation; **note:** authored **offline** (fresh
  worktree, no live DB), so the allocator fell back to `max+1` and first picked `0094` — which a
  **parallel session had already landed** on `main`. The `git fetch && git merge origin/main` staleness
  check before opening the PR caught the collision and bumped this to `0095` (re-validated by the
  `adr-number-unique` gate). A live demonstration of exactly the parallel-authoring race the atomic
  allocator prevents — and the offline backstop that catches it.
- The harness agent-memory store (`~/.claude/projects/<project>/memory/`, its `MEMORY.md` index, and the
  `consolidate-memory` skill) — the private tier this drains; **not** a repo path, named for orientation.
- Owner design conversation, 2026-06-22.
