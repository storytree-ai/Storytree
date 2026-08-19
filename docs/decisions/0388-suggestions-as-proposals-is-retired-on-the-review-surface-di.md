---
status: accepted
decided: 2026-08-14
arc: uat-journey-surgery-arc
amends: [140, 146]
---
# ADR-0388: Suggestions-as-proposals is retired on the review surface — direct CriticMarkup editing is the answer

## Status

accepted (2026-08-14) — decided/directed by the owner in conversation on 2026-08-14, answering the
open question `oq-did-adr-0146-s-pivot-retire-suggestions-as-proposals-or-i` (since retired). Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask. Amends ADR-0140 (whose
suggestion-record model this retires on this surface) and ADR-0146 (which began the narrowing without
saying so).

## Context

**ADR-0146 did not merely refine ADR-0140. It NARROWED it, and neither ADR said so — which is the
defect this decision exists to close.**

ADR-0140 decided *what* Library Review mode is. Three of its clauses were promises about a
**propose-accept cycle**:

- a suggestion is a **separate record** from a comment, with a status (`open` / `accepted` /
  `rejected`), an author and a proposed replacement;
- a suggested change **renders the proposed RESULT by default**, with the original collapsed behind a
  "show change" toggle — and explicitly **NO strikethrough**, a deliberate departure from
  Google-Docs-style struck-out text the owner dislikes;
- the owner/admin **accepts** (applying the edit through the admin asset-write path) or **rejects**;
  re-deciding a closed suggestion is refused; members propose but cannot decide.

ADR-0146 then settled *how you author*, and chose a split-pane markdown editor with **CriticMarkup**
tracking. It described itself as settling an interaction ADR-0140 left open, and said the caps-6–8
data proofs "stand and are reused". Read carefully, its own §3 and §4 had already replaced the model:
tracked changes live **inline in the document's markdown**, and §4's *"everyone suggests … no role
branch in the editor"* removes the member/owner split from the surface entirely. Its Consequences even
left the question open in writing — *"whether the CriticMarkup lives inline in the body until resolved
or as separate suggestion records rendered as an overlay is an implementation choice to settle when
persistence is wired"*.

That open point was never settled, and the gap was invisible for thirteen months of prose because
nothing forced the two ADRs to be read against the running app. **ADR-0348 D1 forced it.** Flipping
`library-review`'s five UAT legs to `machine` and driving them against the real running studio on
2026-08-12 returned **1 pass, 4 fails**, with a single root cause: `AssetView.tsx` mounts only
`ReviewToggle` + `ReviewEditor`, and `ReviewEditor` never reads the comment or suggestion store at all.
Every component that talks to this story's backend — `InlineCommentThread.tsx`, `SuggestionView.tsx`,
`ReviewBlocks.tsx` — is imported by nothing but its own test. Leg 8 was the cleanest evidence: a real
`POST /api/comments` was correctly returned by `GET /api/review/feed` and never rendered, not after
35 s and not after a full manual reload.

So **nine capabilities held genuine signed `--real` verdicts at the capability rung while the
story-rung journey did not exist end to end, and no gate anywhere said so.** The drive left those legs
deliberately RED and raised the fork rather than answering it, because re-authoring criteria to match
what shipped is precisely the move ADR-0294 exists to prevent, and the criteria were the older
owner-approved claim. The fork: **did ADR-0146's pivot NARROW the promise, or leave it UNBUILT?**

Only the owner could answer that, because it is a question about what was promised, not about what is
true of the code. The two answers have opposite costs: *unbuilt* owes a build — wire the suggestion
flow into `ReviewEditor` — while *narrowed* owes only the truth.

The owner answered on 2026-08-14: **narrowed.** Direct CriticMarkup editing IS the answer, and it has
been fine in use.

## Decision

**Suggestions-as-proposals is RETIRED on the Review surface. Direct CriticMarkup editing is the
answer.** Concretely:

1. **The propose-accept cycle is not owed.** ADR-0140's suggestion-record model — the separate `open` /
   `accepted` / `rejected` record, the proposed-result-by-default rendering with the original collapsed
   behind "show change", the no-strikethrough rule, the accept/reject transitions and the member/owner
   split across them — is retired **on this surface**. It is not a deferred obligation, not a follow-on
   somebody owes, and not a bug. Nothing is expected to build it.

2. **ADR-0146 NARROWED ADR-0140; that is now recorded rather than inferred.** This is the clause the
   decision log was missing. ADR-0146's `amends: [140]` edge was correct but its body described only a
   refinement, so a reader of either ADR could not see that a promise had been dropped. ADR-0146 is
   corrected in place to say so plainly (ADR-0139: the decision ADR-0146 recorded did not change, only
   its incomplete account of its own effect), and this ADR carries the `amends` edge for the part that
   IS a re-decision.

