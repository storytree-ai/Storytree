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

A leg-by-leg read of every story-tier `human` criterion on `origin/main` @ `984fd554` — **42 legs
across 17 stories**, counted with the real parser (`parseUatTestCriteria`) rather than by grep:

| bucket | count | disposition |
| --- | --- | --- |
| **EXPERIENCE** — a look/feel property of a surface | 21 | **deleted** (D6) |
| **VALUE CALL** — an expert judgment with no compiler, not a look | 4 | stays `human` |
| **LEGACY-INERTIA** — mechanically checkable today, `human` only by history | 8 | → `machine` |
| **LIVE-SPEND** — success requires a subscription-funded run | 7 | → `machine` |
| **OUTWARD-FACING** — success is an externally-visible commitment | 2 | → `machine` |

*(The first two rows were a single "taste" bucket in this ADR's first draft, all of it staying
`human`. The owner split it on 2026-08-11 on reading the list — see D6.)*

**A counting correction, recorded because the method matters more than the number.** This ADR's
first draft said 31 legs across 10 stories. That was a **grep artifact and it was wrong**: the sweep
matched the literal `_(witness: human)_`, while a leg that also carries a detail pointer writes the
tag fused as `_(witness: human)(detail: <story>#uat-<n>)_`, which that pattern cannot see. Eleven
legs across eight stories — `app-guide`, `app-surface`, `chat-drive-bridge` ×2, `chat-subagent-spawn`
×2, `headless-orchestrator`, `map-terminal-build` ×2, `spawn-visibility`, `uat-attestation` — were
invisible to the count and went unclassified. Re-counted with `parseUatTestCriteria`, the same
instrument the corpus itself uses, the population is 42. **A witness census must be taken with the
parser, never with a regex over the tag** — the tag has more than one written form, and the parser is
the only reader that knows them all.

The eight legacy-inertia legs are `agent` leg 1, `desktop` leg 3 (an OS-keychain round-trip),
`library-review` legs 1/2/4/7/8 — whose own story text already calls their human tag *"a HARNESS
statement rather than a judgment gap"* — and `terminal-repo-picker` leg 7, where only the word
"usable" was ever taste and the dialog-opens-and-returns-a-path claim is mechanical.

The seven live-spend legs are `desktop` 7, `embedded-terminal` 5, `studio-build` 9, `terminal-tabs` 4,
`chat-drive-bridge` 5, `chat-subagent-spawn` 5, and `map-terminal-build` 7. The two outward-facing
legs are `desktop` 8 (the owner grants a brokered write path) and `studio-build` 10 (a PR auto-merges
to `main`) — both of which the factory's own merge ceremony performs routinely and unattended every
day, which is the clearest evidence that neither needs a person standing over it to be *witnessed*.
(`chat-drive-bridge` 5 is both live-spend and outward-facing; it is counted once, under live-spend.)

**Several of these legs pre-authorise their own reclassification, which is the strongest evidence
that D2 and D3 are corrections rather than reversals.** `chat-subagent-spawn` 5 states it is human
*"on the SPEND basis, and on that basis alone… **Nothing here is a judgment call**"*;
`chat-drive-bridge` 5 gives two bases and says of them *"**neither of them a judgment gap**"*;
`map-terminal-build` 7 says its basis *"is honest but NARROW, and it is stated so it can be retired
honestly: it dissolves the moment the spend and the PR do."* Their authors were labelling against
ADR-0295 D5 while recording, in the same breath, that the label was not about judgment. D2 and D3
retire a basis those authors had already flagged as retirable.

The four value calls that stay `human` are `feedback-graduation` 4 (does this evidence earn this
guidance), `headless-orchestrator` 4 (is the proposal *grounded* in what the agent actually read, or
merely plausible), `chat-subagent-spawn` 6 (was that the right route for this defect), and
`map-terminal-build` 6 (is this the invocation form the owner wants — a pending owner decision, and
the only place that open modeling call is queued). None has a surface; none is a look. They are what a
genuine no-compiler acceptance criterion looks like once the experience legs are gone.

