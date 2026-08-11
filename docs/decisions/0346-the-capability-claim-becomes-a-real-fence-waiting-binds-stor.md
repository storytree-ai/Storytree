---
status: accepted
decided: 2026-08-11
arc: capability-claim-binds-arc
amends: [138, 200, 270]
load_bearing: true
---
# ADR-0346: The capability claim becomes a real fence: waiting binds, story-grain session claims retire

## Status

accepted (2026-08-11) — decided/directed by the owner in conversation on 2026-08-11, in a
discussion-first session convened to ask whether the notice board is still earning its place, whether
it is redundant now that claims are taken at capability grain, and why it leans on prose. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

The owner made four load-bearing calls, each recorded as a Decision below: `waiting` should bind at
capability grain; story-grain session claims should be removed (*"i see no need for them if we have
capability level claims"*); `intent` should split into a typed role and real prose; and a blocked
session should take up another capability or *"just update the ARC and end the session"*.

**Amends** [ADR-0270](0270-the-claim-ledger-records-a-fiction-same-story-serialisation.md) — its D1
(capability grain) STANDS and is the premise this builds on; its D2 (*"proceeds or re-plans on its
own judgment"*) is reversed by D1 here, and the option (a) it rejected is taken at the narrower grain.
**Amends** [ADR-0200](0200-the-noticeboard-is-the-claim-ledger-forced-session-claims-pr.md) — the one
ledger, the three grades and the per-`(unit_id, session_id)` row all stand; what changes is that
`waiting` acquires the meaning its Status prose always claimed (*"push all other sessions to wait in
line"*), and D2's free-prose `intent` splits. **Amends**
[ADR-0138](0138-the-wisp-is-a-forced-ci-cleared-story-claim-one-coordination.md) — its Decision 2
serialisation is restored, at capability rather than story grain; its Decision 5 honesty wall (a claim
is never a proof) is untouched and remains binding.

## Context

**What ADR-0270 decided, and why it is being re-opened.** On 2026-07-30 the owner was given a fork:
(a) enforce the serialisation ADR-0138/0200 had accepted — make `waiting` actually wait — or
(b) move the session ceremony to capability grain. The owner took (b) and rejected (a) explicitly,
because at story grain enforced waiting meant one session per `cli` or per `library`, which would have
idled the factory at 6–7 concurrent sessions. ADR-0270 D2 then wrote the workaround into the
orchestrator guidance: a refused session takes the `waiting` claim and *"proceeds or re-plans on its
own judgment"*.

That decision worked. It is being re-opened because **the grain it was decided under no longer
holds**. Option (a) was rejected as a story-wide fence; at capability grain the same rule fences one
capability, and siblings never contend. It is a materially different proposition wearing the same name.

**Measured 2026-08-11 against the live store** (`storytree noticeboard history`, whole log = 2294
`events.claim_event` rows; the 12-day window is the post-ADR-0270 period):

- **Capability grain is adopted.** Of the 300 most recent hold spans (2026-08-03 → 2026-08-10),
  **244 (81%) claim a non-story id**; 56 (19%) are still story-grain. ADR-0270's migration landed.
- **The fence it bought is real but small.** 443 claims and **16 refusals** in 12 days. Only **3
  `queued`** and 5 `promoted` events in the same window — the queue apparatus fires about once every
  four days.
- **Refusals carry nothing to act on.** **15 of those 16 refusals** name a holder whose `intent` is
  the literal string `"orchestrate"`.
- **Because the highest-volume writer discards its own prose.** `noticeboard declare` requires a
  non-blank `--working-on` (`packages/drive/src/noticeboard.ts:273`), echoes it into the envelope
  (`:390`), and then takes the claim through `workClaimRequest({kind: "orchestrate"})` (`:331`), which
  stamps `intent: "orchestrate"` and drops the prose on the floor. Across all 1285 hold spans in the
  log the column reads `"orchestrate"` 708 times (55%), `"real"`/`"story:real"` 274 times (21%), and
  carries actual human prose only ~303 times (24%) — all of it from `worktree create --intent` or
  `noticeboard claim --intent`, which do pass it through
  (`packages/cli/src/worktree-create.ts:382`).
- **The column is already serving two incompatible readers.** The studio map switch-cases it as a
  six-value enum for the wisp colour (`apps/studio/src/lib/claimColour.ts:26` —
  `edit|real|orchestrate|authoring|proving|supplementing`, everything else falling through to
  `supplementing`), while ADR-0270 D3 item 2 made it prose a refused session reads to judge
  disjointness. Neither reader is served: the enum reader sees prose it cannot classify, and the prose
  reader sees a constant.

So ADR-0270's own fork-independent honesty remedy — *"a refusal prints the unit's full claim board, so
disjointness is read from the ledger, not hand-inspected from an unpushed branch"* — is defeated by
the field it rests on. ADR-0270 described the holder's intent as *"frequently the bare default"*; for
declare-taken work claims it is always.

**Story grain has already been abandoned by the code.** `packages/drive/src/story-build.ts:637-651`
records that the story chain claims **the members it is about to write**, all-or-nothing, and names
the earlier behaviour — *"the chain held `story.id` INSTEAD OF its members"* — as the defect it fixed.
`story.id` is still claimed in exactly one case: *"a `uat_witness: machine` story whose UAT node is IN
`driveOrder`"*, i.e. where the story id names a real unit of work rather than a fence around unscoped
work. The build path reached the answer this ADR now applies to the session ceremony.

**A session already works many units.** The exclusivity index is on `unit_id WHERE grade='work'` — one
work-holder per unit, with no cap on units per session (ADR-0200 D2: *"A session may hold any number
of claims at any grade … never a hard cap"*). Measured: sessions commonly claim 8–13 distinct units
over their life (`strange-hermann-5961fc`: 13), and CONCURRENT multi-unit holds are directly
evidenced — `dazzling-edison-ff1f51` held `library-health-gate` and
`library-schema-and-write-validation` at the same time on 2026-08-08, refusing two different sessions
21 minutes apart; `recursing-leakey-c4f8d5` opened claims on `library` and
`proposals-fold-into-arcs-arc` in the same minute; `cli-56d520` currently holds rows on both `cli` and
`drive-machinery`. This is what makes D4 affordable — a blocked session usually has other claimed work
to turn to. (The lifetime count is not itself a concurrency figure; the named overlaps are.)

**One honesty defect surfaced in the same window** and is recorded here because D1 makes it
load-bearing rather than cosmetic. `storytree noticeboard --pg` printed *"No live claims on the
ledger."* while `noticeboard claims forest-world --pg` printed a live-looking `[exploring]` row aged
**554h** and `noticeboard claims cli --pg` one aged **48h**. The board's read is stale-filtered in SQL
(`listLiveClaims`, `packages/notice-board/src/store/claim-store.ts:605`); the per-unit read
(`claimsFor`, `:584`) applies no filter at all, and neither surface says the word "stale". Filed as
friction `the-board-says-no-live-claims-while-the-unit-view-shows-them`.

## Decision

**D1 — `waiting` binds, at capability grain.** A session refused the `work` claim on a unit takes the
`waiting` claim and **stops working that unit**; it is promoted when the holder releases (the atomic
oldest-live-waiter promotion ADR-0200 D2 already built). This takes the option ADR-0270 rejected, at
the narrower grain that ADR-0270's own D1 created. Sibling capabilities never contend, so the fence
binds only on a genuine same-unit collision — 16 events per 12 days at current concurrency.
ADR-0270 D2's *"proceeds on its own judgment"* is withdrawn: proceeding past a refusal is no longer
the affordance the tool offers, and the orchestrator guidance changes with it. What ADR-0270 D2 got
right and this preserves: **a claim conflict is still never an owner question.**

**D2 — Story-grain session claims retire.** The session ceremony claims the **capability** it is
writing; a session writing several claims several. A session with no capability to name claims the
**increment id it is driving** (ADR-0308 D5, unchanged). A `work` claim is no longer taken on a story
id as a fence around unscoped work.

The story **tier** stays claimable, because it sometimes names real work: the `uat_witness: machine`
story UAT node, which `story build` already claims alongside its members. That is a unit, not a fence,
and it needs no exception.

This is what makes containment unnecessary. The ledger keys claims by string and knows no containment
(stated in `noticeboard.ts:400`), so today a session holding story `library` does not contend with one
holding `library-health-gate` inside it — under D1 that would be the obvious way around the fence. D2
closes it by removing the move, rather than by teaching the ledger the work hierarchy. **Containment
is deliberately NOT built.** If story-grain `work` claims reappear in the measured log after this
lands, revisit containment; do not pre-build it.

**D3 — `intent` splits into a typed `role` and prose `intent`.** `role` is the enum the map already
reads for the wisp colour (`authoring` / `proving` / `supplementing`); `intent` is free prose
describing what the holder is actually doing, and `declare --working-on` writes it through instead of
discarding it. A refusal names the holder, its role, its prose, and its age — enough for a blocked
session to choose between queueing and turning to other work.

`scope` (the paths or units a holder is touching) is **considered and not taken now**. Under D1 a
blocked session may not argue its way past the fence, so scope stops being a bypass; its remaining
value is as evidence that a capability boundary is drawn too coarse, which is a story-author question.
Add it if repeated same-capability blocks show up in the log.

**D4 — A blocked session works another capability, or lands its residue on the arc and ENDS.** It does
not idle waiting for promotion. Since a session already holds 8–13 units, the first branch is usually
available. When it is not, the session writes what it was attempting and what remains onto the owning
arc, releases its claims, and ends — the ADR-0303 posture (escalating is a landing, never a pause)
applied to contention, and for the same reason: a dormant holder is the one claim contention the
ledger cannot resolve.

The owner's rationale, recorded because it is not derivable from the code: a session held open across
a block loses the prompt-cache window, so **resuming it later pays full price for the whole
context** — where a fresh session picks the work up from the arc. The counterweight is accepted
knowingly: ADR-0329 D1 measures a fresh session's orientation at ~17–18 turns and ~$2.60–3.10, so
ending is not free; the owner's call is that it beats holding a blocked session open.

## Consequences

**Good.** The mechanism and the record agree again — `waiting` means waiting, which is what ADR-0200's
Status prose said and ADR-0270 D3 item 3 had to correct in place. The claim stops being a coordination
device that coordinates nothing: the duplicate-write hole ADR-0121 opened the ledger to close is
actually closed at the grain sessions now work at. The refusal becomes actionable rather than an
uninformative stop sign, which is what made the previous fence get routed around. And D2 removes the
last grain that could fence work nobody had scoped, so the wisp on the map lands on the capability
actually being grown.

**Bad / accepted.**
- This re-opens a question ADR-0270 settled deliberately, nine days after it landed. That is a second
  cost in owner attention on the same fork, paid knowingly and recorded here. The justification is
  narrow and stated: the grain changed underneath the rejection.
- **The stale-row defect becomes load-bearing.** While nothing blocks, a ghost row costs a session a
  wrong read. Under D1 a session could be fenced out by a holder that has been silent for 554 hours.
  The reclaim predicate already exists (`isReclaimable`, 2h heartbeat), but the two surfaces disagree
  about which rows are live and neither says "stale" — so a refusal must state whether the holder is
  live or reclaimable before D1 can be trusted. **This is companion work to D1, not a follow-up.**
- Binding reintroduces a real cost when a capability is drawn too coarse for two sessions that
  genuinely do not overlap. D4 absorbs it (work elsewhere, or land and end) rather than removing it;
  D3's deferred `scope` is the instrument that would show it, if it shows up.
- Sessions must know their capability up front more often than before, since the story-grain fallback
  is gone. ADR-0270 D1 already accepted this cost; D2 removes the escape hatch that softened it. The
  increment-id claim (ADR-0308 D5) remains the answer for work with no capability to name.

## References

- [ADR-0270](0270-the-claim-ledger-records-a-fiction-same-story-serialisation.md) — capability grain
  (D1, stands, and is the premise here); "queue, don't ask" (D2, reversed by D1); the rejected option
  (a), taken here at the narrower grain; the D3 honesty remedy this ADR finds defeated by `intent`.
- [ADR-0200](0200-the-noticeboard-is-the-claim-ledger-forced-session-claims-pr.md) — the one ledger,
  the three grades, the per-`(unit_id, session_id)` row, the no-cap-per-session rule, and the "wait in
  line" Status prose that D1 finally makes true.
- [ADR-0138](0138-the-wisp-is-a-forced-ci-cleared-story-claim-one-coordination.md) — story grain as the
  deliberate call and its accepted serialisation; Decision 5's honesty wall, untouched.
- [ADR-0308](0308-increments-form-a-dag-and-carry-their-own-claim-set-depends.md) D5 — the increment-id
  claim, the answer for work with no capability to name.
- [ADR-0303](0303-an-escalation-is-a-landing-event-a-blocked-session-lands-its.md) — escalating is a
  landing, never a pause; D4 applies the same posture to contention.
- [ADR-0329](0329-a-small-unit-is-driven-in-thread-not-cut-into-a-fresh-sessio.md) D1 — the measured
  fresh-session orientation cost, the counterweight D4 accepts.
- `packages/drive/src/noticeboard.ts` — `declare` validating and discarding `--working-on` (:273, :390,
  :331); the no-containment note (:400).
- `packages/cli/src/worktree-create.ts:382` — the one path that does write real intent prose.
- `apps/studio/src/lib/claimColour.ts:26` — the enum reader of the same column.
- `packages/drive/src/story-build.ts:637-651` — the build path already claiming members over `story.id`.
- `packages/notice-board/src/store/claim-store.ts` — `listLiveClaims` (:605, stale-filtered) vs
  `claimsFor` (:584, unfiltered).
- Friction `the-board-says-no-live-claims-while-the-unit-view-shows-them` — the honesty defect D1 makes
  load-bearing.
