---
status: accepted
decided: 2026-08-12
arc: uat-journey-surgery-arc
amends: [348]
---
# ADR-0357: Human UAT witness also covers surfaces no harness owns — every human leg states its basis

## Status

accepted (2026-08-12) — decided/directed by the owner in conversation on 2026-08-12. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

ADR-0348 narrowed the `human` UAT witness to genuine taste, asking two rules in order: is this an
acceptance claim at all (a user-experience property is deleted, not relocated), and only then, does it
have a compiler or a driver. Live-spend and outward-facing were withdrawn as bases for `human`, because
both were cost arguments and `asset:human-witness-is-a-judgment-gap-not-cost` already names cost as the
most seductive false premise.

Executing that produced a population of 17 legs to flip. Eight landed (PR #1294, PR #1295) and the
remaining nine all sit behind the packaged Electron desktop app. Driving them exposed a category
ADR-0348 did not foresee.

**`terminal-repo-picker` leg 7 cannot honour D1 as written, and this was established from code rather
than inferred from a failed attempt.** The leg's success condition is that a REAL native OS directory
chooser appears and returns the user's chosen checkout. `apps/desktop/electron/main.ts:594` calls
`dialog.showOpenDialog` — an Electron **main-process** native OS modal. Playwright drives the
**renderer**. That is not a gap in our harness configuration; it is what the harness is. The existing
`_electron` e2e suite works on legs 3–5 precisely BECAUSE it stubs that one call, as that story's own
witness note says.

So the leg is caught both ways. Leaving it `human` disobeys D1, which is unconditional. Flipping it to
`machine` mints a gate that can never go green for a harness reason — and a permanently-red harness
gate is indistinguishable at a glance from a real product red. This same arc produced one of each on
`studio-build` in a single session (leg 9 a true product red, leg 10 a harness red) and had to write a
section into that story explaining which was which. Minting more of them trains readers to discount
red, which is the failure ADR-0097 §2 warns about from the other direction.

The fork was raised as `oq-adr-0348-d1-vs-a-surface-no-harness-owns-what-happens-to` with four options:
narrow the claim and bind it to the stubbed suite (A), delete the leg outright (B), acquire OS-level
automation (C), or name a fourth category alongside taste (D). The other eight Electron legs were left
deliberately unprobed, because the rule might dispose of some of them for free and each probe costs a
5–15 minute paid drive.

The owner ruled on 2026-08-12: the leg is a human escalation, **and it must carry a justification the
owner can read by hovering the leg** — *"it just needs justification so i can hover over the uat and
read why it needs me."* That is Option D plus a control Option D did not have, and the control is what
distinguishes it from the exemption ADR-0348 removed.

A measured census over every `stories/*/story.md` using `parseUatTestCriteria` (never a grep — a leg
carrying a detail pointer writes the tag fused, and a grep undercounted this very population by 11 legs
across 8 stories) finds **13 story-tier `human` legs across 205 criteria**: the nine Electron-bound ones
and four genuine taste calls (`feedback-graduation`, `headless-orchestrator`, `chat-subagent-spawn`,
`map-terminal-build`).

## Decision

**D1. A UAT leg MAY carry `witness: human` on a second basis alongside taste: its success condition is
mechanical, but sits outside every harness the proof spine owns.** ADR-0348 D1's "genuine taste only" is
amended to that extent and no further. Live-spend and outward-facing remain withdrawn as bases
(ADR-0348 D2/D3 stand unamended), and ADR-0348's first rule is untouched: a user-experience property is
still not an acceptance claim at all, and is still deleted rather than made human under this basis.

**D2. The basis is never automatic — the leg must state it.** A leg resting on D1's second basis states,
in its own prose: **(a)** which harness would have to reach it and why none does, naming the *mechanism*
(as leg 7 does: a main-process native OS modal versus a renderer-driving harness) rather than asserting
difficulty; and **(b)** what would retire the exception. A leg that merely asserts "no harness reaches
this" has not met D2 and is not eligible.

**D3. The stated basis must be readable where the owner meets the leg.** Today the studio's witness glyph
renders a tooltip computed only from witness and proven-state
(`apps/studio/src/components/TreeView.tsx:5331-5341`) — the same string for every human leg, telling the
owner *that* they are needed and never *why*. That tooltip carries the leg's own stated basis. A basis
that exists only in `story.md` does not satisfy D2, because the owner does not read `story.md` when
deciding what to attest.

**D4. D2 binds EVERY `human` leg, not only the un-harnessable ones.** All 13, including the four taste
legs. If only some human legs carry a basis, hovering an unjustified one is indistinguishable from a
bug, and the population stops being auditable — which is the failure this ADR exists to control.

**D5. Why this is not the carve-out ADR-0348 D2/D3 removed.** The exemptions 0348 withdrew were
*categorical*: a leg joined the class by being live-spend or outward-facing, automatically, at zero cost
to its author, and nothing put the resulting population in front of anyone. That is how it reached 42
legs nobody worked. This basis inverts both properties. Membership costs the author a specific written
argument (D2), and every member is surfaced at the moment the owner encounters it (D3) — so the
population cannot grow silently, because growth becomes visible exactly where growth would otherwise be
felt. `asset:human-witness-is-a-judgment-gap-not-cost` stands unamended: it names *not-yet-harnessed* as
the seductive false premise, and D1's second basis is not not-yet-harnessed but not-harnessable-by-any-
harness-the-spine-owns — a claim D2(a) forces the author to establish from mechanism. If a harness later
reaches the surface, D2(b) is the sentence that retires the leg.

**D6. This does not reach the capability tier.** ADR-0348 deliberately left ADR-0070 stage-2
capability-tier `operator-attested` nodes open; this ADR does not extend to them by analogy either. An
appearance verdict blocking a capability's green is still an owner question.

## Consequences

**`uat-flip-nine-electron-legs` is unblocked, and its scope shrinks.** The method that settled leg 7 —
reading the source — is the method for the rest. Static code triage decides each of the nine: genuinely
outside every harness → stays `human` with a D2 basis, no drive; actually drivable → flips per ADR-0348
D1. Only ambiguous legs cost a paid drive. `desktop` 3 is the likeliest genuine flip (the real Windows
Credential Manager is on the dev box, so that story's "a headless runner has no equivalent" may itself
be a stale harness statement).

> **EXECUTED 2026-08-13, and the prediction held — but the triage found a THIRD outcome and a SECOND
> mechanism.** Recorded here as the state of the decision, not as a re-decision. Of the nine:
> **four FLIPPED** to `machine` bound to model-driven gates in the same change (`desktop` 3 —
> `electron/main.ts:131` constructs the credential broker over `NapiKeychain` unconditionally, with no
> E2E swap, so an `_electron` launch already writes the real OS keychain; plus `embedded-terminal` 5,
> `terminal-tabs` 4 and `map-terminal-build` 7, which rested on ADR-0348 D2/D3 bases alone).
> **Three STAY `human` on D1's second basis, each now stating it per D2** — `terminal-repo-picker` 7,
> and `desktop` 7 and 8 on a mechanism this ADR did not have: `ensureHostedIdentity`
> (`apps/desktop/electron/main.ts:180`) blocks the brokered write on an INTERACTIVE Google sign-in
> behind IAP, and no identity the factory holds can mint an IAP-audience OIDC token since ADR-0254 D4
> retired `storytree-remote-dev`. So the un-harnessable category is not one leg with one cause; it is
> two causes, and the second one gates a whole surface rather than a single dialog.
> **TWO are MOOT** — `chat-drive-bridge` 5 and `chat-subagent-spawn` 5 sit on `status: retired` stories
> whose surfaces were DELETED, so their journeys cannot be walked at all. Neither answer this ADR
> offers fits: their D2/spend bases are withdrawn, but a `machine` gate there could never go green for a
> reason that is neither a harness limit nor a product defect — precisely the indistinguishable red D1's
> second basis exists to prevent minting. They were left tagged as they stand with the mootness recorded
> on the leg, and the disposition (delete the legs, ordinals burned, or keep them verbatim as history)
> routed to a story-author / librarian pass. **If this shape recurs, it is a candidate for a D6-style
> deletion rule for retired stories rather than a third witness basis.**
>
> **A claim in this ADR's own Consequences was wrong and is corrected in place (ADR-0139).** It read
> "the `_electron` suite already relaunches across a restart". `session-survival.e2e.mjs` launches the
> app ONCE and performs a renderer `win.reload()` plus a SPA route change; it never relaunches the
> process. The conclusion survives — a real restart is `electron.launch()` twice, which the harness
> plainly supports — but the sentence described a spec that does not do what it said, and the triage it
> was pointing at would otherwise have rested on prose rather than on code.
>
> **D4's status across the whole surviving population, measured with `parseUatTestCriteria` (never a
> grep):** the story-tier `human` count is now NINE, down from thirteen. Three carry a full D2 basis
> authored by this triage. Four are the taste legs, of which `headless-orchestrator` 4,
> `chat-subagent-spawn` 6 and `map-terminal-build` 6 already state both a basis and what would (or
> would never) retire it — `map-terminal-build` 6's *"dissolves under neither a new harness nor cheaper
> spend"* is the model — while **`feedback-graduation` 4 states its no-compiler basis but no explicit
> retiring sentence, and is the one outstanding D4 gap.** Two are the moot pair above. Closing that one
> gap belongs with D3's product slice, which is where every human leg's basis has to become structured
> anyway.

