---
status: accepted
decided: 2026-07-30
load_bearing: true
amends: [138, 200]
---
# ADR-0270: The claim ledger records a fiction: same-story serialisation is routed around, not paid

## Status

accepted (2026-07-30) — drafted earlier the same day as an owner-reserved fork (the owner directed
that it be DRAFTED, not which way it resolves; raised by the friction adjudication of 2026-07-29/30,
where `story-work-claim-refuses-disjoint-file-concurrency` was routed `adr` with its alignment check
complete and the draft deliberately withheld). **Resolved the same day: the owner picked option (b),
capability grain, in conversation** (design-time alignment IS ratification, ADR-0110), directing in
the same exchange that sessions should merge to trunk rather than sit behind claims waiting for a
reply — which is also an explicit rejection of option (a)'s enforced idling. The pick followed a
3-day factory audit (2026-07-30) that measured the story-grain cost directly: 13 real claim
conflicts in the window, 9 of them on the `cli` story where every gate check lives, and 378 of 386
AskUserQuestion-minutes spent escalating claim/coordination forks to an owner who was asleep — one
of them against a holder session that had been dead for 2.4 hours.

## Context

**What we decided.** ADR-0138 chose story grain deliberately and named its price in Decision 2 ("Hard
refuse, story grain"): *"capability grain is the named scale-up path"*, with the accepted cost that
same-story work serialises. ADR-0200 restated it when it made the noticeboard the claim ledger, under
Consequences → "Bad / accepted" — *"Same-story work still serialises (ADR-0138's accepted cost); the
queue makes waiting legible rather than removing it. Capability-grain claims remain the named
scale-up"* — while its Status prose says work claims *"push all other sessions to wait in line"*.

**What actually happens.** A session refused the `work` claim takes a `waiting` claim and builds
immediately, in parallel, as normal practice. This is not an abuse of the tool; it is the affordance
the tool offers, reached by sessions acting in good faith. **Three** occurrences are recorded on the
friction item — the original filing plus two reinforcements — all on the `cli` node, involving four
distinct sessions refused or working around (`keen-feynman-4ec064`, `sweet-swanson-3ea10b`,
`upbeat-kowalevski-771a11`, `serene-meitner-ab9fce`). The count is stated precisely because an
adjacent item in the same drain was found to have inflated its own recurrence figure by counting one
occurrence twice.

The second occurrence is the structurally telling one: a session reached the same manual disjointness
argument and the same waiting-grade workaround *unprompted*, and wrote it into its own claim intent —
so the workaround is not one session's idiosyncrasy but what the affordance produces. By the third,
the ledger showed three sessions on `cli` at once: one work holder and two in a waiting queue that
neither was waiting in, both actively building and landing PRs.

**Why nothing stops them.** Verified against current `main`, not inferred:

- `packages/cli/src/check-declared.ts:79` branches solely on `input.claims.length > 0` and reads no
  `grade` field. Its own header states *"Any grade counts"*. So `waiting` satisfies the
  merge-ceremony gate exactly as `work` does — the ADR-0200 D3 fence is a fence against having no
  claim, never against having the wrong one.
- The `waiting` arm in `packages/drive/src/noticeboard-claims.ts` takes the claim with **no check
  that a `work` claim is held on the unit at all**.
- `queuePosition` (same file, ~:101-110) filters `claimsFor(unitId)` down to rows whose grade is
  `waiting` and reports the caller's index within *that* list. A lone waiter therefore always renders
  `position 1 of 1 in the line` whether or not anything blocks it — the queue length counts fellow
  waiters, never the holder.
- A refusal carries no overlap information. The holder's declared intent is frequently the bare
  default `"orchestrate"`, which names no files. Establishing that two sessions were disjoint cost
  four tool calls of hand-inspecting another session's *unpushed* branch — work the ledger exists to
  make unnecessary. In every recorded instance the work genuinely was disjoint and landed without
  conflict.

**Why this is more than an ergonomics complaint.** The ledger the map and the dock render now carries
rows that are false in a specific way: they say a session is *queued* while it is building and
opening a PR. That is the failure class `verification-integrity-arc` exists to fence — a record whose
green state does not correspond to what it describes — and it sits directly against the non-negotiable
honesty wall in ADR-0138's own Decision 5: *"a claim's presence or colour is **never** a proof"*. An
accepted decision has stopped describing reality, and the gap is being absorbed by hand rather than
surfaced.

**What is *not* the obstacle.** Finer-grain claim machinery already exists and is already enforcing.
ADR-0121 D2 decided per-unit granularity across story / capability / contract, and
`packages/drive/src/node-build.ts` implements it: its per-unit write-claim seam is documented as
*"the ENFORCING half of the claim ledger (ADR-0200)"*, acquiring and releasing the claim keyed to
`spec.id`. Story grain is therefore a convention of the **session ceremony** (`noticeboard declare
--node`), not a technical ceiling in the substrate. Option (b) below is wiring on machinery that
already ships, not new substrate — which materially changes its cost relative to how the friction was
originally framed.

**One honesty gap inside the record itself.** ADR-0200's Status prose — work claims *"push all other
sessions to wait in line"* — reads stronger than what is actually enforced, and stronger than
ADR-0138 §5's own wall. That sentence needed to match the mechanism under every option on the fork,
which is why D3 is fork-independent; D3 item 3 corrects it in place in this landing.

**Provenance correction.** The originating friction item cited the `claim` definition as already
recording this as open. That citation did not hold: the quoted sentence exists nowhere in the corpus,
and the live `claim` definition says the opposite (granularity is decided, per `(unit, session)`).
The stale framing was traced to `docs/open-questions.md` §3, which still listed (b) claim granularity
and (c) the conflict-resolution ceremony as "Still open" after ADR-0121 answered them. That file was
corrected on 2026-07-30 (PR #1021) and now carries the resolution arrow, so this ADR does **not** rest
on an open question — it re-opens a **decided** one, deliberately, under copy-on-write.

## Decision

**D1 — The session ceremony moves to capability grain (option b), the scale-up both ADR-0138 and
ADR-0200 pre-name.** A session declares/claims the **capability it is actually writing** when it
knows it (`noticeboard declare --node <capability-id>` / `claim <capability-id>` /
`worktree create --node <capability-id>`), reusing the per-unit machinery ADR-0121 already built —
the ledger and the map
all already accept any unit id; this is a ceremony change, not substrate.
*(Corrected in place 2026-08-06 per ADR-0139; D1 is unchanged — capability-grain claims still need no
substrate change, and that is the load-bearing claim here. The list read "the ledger, the gate
(`check:declared` is grade- and tier-blind and needs no change), and the map". ADR-0311 D2 retired
`check:declared` from root/CI policy, so there is no gate in the list to be grain-blind; the ledger and
map carry the property on their own.)* **Story grain remains
legitimate** for cross-capability work and for sessions that do not yet know their unit — and a
story-grain claim then means what ADR-0138 said it means: same-story siblings queue or negotiate.
The migration is pull-based (ADR-0192 style): sessions adopt capability grain at their next declare;
no register rewrite, no big-bang.

(**Amended 2026-08-04 — [ADR-0308](0308-increments-form-a-dag-and-carry-their-own-claim-set-depends.md)
D5:** a THIRD case joins the two above, for work that has no capability to name at all — greenfield
(the capability does not exist yet), planning, ADR authoring, and arc landings. Such a session claims
**the increment id it is driving**. Capability grain remains the default and story grain remains
legitimate exactly where this clause says; what changes is that "the capability it is actually
writing" no longer has to be stretched when there is none. The unit-id blindness this clause records
as sufficient for capabilities is what makes the third case free of substrate change too. Measured
cause: PR #1142 touched four ADR files and no code, and — because ADR-0200 D3 fails an unclaimed
session — declared on a capability it never wrote, blocking anyone who needed it.)

**D2 — Queue, don't ask.** A session refused a claim held by a live sibling takes the ADR-0200 D2
`waiting` claim (or narrows to a disjoint capability and claims that) and **proceeds or re-plans on
its own judgment — it never escalates a claim conflict to the owner when the corpus already answers
it**. Escalation is for genuine same-surface overlap that no narrowing resolves. This is encoded in
the session-orchestrator guidance in the same landing (the measured cost of the old behaviour: 211
minutes of one night asking an absent owner a question the ledger could answer, 147 of them behind a
dead holder).

**Options weighed and not taken.**

**(a) Enforce the serialisation ADR-0138/0200 accepted** — make `waiting` actually wait (refuse the
merge ceremony without a work claim). Rejected by the owner explicitly: it recreates enforced idling
at today's concurrency (6–7 sessions), and the measured window shows the serialisation was already
being routed around at zero conflict cost — the record was wrong, not the parallelism.

**(b) Capability grain** — **taken** (D1). Cost accepted knowingly: the declaring session must know
its unit up front (mitigated: story grain stays legal, and a session can narrow later by releasing
the story claim and claiming the capability), and cross-capability edits keep the story-grain answer.

**(c) An honest "building, disjoint from holder" grade** — not taken as a grade: it would turn the
claim from a mutual-exclusion device into a disclosure device and weaken what a claim means
(ADR-0138's coordination guarantee). Its honest kernel — disclosure — lands as remedy item 2 below
instead: the refusal now prints the unit's full claim board, so disjointness is read from the
ledger, not hand-inspected from an unpushed branch.

**D3 — The fork-independent honesty remedy lands WITH this ADR** (same landing, since it is correct
under every option and was the majority of the measured cost):

1. `waiting` stops lying — no queue position is rendered when no `work` claim is held on the unit;
   the message says plainly that nothing blocks you.
2. A refusal prints the holder and the unit's full claim board (grade, session, age, branch, intent),
   so disjointness is machine-readable at the refusal site.
3. ADR-0200's "wait in line" Status prose is corrected in place to match the mechanism (ADR-0139:
   removing overtaken prose is an in-place correction, not a supersede).

Items 1 and 2 are the narrow `tool` work in `packages/drive/src/noticeboard-claims.ts` (under the
`notice-board` story's `noticeboard-cli` capability, whose proof scope covers the file); item 3 is
librarian curation. None of them re-decides the grain.

## Consequences

**Good.** The declared grain now matches the written grain, so most of yesterday's collisions never
happen (9 of the 13 measured conflicts were sessions sharing the `cli` story while writing disjoint
capabilities); a refusal site now carries everything needed to decide disjointness without
hand-inspecting branches; and the ledger stops rendering building sessions as queued. The map gets
more informative, not less: wisps land on the capability actually being grown.

**Bad / accepted.** This re-opened and re-decided a question ADR-0138 settled deliberately — a cost
in owner attention, paid once and recorded here. Capability-grain claims mean a story's wisp count
no longer equals its session count (render implications belong to the map, ADR-0138's story realises
them). Sessions that stay at story grain keep ADR-0138's serialisation cost knowingly — that is now
a choice, not a default trap.

**Why the remedy rides this landing rather than a route.** This trap was routed to capability work
once before and nothing was built. `art-factory-work-claim-exclusive-blocks-independent-subunits` —
the same exclusivity at story grain, on a different story — was filed 2026-07-21 and routed `tool`;
no capability was ever authored for it. The trap then resurfaced as an entirely new item (this ADR's
originator) because a `tool`-routed item carries no signal that its capability never landed. D3
therefore lands in the same PR as the decision, under the `noticeboard-cli` capability that already
owns the file — not as a route to future work.

**Not settled here.** Whether code edits still use a git worktree per node (`docs/open-questions.md`
§3(a), reframed by ADR-0012) is untouched. Cross-capability and cross-package edits keep the
story-grain answer under D1. The map's rendering of capability-grain wisps (one wisp per claimed
capability vs. rolled up to the story) is the wisp story's call, not decided here. And the friction
queue's own missing mutex — two adjudicator seats can overwrite each other's routing with no conflict
surfaced — is a separate concern, routed `tool` under
`friction-queue-has-no-claim-so-adjudicator-seats-race` so the two do not collide.

## References

- [ADR-0138](0138-the-wisp-is-a-forced-ci-cleared-story-claim-one-coordination.md) — story grain as
  the deliberate call; the accepted serialisation cost; "capability grain is the named scale-up path"
  (Decision 2, restated in Consequences); the honesty wall in Decision 5. **Amended** by D1, which
  takes that named scale-up path; the rest of ADR-0138 stands in full.
- [ADR-0200](0200-the-noticeboard-is-the-claim-ledger-forced-session-claims-pr.md) — the noticeboard
  IS the claim ledger; three grades; per-`(unit_id, session_id)` rows (its D2 heading glossed these as
  "per-(story, session)" until this landing); Consequences → "Bad / accepted" restating the cost; the
  "wait in line" Status prose. **Amended** by D1; its two overtaken prose spots and that row-key gloss
  are corrected in place under D3 item 3, per ADR-0139.
- [ADR-0121](0121-per-unit-write-claim-refuses-a-second-concurrent-build-of-on.md) — per-unit
  granularity (story / capability / contract), decided and built; the machinery option (b) reuses.
  Not amended: it already answers the build surface.
- [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md) — why the ADR-0200
  prose fix is an in-place correction rather than a supersede.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — why this ADR lands
  accepted: the owner picked (b) in conversation on 2026-07-30, with the audit evidence in front
  of them.
- `packages/cli/src/check-declared.ts` — the gate that accepts any grade.
- `packages/drive/src/noticeboard-claims.ts` — the unguarded `waiting` arm and `queuePosition`.
- `packages/drive/src/node-build.ts` — the per-unit write-claim seam already enforcing at `spec.id`.
- Friction `story-work-claim-refuses-disjoint-file-concurrency` — the originating item, its two
  reinforcements, and the completed alignment check in its `routeReason`.
- Friction `art-factory-work-claim-exclusive-blocks-independent-subunits` — the same trap at story
  grain on a different story, filed 2026-07-21 and routed `tool` with nothing built since.