3. **ADR-0140's body is NOT rewritten.** Under ADR-0139 a partial reversal of a still-current ADR is an
   `amends` edge, never a silent edit to the amended body and never a `supersedes` — ADR-0140's other
   clauses (block-position anchoring, the clean removal of text-selection anchoring, no-real-time,
   the no-new-role rule) all stand. The decision changed, so it is RECORDED, not corrected away. A
   reader of ADR-0140 sees `amended by 0146, 0388` and comes here.

4. **The machinery is KEPT, not deleted.** `suggestion-edit-store`, `accept-reject-suggestion-api` and
   `member-suggest-write-policy` are proven code carrying real signed `--real` verdicts. The owner may
   pick the propose-accept cycle up much later, and a revival should start from working, proven code
   rather than from scratch. Deleting them would convert a cheap future decision into an expensive one.

5. **But they may not read as LIVE.** Each carries an explicit **BUILT · UNREACHED · PARKED**
   disposition on its own spec, naming ADR-0388, stating that no shipped surface calls it and that its
   verdict remains a true statement about its own behaviour. "Proven" and "reached" are different
   claims and the corpus now says which is which.

6. **The `library-review` UAT legs claim what the surface does.** Legs 2, 4 and 7 and the story's
   outcome sentence are re-authored to the CriticMarkup journey — a `{>>…<<}` comment rendered inline
   in the document flow, a tracked change rendered beside the prose, and a Save that states plainly
   what it did with the annotated body. **This is the one case where re-authoring criteria to match
   what shipped is legitimate**, and only because an owner re-decided the promise: absent that, the
   ADR-0294 prohibition binds. The criterion ids are positional and were edited in place, never
   renumbered; each re-authored leg's content-bound `revision-id` was recomputed with the superseded
   value recorded, so no signed drive verdict is carried onto a changed claim.

7. **Leg 8 is NOT covered by this decision.** The live-refresh promise — a comment posted out of band
   appearing without a reload — was ADR-0140's and ADR-0146 did not touch it. It remains a genuine
   unbuilt claim and its red stands. Retiring the propose-accept cycle does not quietly retire the
   refresh model with it.

## Consequences

- **The story's promise shrinks to something true and walkable.** `library-review` now claims an
  annotation surface — comments and tracked changes in the document's own markdown, rendered in the
  flow — rather than a collaboration workflow. That is a smaller claim, honestly held, and the flower
  on the map means what ADR-0294 says it means.
- **The shipped preview strikes deletions through, which ADR-0140 explicitly forbade.**
  `.cm-del { text-decoration: line-through }` in `apps/studio/src/index.css`, and a substitution renders
  `<del>old</del><ins>new</ins>` — both halves at once, no collapse. This is the sharpest evidence that
  ADR-0146 narrowed rather than refined: it did not merely change how you author a proposal, it
  inverted a rendering rule ADR-0140 had called out as a deliberate departure. **If the owner still
  dislikes struck-out text, that is a live appearance question against the shipped editor** — worth
  raising on its own, not folded into this retirement.
- **Three capabilities are proven, retained and unreached.** That is an unusual state and it is
  deliberate. The risk being accepted knowingly: parked code rots — its tests keep passing while the
  surface it was written against moves under it, so a revival may find the seams no longer fit. The
  alternative (delete now, rebuild later) was rejected because the verdicts and the design thinking are
  the expensive parts and both survive in the code.
- **The `guestPolicy` module is NOT dead.** Only its suggestion-specific allowances are unreached; the
  same gate still refuses a member's hard asset edit and 401s an identity-less caller, and those rules
  are live. A future cleanup pass must not read "parked capability" as "deletable module".
- **A method generalises from this.** Flipping a story-UAT leg to `machine` and actually driving it is
  what exposed a story-rung journey that did not run while its capabilities held signed verdicts —
  twice now in three slices (this story, and `studio-build` leg 9 under ADR-0144). The drive is the
  instrument; a capability-rung verdict cannot see a story-rung hole by construction.
- **What this does not settle:** whether the propose-accept cycle is ever worth building, and on what
  surface. That is a fresh decision amending this one, with the machinery already standing.

## References

- Amends ADR-0140 (Library Review mode — the suggestion-record model this retires on this surface).
- Amends ADR-0146 (the split-pane CriticMarkup editor — the narrowing this ADR names and records).
- ADR-0139 — why a partial reversal is an `amends` edge, not a `supersedes` and not a silent edit to
  the amended body; and why ADR-0146 is corrected in place rather than superseded.
- ADR-0294 — story UAT is a journey; the prohibition on re-authoring criteria to match what shipped,
  and the owner re-decision that is the one thing which lifts it.
- ADR-0348 D1 — the `human → machine` witness flip whose drive produced the 1-pass / 4-fail measurement.
- ADR-0110 — owner-directed decisions are born `accepted` (this ADR's status).
- Story `library-review` (`stories/library-review/`) — the re-authored legs 2/4/7 + outcome sentence,
  and the PARKED dispositions on `accept-reject-suggestion-api` / `member-suggest-write-policy`.
- `apps/studio/src/components/ReviewEditor.tsx` — the shipped surface; its own header records that
  per-change accept/reject persistence "is the deliberate FOLLOW-ON; it is NOT wired here".
