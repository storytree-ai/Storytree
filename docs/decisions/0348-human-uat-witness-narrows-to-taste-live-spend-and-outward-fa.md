---
status: accepted
decided: 2026-08-11
arc: uat-journey-surgery-arc
amends: [294, 295]
---
# ADR-0348: Human UAT witness narrows to taste — live-spend and outward-facing legs default to machine

## Status

accepted (2026-08-11) — decided/directed by the owner in conversation on 2026-08-11. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends [ADR-0295](0295-the-uat-driver-s-own-verdict-is-the-witness-model-driven-uat.md)**, whose
D5 it narrows. ADR-0295's D1–D4 and D6 stand unchanged and stay accepted; its central move — the model
that drove a journey may witness it — is not weakened here but relied upon.

**Also amends [ADR-0294](0294-story-uat-is-a-journey-not-a-spec-criteria-that-duplicate-lo.md)**,
whose D3 obliged every appearance leg to be RELOCATED to the capability as `operator-attested`. D6
below replaces that obligation for these legs with deletion. ADR-0294's D1/D2/D4/D5 stand unchanged,
and D3 still governs where an appearance verdict lives *when one is worth carrying* — it is the
"every one of them must be relocated" reading that is withdrawn.

## Context

The owner's question that opened this: *"just because we have prev human uat signed rows is not a
reason to keep them human."* It was asked of `stories/agent`'s surviving UAT leg, whose own prose
already concedes the point — every clause of its success condition compiles, both leaves are
subscription-funded rather than metered, and it is left `human` **only** because flipping it would
retroactively invalidate two 2026-06-26 rows signed by the studio's placeholder `operator` identity.
The owner's answer: prior signed state is not a reason, and the label should mean what it says.

### The carve-out being narrowed contradicted a standing principle from the day it landed

ADR-0295 D5 kept three reasons for a `human` witness: genuine taste, **a live-spend decision**, and
**an outward-facing commitment**. The Library principle
`asset:human-witness-is-a-judgment-gap-not-cost` — graduated 2026-07-11 from ADR-0184 D2, and never
retired — says the opposite in its own title: *"a machine-observable success that is merely expensive,
live, or not-yet-harnessed is `machine`, witnessed by a standing or deliberate spine-signed proof —
never `human` standing in for a missing harness."* It goes further and names cost as *"the most
seductive false premise"*, because the `--real`/`--live` leaf is subscription-funded against a
maxTurns brake, not a paid meter.

So D5's live-spend clause was never consistent with the rule the corpus already ran on. This ADR
resolves the contradiction in the principle's favour, which is also the owner's stated direction.

### What the corpus actually holds

A leg-by-leg read of every story-tier `_(witness: human)_` criterion on `origin/main` @ `984fd554`
(31 legs across 10 stories; five further `website-experience` files carry human legs that are already
capability-tier `operator-attested` under ADR-0070, correctly homed and out of scope here):

| bucket | count | disposition |
| --- | --- | --- |
| **EXPERIENCE** — a look/feel property of a surface | 16 | **deleted** (D6) |
| **VALUE CALL** — an expert judgment with no compiler, not a look | 1 | stays `human` |
| **LEGACY-INERTIA** — mechanically checkable today, `human` only by history | 8 | → `machine` |
| **LIVE-SPEND** — success requires a subscription-funded run | 4 | → `machine` |
| **OUTWARD-FACING** — success is an externally-visible commitment | 2 | → `machine` |

*(The first two rows were a single 17-leg "taste" bucket in this ADR's first draft, all of it staying
`human`. The owner split it on 2026-08-11 on reading the list — see D6.)*

The eight legacy-inertia legs are `agent` leg 1, `desktop` leg 3 (an OS-keychain round-trip),
`library-review` legs 1/2/4/7/8 — whose own story text already calls their human tag *"a HARNESS
statement rather than a judgment gap"* — and `terminal-repo-picker` leg 7, where only the word
"usable" was ever taste and the dialog-opens-and-returns-a-path claim is mechanical.

The four live-spend legs are `desktop` 7, `embedded-terminal` 5, `studio-build` 9, `terminal-tabs` 4.
The two outward-facing legs are `desktop` 8 (the owner grants a brokered write path) and
`studio-build` 10 (a PR auto-merges to `main`) — both of which the factory's own merge ceremony
performs routinely and unattended every day, which is the clearest evidence that neither needs a
person standing over it to be *witnessed*.

