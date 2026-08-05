---
status: accepted
decided: 2026-08-05
amends: [209, 307]
---
# ADR-0309: story-author holds a kind-fenced uat-criterion Library write: the atomic pair survives the medium change

## Status

accepted (2026-08-05) — decided/directed by the owner in conversation on 2026-08-05. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends [ADR-0209](0209-tier-model-judged-uat-below-irreducible-human-witness.md)** — its D5 says
`story-author` "owns these artifacts together with the hierarchy and may author the pair atomically",
a clause deliberately KEPT when ADR-0307 D5 struck the seed-canonical medium around it. That clause
had no granted authority behind it. This ADR supplies the authority, so D5 becomes wholly
self-describing again. D5's substance is untouched.

**Amends [ADR-0307](0307-the-agent-tier-goes-live-canonical-the-committed-seed-stops.md)** — its D5
moved the detail tier's MEDIUM from a committed file to a live `--pg` write and correctly narrowed
`story-author`'s file fence to `stories/**`. It did not say who holds the new medium's write. This
ADR completes that half. 0307 D5's direction is untouched.

## Context

ADR-0307 D5 migrated the 74 live `uat-criterion` detail artifacts off the committed seed and deleted
`apps/studio/data/seed-kinds/`. Every Library kind is now live-canonical. The detail half of the
criterion↔detail pair therefore stopped being a file write and became a `storytree library artifact
… --pg` write.

That left an authority gap that no ADR resolved. Measured against the live corpus and the working
tree on 2026-08-05:

- **ADR-0209 D5 still assigns the pair to `story-author`**, and the clause was preserved on purpose:
  0307 D5 struck only the `seed-canonical` sentence and annotated the survivor — *"The pair is still
  authored together; only the second half's MEDIUM changed."*
- **`packages/uat-criterion/src/story-author-scope.ts`** narrows `isStoryAuthorWriteAllowed` to the
  single root `stories/**`, and its doc comment points the detail half at the store.