### The finding that reordered the work: ADR-0295 D1 was decided but unbuilt

> **BUILT — 2026-08-12.** The gap this section found is closed: the executor is
> `packages/drive/src/uat-drive.ts` (the pure core), `uat-drive.run.ts` (the deliberate out-of-band
> run) and `uat-drive-witness.check.ts` (the cheap `observe` command a flipped leg binds), exactly
> the two-file shape D5 mandates. The trace below is the state on `984fd554` that PRODUCED D5 and is
> kept as the reasoning; read it as history, not as current state.
>
> **FLIPPING IS COMPLETE — 12 of the 17 flipped, and the other 5 are RESOLVED rather than pending
> (2026-08-13).** This paragraph previously said *"what has NOT happened yet is any leg flip"*, then
> *"6 of the 17"*, then *"8 of the 17 … the last NINE are BLOCKED on a question this ADR did not
> anticipate"*; corrected in place per ADR-0139 as each slice landed. Flipped: `agent` leg 1 (D7's own
> leg, bound to an appended `agent#gate-2`), all five `library-review` legs
> (bound to a new `#gate-1`…`#gate-5` section), `studio-build` legs 9 and 10 (D2 and D3
> respectively, bound to an appended `#gate-2`/`#gate-3`), and — under ADR-0357's source-reading triage
> — `desktop` 3, `embedded-terminal` 5, `terminal-tabs` 4 and `map-terminal-build` 7. The executor's
> live drives stay deliberately out-of-band (ADR-0010 §5), like gate-7's cold-start probe.
>
> **The Electron nine are TRIAGED (2026-08-13, `uat-flip-nine-electron-legs`), and the count of legs
> that legitimately stay `human` is FIVE, not one.** Reading the source — the method ADR-0357's
> Consequences mandates in place of nine paid drives — resolved them three ways, and the third way was
> not one of the two the increment was told to expect:
> - **FOUR FLIP** to `machine`, each bound in the same change to an appended model-driven
>   `uat-drive-witness.check.ts` gate. `desktop` 3 was the predicted one and the prediction held:
>   `electron/main.ts:131` constructs the credential broker over `NapiKeychain` UNCONDITIONALLY, so an
>   `_electron` launch already writes the real OS keychain and "quits and relaunches" is
>   `electron.launch()` twice. `embedded-terminal` 5, `terminal-tabs` 4 and `map-terminal-build` 7 all
>   rested on D2/D3 bases alone and are reachable through the same `_electron` instrument their sibling
>   legs already use (the main-held serialized screen via `desktopTerminal.snapshot`).
> - **THREE STAY `human` on ADR-0357 D1's second basis, each now stating it.** `terminal-repo-picker` 7
>   is the worked case. `desktop` 7 and `desktop` 8 are a SECOND mechanism this ADR did not see, and it
>   is one line of code: `ensureHostedIdentity` (`apps/desktop/electron/main.ts:180`) blocks the brokered
>   write on an INTERACTIVE Google sign-in behind IAP, and no identity the factory holds can mint an
>   IAP-audience OIDC token since ADR-0254 D4 retired `storytree-remote-dev`.
> - **TWO ARE MOOT, which is neither answer.** `chat-drive-bridge` 5 and `chat-subagent-spawn` 5 sit on
>   `status: retired` stories whose surfaces were DELETED (the accept-to-Build handshake in PR #587
>   under ADR-0155; the spawn tool surface on 2026-07-31 under ADR-0175, held gone by
>   `spawn-surface-retired.test.ts`). Their D2/spend bases are withdrawn, but flipping them would mint a
>   gate that can never go green because the journey cannot be WALKED — a red that is neither a harness
>   limit nor a product defect, and therefore exactly the indistinguishable-red failure ADR-0357 exists
>   to control. They are left tagged as they stand with the mootness recorded on the leg. Whether a
>   retired story's UAT legs should be DELETED (ordinals burned, as D6 did for experience legs) or kept
>   verbatim as history is a story-author / librarian disposition call, deliberately not made there.
>
> **The paragraph below is the state that PRODUCED the fork, kept as reasoning.** Every one is behind the packaged Electron desktop app, and at least one — the
> `terminal-repo-picker` leg naming a REAL native OS directory dialog — could not satisfy D1 as this
> ADR first wrote it, in either direction: staying `human` disobeyed D1, and flipping it mints a gate
> that can never go green, because `dialog.showOpenDialog` is an Electron MAIN-process native modal
> that a renderer-driving harness cannot click — which is exactly why the `_electron` suite STUBS that
> call. **This ADR did not foresee a third category: mechanical, but outside every harness the proof
> spine can own.** That fork — `oq-adr-0348-d1-vs-a-surface-no-harness-owns-what-happens-to` — was
> ANSWERED by the owner on 2026-08-12 and is recorded as **ADR-0357**, which AMENDS D1: a leg may stay
> `human` when its success condition is mechanical but sits outside every harness the spine owns,
> PROVIDED the leg states that basis and what would retire it (ADR-0357 D4 extends that obligation to
> every `human` leg, not only these). The increment is unblocked and re-scoped to source-reading
> triage rather than nine paid drives — and that triage EXECUTED on 2026-08-13, with the outcome
> recorded above.
> *(A counting correction inherited by that increment: the flip work recorded SEVEN Electron-bound
> legs. It is NINE — `chat-drive-bridge` 5 and `chat-subagent-spawn` 5 also open "In the desktop app".)*
> *(A second correction, from executing it: "the `_electron` suite already relaunches the real app
> across a restart" — repeated from this ADR into the increment — is NOT true of
> `session-survival.e2e.mjs`, which launches once and does a renderer `win.reload()` plus a SPA route
> change. The conclusion survives intact, because a real restart is `electron.launch()` twice and the
> harness plainly supports it; but the claim as written was a description of a spec that does not do
> that, and a triage resting on it would have been resting on prose.)*
>
> **What driving the flipped legs has actually produced is a MEASUREMENT, twice over, and that is the
> real yield of D1.** Flipping `library-review`'s five legs found that its story-rung journey does not
> run end to end at all, while nine capabilities held signed `--real` verdicts. Flipping `studio-build`
> leg 9 found the same shape: the studio UI's Build path can only reach `{ real: true, verdictStore:
> 'pg' }`, never `{ live: true }`, so the `--live` synthetic walk that leg claims is unreachable by
> construction (ADR-0144's pivot; fork raised as
> `oq-did-adr-0144-s-node-route-pivot-retire-the-live-from-the`). Both reds are TRUE and are left red.
> Neither gap was visible while the legs sat `human` in an attestation queue nobody worked — which is
> the strongest evidence for D1 that this decision has produced.

ADR-0295 D1 states that a model driving a journey headlessly or through a browser *"is such a run, and
its reported outcome is admissible as the verdict."* **No executor existed for that sentence.** Traced
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

> **Amended 2026-08-12 by [ADR-0357](0357-human-uat-witness-also-covers-surfaces-no-harness-owns-every.md) D1 — corrected in place (ADR-0139).** "Taste alone" no longer holds without
> qualification: a leg may also carry `witness: human` on a second basis — its success condition is
> mechanical but sits outside every harness the proof spine owns — PROVIDED it states that basis and
> what would retire it (ADR-0357 D2), and that statement is readable where the owner meets the leg
> (ADR-0357 D3). D2 below (live-spend) and D3 below (outward-facing) stand unamended.

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

> **The build landed 2026-08-12** (`packages/drive/src/uat-drive*.ts`), and flipping began the same
> day: 6 of 17 legs are flipped, bound and driven, 11 remain. Two mechanics the flip increment inherits
> rather than invents. **(a) The binding is self-describing** — a leg is model-driven exactly when the
> observe gate it names runs `uat-drive-witness.check.ts`, so no registry says which legs a model
> drives and which a suite does, and the two cannot disagree. **(b) The ordering is executable, not
> merely a rule** — naming a criterion id explicitly drives it whatever its current witness and
> binding, so a leg is driven FIRST and flipped-and-bound in one later change. Flipping first would
> leave the story holding an unbound machine leg, which refuses signing for every sibling.
>
> One property is worth carrying forward because it is what keeps the record honest over time: a
> drive record is bound to the criterion's content-bound `revision-id`, so re-authoring a journey
> invalidates every prior drive rather than carrying its green onto a claim nobody tested.

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

**Deleted (21):** `desktop` 9, 11 · `embedded-terminal` 7 · `studio-build` 11 ·
`terminal-repo-picker` 8 · `terminal-tabs` 1, 5 · `website-experience` 3, 5, 7, 9, 11 ·
`wisp-as-story-claim` 4, 6, 8, 11 · `app-guide` 4 · `app-surface` 11 · `chat-drive-bridge` 6 ·
`spawn-visibility` 5 · `uat-attestation` 7.

**D6 retires the reservation on `app-guide` 4 and `app-surface` 11, and discharges chip
`task_99f7e0a9`'s claim on them.** Both legs carry a written note reserving them to the ADR-0294 D3
relocation increment — app-surface's reads *"Deleting or relocating it here would pre-empt that
adjudication."* D6 **is** that adjudication, made by the owner: the disposition changed from
relocate-to-a-capability to delete, so the reservation is moot rather than overridden. It is named
here, and in each story's prose, rather than silently dropped — if the owner disagrees, this is the
one line to reverse.

**`uat-attestation` 7 is the sharpest intent loss in the pass and is called out for it.** Its claim
is an anti-false-confidence wall — *a vouch must never read as a gate-proven pass*. Its sibling leg 6
proves the two marks are structurally different, which is **not** the same claim as a reader reading
them as different rigor. That intent is carried into the story's prose; it is the reason the story
exists and must not go with the leg.

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
  and the standing story-tier attestation queue falls from **42 legs to 4** — 21 deleted as
  experience, 17 reclassified `machine`. That is the number the owner was actually being asked to
  work through, and it was never going to be worked through at 42. *(Corrected in place 2026-08-21,
  ADR-0139: "17 reclassified machine" assumed a clean flip that did not happen. Driving the flip
  surfaced ADR-0357's second basis — nine of the seventeen sat behind the packaged Electron app, and
  of those only four actually flipped; three stayed `human` on ADR-0357's D1 second basis and two were
  moot. The queue did not settle at 4 — it settled at 9 per ADR-0357, then at 5 once ADR-0396 deleted
  the criteria that sat on stories retired in the meantime. See ADR-0357's own correction for the final
  count and names.)*
- **Two questions, asked in order, instead of one asked of everything.** *Is this an acceptance claim
  at all?* comes first (D6) and removes the experience legs entirely; only what survives it reaches
  *does it have a compiler or a driver?* (D1). The old single question let an experience property
  through simply because it correctly had no compiler.
- ADR-0295 D1 stops being decided-but-unbuilt. The gap was invisible because nothing reds when a
  decision has no executor; naming it converted it into an increment, and the increment landed
  2026-08-12.
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
- **Seventeen legs will sit `machine` and unbound between the flip and the build** if the ordering in
  D5 is not honoured. Whoever executes must flip a leg only in the same change that gives it a
  binding, or the story's adopt pass silently signs nothing. `chat-drive-bridge` and
  `chat-subagent-spawn` are the sharpest cases: both carry machine siblings that sign cleanly today
  and would stop.
- **The population was miscounted once already, by a plausible method.** A regex over the witness tag
  missed a quarter of the corpus because the tag has two written forms. Any later re-measurement —
  including whoever checks whether this ADR's numbers still hold — must use `parseUatTestCriteria`,
  not a grep. The failure was silent and looked like a complete answer.
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