**D3 is a product increment, not corpus work, and it does not exist today.** `UatTestCriterion` is
`.strict()` with eight fields and no rationale among them
(`packages/library/src/uat-test-criteria.ts:39`), so a stated basis has no structured home. Delivering
D3 is a thin vertical slice: an authored tag → the parser → the schema → the attestations payload → the
studio row type → the tooltip string.

**⚠️ A new non-identity tag changes every affected leg's `revision-id`.**
`canonicalUatCriterionContent` strips only identity annotations — criterion-id, revision-id,
previous-revision-id, lineage (`packages/library/src/uat-test-criteria.ts:189`) — so a
`witness-because`-style tag lands INSIDE the hashed content. This is contained: only `human` legs gain
the tag, and human legs hold no drive records to invalidate. But it forces an ordering — the schema and
parser land before any basis is authored — and recomputing a revision-id still has no verb (an open
friction), so the slice must carry one.

**Leg 7 stays `human`, and its existing prose is already most of the way to D2.** Its parenthetical
already names the mechanism — *"an OS-level modal sits outside every harness the proof spine owns"* —
which satisfies D2(a) nearly verbatim. It needs D2(b), the retiring condition. Whether the word
*"usable"* survives is a separate question this ADR does not settle: that story already adjudicated leg
7 as a genuine acceptance claim when ADR-0348 D6 deleted its sibling look-leg, so the D6 tension is a
wording call for a story-author pass, not a structural defect.