### The finding that reorders the work: ADR-0295 D1 is decided but unbuilt

ADR-0295 D1 states that a model driving a journey headlessly or through a browser *"is such a run, and
its reported outcome is admissible as the verdict."* **No executor exists for that sentence.** Traced
on `984fd554`:

- The only two paths that write a verdict for a UAT criterion are `uatAttest`
  (`packages/cli/src/uat.ts:213`, human, `operator-attested`) and `observeAndSign`
  (`packages/orchestrator/src/proof/observe-and-sign.ts:98`), which **hard-requires** an `observe`
  gate carrying a real shell command whose exit code the spine watches (`:103`, `:115-121`, `:132`).
  There is no branch for a model's own report.
- `storytree uat` exposes only `list` and `attest` (`packages/cli/src/uat.ts:85`) — there is no
  `drive` verb.
- `packages/model-uat`, `model-uat-pilot`, `model-judged-uat` implement ADR-0209's rubric-judge tier
  machinery, which ADR-0295 D2 explicitly does **not** revive; they are un-retired leftovers on
  ADR-0247 D5's worklist, not wiring for D1.

This makes the flip **downstream of a build**, and flipping first would be actively harmful:

1. A `machine` leg with no `(proof-gate:)` binding resolves `refused`/`missing-binding`
   (`packages/library/src/witness-resolution.ts:128-137`), and **one** refused leg blocks signing for
   *every sibling machine leg in that story* — "no partial verdict"
   (`packages/drive/src/adopt.ts:254`, `:271-277`). Flipping 14 legs across 9 stories would poison
   adopt passes that sign cleanly today.
2. The `(witness: …)` tag is inside the hashed canonical content — `canonicalUatCriterionContent`
   strips only the identity tags (`packages/library/src/uat-test-criteria.ts:90`, `:189-199`), so
   editing a witness without recomputing its `revision-id` makes `parseUatTestCriteria` **throw**
   (`:208-213`), breaking `tree` / `uat list` / `adopt` / `story build` / the studio and desktop
   backends for that story.
3. A refused leg is invisible on the studio and desktop surfaces, which read `resolvedWitnessOf` and
   discard the `coverage`/`refusal` detail (`packages/library/src/witness-resolution.ts:187-193`).

### The design D1 needs already exists in this repo as a worked precedent

`drive-machinery#gate-7` solves the identical problem: a model-driven, subscription-funded,
nondeterministic run that must yield a machine witness without a gate pass ever spending money. Its
shape is two files — `dogfood-probe.run.ts` (the deliberate out-of-band run that spawns a fresh
`claude -p` and exits non-zero on a miss) and `dogfood-witness.check.ts` (the cheap, free `observe`
command that witnesses the persisted artifact). The signing path is untouched: the spine still watches
an exit code, never a model's claim.

## Decision

**D1. The `human` witness narrows to taste alone.** A UAT leg is `witness: human` only when its
success condition is a genuine judgment gap that neither a compiler nor a model driver can settle —
an aesthetic, felt, or owner value call. This restores
`asset:human-witness-is-a-judgment-gap-not-cost` as the single test, and removes the two exceptions
ADR-0295 D5 added to it.

**D2. Live spend is not a reason for a human witness.** A leg whose journey costs subscription-funded
spend is `machine`. The spend is a routine factory action, not a judgment; the principle already said
so and D5 should not have re-admitted it.

**D3. An outward-facing commitment is not a reason for a human witness.** A leg whose journey opens a
PR, merges to `main`, or grants an in-app privilege is `machine`. The merge ceremony performs these
unattended as a matter of course.

**D4. The driver proceeds on its own judgment and escalates only when it is itself unsure.**
Owner-directed, and deliberately looser than an approval gate: a model driving a UAT journey does not
stop for inline authorization before each spend or outward-facing step. It proceeds, and raises an
`open-question` (ADR-0314 D5) only when *it* is uncertain whether to continue. This is a scoped
widening of autonomy inside a UAT run and does not change `asset:human-owns-the-outer-loop` anywhere
else — in particular it does not touch
`asset:attempt-privileged-actions-approve-inline`, which continues to govern privileged actions taken
outside a UAT drive.