- **The live `story-author` agent artifact grants the opposite**, in four places: its Role ("does NOT
  author Library knowledge, use a live DB write boundary"), its Tools ("Least-authority: no Library
  artifact write, no DB/`--pg`…"), its Outcome ("Every changed frontmatter-markdown file is under
  `stories/**`"), and its provenance, which records the no-DB property as a deliberate 2026-07-10
  correction. Only Workflow step 3 is compatible — "Never use a Library artifact command **for a work
  unit**" is scoped to work units, and a detail body is not one.

So no agent held the authority to author a detail body. The work still got done, by orchestrator
sessions authoring directly — which is exactly the silent drift the gap produces.

**The blocker that was assumed, and is not there.** The natural objection to granting the write is
that it breaks `story-author`'s fail-closed spawned-runtime fence, which "exposes no Bash" and so
cannot reach a shell verb. That fence does not exist:

- `packages/agent/src/spawn-story-author.ts` was built by a gated leaf (`82e24ff0`) and **deleted**
  by `ed295f48`. [ADR-0175](0175-repurpose-don-t-delete-the-in-app-orchestrator-chat-infrastr.md)
  (accepted, load-bearing) retired the spawn tool surface and names the `spawn_story_author` caller
  as retiring with it.
- `runSpawnWriteScoped` survives — Bash-free, fence-injecting — but ADR-0175 keeps it **deliberately
  caller-less**.
- `isStoryAuthorWriteAllowed` has **no production consumer**: exported from
  `packages/uat-criterion/src/index.ts` and covered by its own test, referenced nowhere else under
  `packages/` or `apps/`.
- No generated agent under `.claude/agents/` carries a `tools:` frontmatter fence, and
  `.claude/settings.json` configures only `SessionStart` and `UserPromptSubmit` — there is no
  `PreToolUse` hook.

The only `story-author` that exists today is the harness subagent, which inherits every tool
including Bash. The least-authority line is an **instruction** fence, not a mechanical one. That is
not nothing — ADR-0284 already settled that a shell write escaping the write-authority wall "is
still a violation" — but it means this grant costs a documented discipline, not a fail-closed
property.

`stories/uat-criterion-detail/story-author-detail-authority.md` had already reached the right answer
("story-author did NOT lose authority over details… the detail half is a `--pg` Library write
governed by the library-edit ceremony") but justified it with "Bash stays absent from the spawn tool
surface (existing agent invariant)" — the invariant ADR-0175 retired. Nothing propagated that
conclusion to the agent artifact, so the two surfaces disagreed.

## Decision

### D1 — `story-author` holds a Library write fenced to the `uat-criterion` kind

`story-author` may author and edit `uat-criterion` detail artifacts through
`storytree library artifact new|edit … --pg`. This restores ADR-0209 D5's pair to a single owner and
grants nothing else: no other Library kind, no ADR write, no gate, no build/promotion/signing verb,
no implementation. The rest of its least-authority stands.

The pair is authored **together**, not atomically in the transactional sense — the halves live in
different media and no mechanism spans them. ADR-0307 D5's own annotation already softened
"atomically" to "together"; this ADR adopts that reading rather than promising a guarantee nothing
implements. The obligation is that a criterion carrying a `(detail:)` pointer and its artifact are
authored in the same pass, and that a criterion's death retires its artifact (`edit-story-uat-criteria`
step 5).

### D2 — The fence is the kind, enforced as instruction, and this is stated rather than implied

There is no mechanism today that admits a `--pg` write of one kind and refuses another; the CLI
write path is kind-agnostic and reached through a shell. The `uat-criterion` fence is therefore
carried in the agent artifact's prose and is binding the same way ADR-0284's lobby rule binds Bash:
an out-of-kind Library write by `story-author` is a violation, not an affordance.

This is recorded as a known asymmetry, not a gap to be silently tolerated. Making it mechanical
would mean a kind-scoped write verb or a `PreToolUse` predicate in the shape of
`isStoryAuthorWriteAllowed`; both are real options and neither is in scope here. Whoever wants the
mechanical fence should note that `runSpawnWriteScoped` already exists, caller-less, as the shape to
aim at.

### D3 — The disagreeing surfaces are corrected in place, not left to drift

Under ADR-0139 these are overtaken prose, not re-decisions, so they are corrected in place:

- The **live `story-author` agent artifact** — Role, Tools, Outcome, and Workflow gain the fenced
  write, and the Tools least-authority line names the exception explicitly. Regenerated into the
  committed projections with `pnpm build:guidance && pnpm build:agents` (ADR-0307 D1/D2).
- **`stories/uat-criterion-detail/story-author-detail-authority.md`** — its justification is
  re-grounded on the library-edit ceremony and this ADR. The claim that Bash is absent from a spawn
  tool surface is struck: that surface was retired by ADR-0175 and the sentence asserts a live
  invariant that is not live.

`packages/uat-criterion/src/story-author-scope.ts` needs no change. Narrowing to `stories/**` was
right, and stays right: the detail half is out of any file fence's reach by construction.

### D4 — The envelope convention is part of the grant

A detail artifact is not a bare body. New docs go through `upcastAndValidate` — a raw upsert writes
an envelope-less row, the failure ADR-0307 D5's migration had to avoid across 52 creates. The house
convention the 74 live rows use, and which this grant carries:

- `title` is the artifact **id** (`<story>#uat-<n>`), never a display title — the story owns the
  canonical one-line title (ADR-0209 D6).
- `description` is a one-line summary of the body's `action`.
- The `uatc_` criterion identity is immutable and is carried, never regenerated.

## Consequences

**Good.**

- ADR-0209 D5 is true in full again. The clause the corpus twice chose to preserve now has authority
  behind it, instead of naming an owner who was forbidden to act.
- The criterion↔detail pair has one author again. `edit-story-uat-criteria` measured the cost of not
  having one: 68 well-formed `(detail:)` pointers against 74 live artifacts — 1 dangling pointer and
  7 orphans, "all of it pre-existing drift that no gate had ever named".
- The next session to author a detailed UAT criterion follows a documented path instead of
  rediscovering the contradiction.

**Bad, and accepted.**

- `story-author` is no longer strictly least-authority. It reverses the direction of the 2026-07-10
  provenance correction that removed its DB-write guidance — narrowly, for one kind, and for the
  documented reason that the medium moved underneath it, but the direction is reversed and that is
  worth seeing plainly.
- The kind fence is prose. An agent that ignores it is refused by nothing (D2).
- `story-author` now needs a shell verb, which the harness subagent already has. Anyone who later
  re-wires a Bash-free spawned runtime for it must supply a `--pg` affordance in the same change, or
  this grant becomes unexercisable and D1 silently regresses to the gap this ADR closed.

**Neutral.**

- Nothing about the gate, proof, or verdict path changes. A detail artifact is knowledge, not a work
  unit; authoring one signs nothing.

## References

- [ADR-0209](0209-tier-model-judged-uat-below-irreducible-human-witness.md) — **amended**: D5's
  ownership clause gains the authority it names. D5's substance untouched.
- [ADR-0307](0307-the-agent-tier-goes-live-canonical-the-committed-seed-stops.md) — **amended**: its
  D5 moved the medium and narrowed the file fence; this supplies the missing half, who writes the
  new medium.
- [ADR-0175](0175-repurpose-don-t-delete-the-in-app-orchestrator-chat-infrastr.md) — retired the
  spawn tool surface, including the `spawn_story_author` caller, and keeps `runSpawnWriteScoped`
  deliberately caller-less. The reason the "no Bash" fence is not available as an objection.
- [ADR-0284](0284-the-write-authority-wall-stays-static-worktree-to-worktree-i.md) — the precedent
  for an instruction-only fence: Bash is unbound by the wall, and a write past it is still a
  violation.
- [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md) — why D3 corrects
  the disagreeing surfaces in place rather than superseding them.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — why this ADR is born
  `accepted`.
- `stories/uat-criterion-detail/story-author-detail-authority.md` — the owning capability; its
  guidance is re-grounded by D3.
- `storytree library artifact edit-story-uat-criteria --pg` — the ceremony for the criterion half,
  including the `(detail:)` pointer rules and the measured drift.
- `packages/uat-criterion/src/story-author-scope.ts` — the file fence, unchanged by this ADR.