**Accepted risk, stated plainly.** D1's second basis is close in shape to what ADR-0348 removed, and
ADR-0348's own Context is the argument against it. The bet is that D2 and D3 together are the difference
between an exception and a carve-out. If the human population grows past its measured 13 without each
addition surviving D2's bar, that bet has lost and the remedy is to tighten D2, not to widen D1.

## References

- ADR-0348 — human UAT witness narrows to taste (amended here, D1 only).
- ADR-0294 / ADR-0295 — story UAT is a journey; the driver's own verdict is the witness.
- ADR-0070 stage 2 — capability-tier `operator-attested` nodes, explicitly out of scope (D6).
- ADR-0097 §2 — against minting gates that cannot witness a real artifact.
- ADR-0110 — owner direction in conversation is ratification.
- `asset:human-witness-is-a-judgment-gap-not-cost` — stands unamended; see D5.
- `oq-adr-0348-d1-vs-a-surface-no-harness-owns-what-happens-to` — the fork this answers; retired with this ADR.
- `apps/desktop/electron/main.ts:594` — the `dialog.showOpenDialog` call that is the worked example.
- `apps/studio/src/components/TreeView.tsx:5331-5341` — the generic tooltip D3 replaces.
- `packages/library/src/uat-test-criteria.ts:39,189` — the `.strict()` schema and the canonicaliser.