**D5. The flip is ordered behind the build, and the build follows the gate-7 pattern.** No leg is
flipped to `machine` before it has somewhere to earn green. The executor is authored as the existing
two-file house pattern — a deliberate out-of-band `*.run.ts` that drives the journey and exits
non-zero on failure, plus a cheap `*.check.ts` bound as the leg's `(proof-gate:)` `observe` gate —
so `observeAndSign` and the whole signing path are reused **unchanged**. No new witness kind, no
verdict a model signs for itself, and no revival of ADR-0209's rubric judge (ADR-0295 D2 holds).

**D6. A user EXPERIENCE property is not a user ACCEPTANCE criterion. The 16 appearance legs are
DELETED, not relocated and not kept as human legs.**

The owner's ruling, on reading the taste list: *"a lot of these should be removed, they are user
experience tests not user acceptance tests. Feed back on this stuff will come from me as i use the
system, this stuff doesnt have to exist in a gate atm."*

The distinction this draws is sharper than "does it have a compiler?", and it cuts BEFORE that
question rather than after it. Acceptance asks *did this journey achieve the goal it was built for*.
Experience asks *is it any good* — whether a surface reads well, feels coherent, lands the intended
mood. The second is a real and important signal, but it is **continuous owner feedback gathered
through use**, not a discrete pass/fail obligation a story must clear to be green. Blocking a story's
crown on it prices a standing conversation as a gate, and the gate then waits on a verdict nobody
was ever going to sit down and render.

So the earlier framing — *these have no compiler, therefore they are `human`* — asked the right
question of the wrong set. A no-compiler property still has to be an **acceptance** claim before its
witness matters at all. Sixteen of the seventeen are not.

**Deleted (16):** `desktop` 9, 11 · `embedded-terminal` 7 · `studio-build` 11 ·
`terminal-repo-picker` 8 · `terminal-tabs` 1, 5 · `website-experience` 3, 5, 7, 9, 11 ·
`wisp-as-story-claim` 4, 6, 8, 11.

**Retained (1):** `feedback-graduation` leg 4 (*Synthesis*) is **not** an experience test and stays
`human`. Its success condition is whether cited evidence actually earns the guidance it is routed to —
an expert value call about sufficiency and durability, with no surface and no look involved. It is
what a genuine no-compiler acceptance criterion looks like once the experience legs are gone.

**Scope — story tier only.** This does not touch ADR-0070 stage 2's capability-tier
`operator-attested` nodes, which are a different mechanism with a different purpose. Whether the
owner's "doesn't have to exist in a gate" extends to those is a real question and is deliberately
left open here rather than answered by implication; it is named in Consequences as the next fork.

**Where the four `wisp-as-story-claim` legs go is already settled by construction** — its capability
`stories/wisp-as-story-claim/appearance-uat.md` carries legs a/b/c/d that self-label as
`_(story leg 4/6/8/11 …)_` and restate them near-verbatim, so for that story D6 completes ADR-0294 D3
rather than diverging from it, and the owner's 2026-07-17 attestation record survives in the
capability's own preamble, which is the complete copy.

**D7. `agent` leg 1's two `operator` rows are superseded by this decision, not preserved.** The
owner's ruling that prior signed rows are not a reason to keep a leg human is exactly the third of the
three options that leg's own blockquote names ("re-adjudicated to `machine` as a coordinated change
that also supersedes the two `operator` rows"). It is now taken. This does **not** generalise to
`wisp-as-story-claim`'s open call 1 — *does an owner attestation carry forward onto a changed leg?* —
which concerns a genuine TASTE leg and stays open and owner-owned.

## Consequences

**Good.**

- The witness glyph tells the truth again: `human` means a person's judgment is genuinely required,
  and the standing story-tier attestation queue falls from **31 legs to 1** — 16 deleted as
  experience, 14 reclassified `machine`. That is the number the owner was actually being asked to
  work through, and it was never going to be worked through at 31.
- **Two questions, asked in order, instead of one asked of everything.** *Is this an acceptance claim
  at all?* comes first (D6) and removes the experience legs entirely; only what survives it reaches
  *does it have a compiler or a driver?* (D1). The old single question let an experience property
  through simply because it correctly had no compiler.
- ADR-0295 D1 stops being decided-but-unbuilt. The gap was invisible because nothing reds when a
  decision has no executor; naming it converts it into an increment.
- The signing architecture is untouched. Every honesty wall — the spine observes, `healthy` is never
  authorable, no model signs its own verdict — survives, because the driver's report reaches the spine
  as an exit code exactly as `dogfood-probe.run.ts`'s already does.

**Cost / watch.**

- **ADR-0295 D3's accepted risk widens.** More legs now green on a model's driving, so more greens can
  be false. The detection channel is unchanged and remains the owner and later sessions tripping over
  the defect in use, affordable only while the user population is the owner and his inner circle. If
  that population grows, ADR-0295 D6's revisit condition fires for this ADR too.
- **D4 removes a human from steps that spend money and touch the outside world.** The blast radius is
  bounded by what a UAT journey does — a subscription-funded run, a PR that CI merges — and by the
  driver's own escalation, which is a judgment call and therefore fallible. A driver that is
  overconfident will spend or commit without asking. This is accepted knowingly; the falsifier is a
  UAT drive that takes an action the owner would have refused.
- **Fourteen legs will sit `machine` and unbound between the flip and the build** if the ordering in
  D5 is not honoured. Whoever executes must flip a leg only in the same change that gives it a
  binding, or the story's adopt pass silently signs nothing.
- **`packages/cli/src/agent-witness-resolution.test.ts` pins the `agent` story's exact witness vector**
  and will red on that flip. Per `asset:edit-story-uat-criteria` step 6, replace the pin with the
  invariant it stood for rather than re-pinning the new vector.
- **`asset:human-witness-is-a-judgment-gap-not-cost` needs no edit** — it already says this. What
  needed correcting was the ADR that had drifted from it, which is the shape ADR-0139 exists to catch.
- **D6 deletes the only written record of what several surfaces are SUPPOSED to feel like.** The
  criteria being removed are not merely unproven — some are the only place a design intent is stated
  at all (`website-experience`'s five legs are the clearest case: "the overwhelm is FELT", "the exhale
  is FELT"). Deleting the criterion deletes the *claim*, not just the obligation to verify it. Where
  that intent is worth keeping, it belongs in the story's prose or the capability's, and the deleting
  author should move it there rather than let it go with the leg. This is a real loss being accepted
  for a real gain, not a free removal.
- **"Feedback comes from me as I use it" is an undated, unowned channel.** Unlike a criterion, it has
  no queue, no record that it was ever rendered, and no way to tell a surface nobody has looked at
  from one that was looked at and approved. That is exactly the trade the owner is making — a gate
  that blocks on a verdict nobody renders is worse than an honest absence — but the absence should not
  later be misread as approval.
- **The capability-tier question is left open, and someone will hit it.** ADR-0070 stage 2's
  `operator-attested` nodes are the same kind of judgment sitting one rung down, and D6's reasoning
  visibly reaches toward them without being applied. A session finding an appearance verdict blocking
  a capability's green should treat that as the open fork it is and put it to the owner, not extend D6
  by analogy.

## References

- [ADR-0295](0295-the-uat-driver-s-own-verdict-is-the-witness-model-driven-uat.md) — amended here; D1
  is relied upon and D5 narrowed.
- [ADR-0294](0294-story-uat-is-a-journey-not-a-spec-criteria-that-duplicate-lo.md) — the criteria half
  of the same surgery; D3 owns the taste legs' relocation.
- [ADR-0184](0184-machine-witness-drive-machinery-s-three-live-uat-legs.md) — the precedent conversion,
  and the source of the governing principle.
- [ADR-0247](0247-retire-the-model-uat-witness-tier-the-witness-split-is-human.md) — the binary
  witness split, unchanged; its D5 retirement worklist stays live.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — where an
  appearance verdict lives instead.
- [ADR-0106](0106-the-adopt-pass-resolves-each-uat-leg-s-witness-machine-only.md) — the fail-closed
  per-leg resolution this decision must not weaken.
- `asset:human-witness-is-a-judgment-gap-not-cost` — the standing principle D1 restores.
- `asset:edit-story-uat-criteria` — the mechanics any executing session must follow.
- `packages/drive/src/dogfood-probe.run.ts` + `dogfood-witness.check.ts` — the two-file pattern D5 adopts.
- `packages/orchestrator/src/proof/observe-and-sign.ts` — the signing path reused unchanged.
