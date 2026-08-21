---
status: accepted
decided: 2026-08-21
arc: machine-uat-signing-gap-arc
amends: [295, 348]
---
# ADR-0405: The machine-UAT signing verb already exists — the gap is binding coverage and discoverability

## Status

accepted (2026-08-21) — decided/directed by the owner in conversation on 2026-08-21. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

`machine-uat-signing-gap-arc` was chartered on 2026-08-21 on a diagnosis that turned out to be
wrong in its cause, its population, and its remedy. Its first increment existed precisely to
re-derive the measurement rather than inherit it. This ADR records what the re-derivation found.

**The charter's claim.** The model-driven UAT executor (ADR-0295 D1, built under ADR-0348 D5)
drives a story's acceptance journey and persists the outcome to `events.uat_drive`; a cheap
`observe` gate (`packages/drive/src/uat-drive-witness.check.ts`) witnesses that record; the spine
signs over the exit code it watched. The charter said 18 driven criteria across 7 stories had
produced ZERO signed criterion verdicts because **no verb could sign a machine UAT leg on a
non-brownfield story** — `packages/drive/src/adopt.ts` being the only code that signs one, and
`storytree adopt` refusing anything that is not brownfield `mapped`. It offered three shapes:
(a) widen adopt's status guard, (b) extend `adopt gate` to stamp `criterionId`/`revisionId`,
(c) a distinct verb.

**What the live store and the parser actually say**, measured 2026-08-21 at `8cabe128`
(= `origin/main`), against the live Cloud SQL store and through `parseUatTestCriteria` /
`resolveWitness` — never a grep:

- **12** UAT legs, not 18, are bound to the drive-witness check, across the 7 named stories
  (`agent` 1 · `desktop` 1 · `embedded-terminal` 1 · `library-review` 5 · `map-terminal-build` 1 ·
  `studio-build` 2 · `terminal-tabs` 1). `events.uat_drive` holds 30 rows over **11** distinct
  criteria — `studio-build`'s second leg has never been driven successfully.
- **The zero is real.** No verdict row in the store carries a `criterionId` matching any driven
  criterion. All 29 criterion verdicts that exist are `proofMode: adopted`, signed
  2026-08-03/04 — the brownfield adopt runs.
- **The cause is not the status guard.** `runAdopt` refuses a status that is neither `mapped` nor
  `proposed` (`adopt.ts:138`) — and **all 27 stories declaring a real machine leg are `proposed`**.
  Adopt accepts every one of them today.
- **Proved end to end, writing nothing.** Running `runAdopt`'s pure core against the `agent` story
  with the real spec, the real git state, a recording store and the REAL observe runner: both
  gates observed green (`pnpm --filter @storytree/agent test`, and the drive-witness check) and it
  produced a criterion verdict for `uatc_027e3e8ad2253d327fc15c07` at
  `unitId = criterionId`, `revisionId = uatr1:380a683e4995990d`, `proofMode: adopted`.
  **`storytree adopt agent --pg` would sign that leg today, with no code change at all.**
- **The corpus-wide picture the charter never took.** 121 real (non-`wouldBe`) machine legs across
  27 stories: **74 bound, 47 unbound**. Twelve stories carry no unbound leg at all — for those,
  adopt would sign **65** machine legs today. Six stories are poisoned: **9** bound legs blocked
  solely by an unbound sibling, through the no-partial-verdict rule.
- **9 of the 12 model-driven legs pass their witness check at HEAD right now.** The three reds
  (`map-terminal-build` 7, both `studio-build` legs) are honest reds already adjudicated under
  ADR-0348 — a product red and a harness red, not a signing gap.

So the executor's evidence is not unconsumable. It is unconsumed. Two distinct things kept it that
way, and neither is a missing verb:

1. **Discoverability.** Nothing on the UAT surface names the verb that signs a machine leg.
   `storytree uat list` / `witness list` end with `next: storytree uat attest <story> <first
   criterion>` regardless of that criterion's witness — and on a machine leg that command is
   refused by construction (ADR-0082 d.2, `uat.ts:458`). `uat attest`'s own refusal then points at
   `storytree node build <story> --real`, which is the wrong path for an observe-bound leg. Every
   printed pointer walked away from `adopt`.
2. **Binding coverage.** `runAdopt` resolves all real machine legs before signing any, and a
   single unbound leg fails the whole UAT-signing pass with no partial verdict set. That is not
   incidental: it is the asserted behaviour of the `adopt-signs-leg-against-bound-command` contract
   (`stories/drive-machinery/uat-bound-command-adoption.md`, ADR-0106/ADR-0180). The 47 unbound
   legs are an authoring debt, and 9 signable legs are behind them.

## Decision

**D1 — No new signing verb, and no change to adopt's status guard. `storytree adopt <story> --pg`
IS the verb that signs a machine UAT leg's criterion verdict, on any `proposed` story.** Shapes
(a) and (c) are declined: (a) has nothing to widen, because the guard the charter blamed already
passes for the entire affected population; (c) would add a second signing authority next to a
working one. This is measured, not argued — see the `agent` end-to-end probe above.

**D2 — Shape (b) is REFUSED as unrepresentable, and the near-miss is worth recording.** `Verdict`'s
own refinement requires `unitId === criterionId` whenever a `criterionId` is present
(`packages/proof-protocol/src/proof.ts`). Stamping `criterionId`/`revisionId` onto the
gate-id verdict that `adopt gate` signs therefore produces a row that BOTH `CriterionVerdict.safeParse`
and `Verdict.safeParse` reject, so `rollupCriterionStatus` skips it. The command would report a
signed verdict and the crown would never see it — a green that verified nothing, in the
project's commonest fault class. A per-gate leg signing IS representable (sign a SECOND row at
`unitId = criterionId`, exactly as `runAdopt` does), but see D3.

**D3 — The no-partial-verdict rule stands, and is not to be routed around.** The 9 bound legs
blocked in 6 stories are unblocked by BINDING or RETIRING their unbound siblings — story-author
work on `stories/**` — never by giving `adopt gate` a per-leg path that signs around the rule. A
per-gate bypass would relax a proven contract by the back door, which is the move ADR-0348's
own history warns about.

**D4 — The backlog signs from existing records. No re-drive.** The drive record is the artifact,
the witness check is the observation, and adopt observes that check out-of-band and signs over the
exit code it watched — ADR-0295 D2 is satisfied without a single new drive. Re-driving would spend
subscription time to reproduce records that already witness green. Where a leg's check is RED,
the red is left red and is adjudicated on its own merits (ADR-0348), never re-driven to chase a
pass.

**D5 — The UAT surface must stop pointing away from the signing verb.** `uat list` / `witness list`
resolve each leg's witness before offering a next step, and `uat attest`'s machine refusal names
the verb that actually applies to that leg's binding: an observe-bound machine leg points at
`storytree adopt <story> --pg`, a `build-tests`-bound one at the build path, and an unbound one
says the binding is missing rather than naming any signing command. A human leg is unchanged.

**D6 — Who APPROVES is escalated, not decided here.** An `adopted` verdict is signed by the spine
principal but carries `approvedBy` — the human who decided to bring the unit into the fold
(ADR-0097 d.4), resolved fail-closed from `--signer` → `STORYTREE_SIGNER` → git email. On this box
that chain resolves to the owner's address for any session that runs the command. Signing 65 legs
across 12 stories would therefore record the owner as having approved 65 adoptions he never saw.
That is the false-attribution shape ADR-0007 exists to prevent, and it is not an agent's call to
make. It is authored as an `open-question` on this arc and blocks the backlog leg (D4's execution),
not this ADR.

## Consequences

- **The arc's own charter prose is wrong and is corrected in place** (ADR-0139): the intent and end
  state assert a missing verb, a refusing status guard, and 18 driven criteria. All three are
  false. The arc keeps its name — the gap between driven evidence and signed verdicts is real —
  but its cause is restated as binding coverage plus discoverability.
- **The remaining work is bigger than the charter thought, and cheaper.** 65 bound legs across 12
  stories are signable by an existing command; the charter scoped 18. No signing code is written.
- **Two of the seven charter stories are unblocked immediately** — `agent` (1 leg) and
  `library-review` (5 legs) carry no unbound machine leg, and all six legs pass their witness check
  at HEAD. *(This bullet ended "The other five wait on D3's authoring work." That authoring work
  LANDED on 2026-08-22 as `machine-uat-signing-gap-arc-inc-02`, so the five no longer wait —
  corrected in place per ADR-0139. The decision is unchanged; only its pending status was.)*
- **A cost accepted knowingly, and it has since been PAID.** D3 left 9 provable legs unsigned until
  their unbound siblings were bound or retired, and warned that some of the 47 might not deserve a
  binding at all. *(That was the state until 2026-08-22. `machine-uat-signing-gap-arc-inc-02` bound
  the 21 unbound legs in the six poisoned stories — `desktop` 5, `embedded-terminal` 4,
  `studio-build` 7, `terminal-tabs` 3, `map-terminal-build` 1, `studio-members` 1 — each to a newly
  APPENDED per-criterion `uat-drive-witness.check.ts` observe gate, the ADR-0295 D1 model-driven
  instrument every one of those stories already named as its honest binder. None was retired: all 21
  are genuine integrated journey claims. Zero refused machine legs remain in the six, so the 9 are
  signable; corpus-wide the count moved 74 bound / 47 unbound → 95 / 26, and the 26 that remain sit
  in nine stories that hold NO bound leg, so they strand nothing and each states its own reason for
  staying unbound. Binding is not driving — no drive was run, so all 21 gates are honestly RED, which
  is D4's "a red check is left red" and not a signing gap. Corrected in place per ADR-0139.)* Paying
  it kept a signed contract honest; the alternative bought 9 verdicts by weakening the rule that
  stops a story from carrying a partial, misleading verdict set.
- **The measurement instruments are recorded so nobody re-derives them by grep:** `storytree uat
  census` for the witness population, `resolveWitness` for binding, and `runAdopt`'s
  pure-by-injection core (a recording store plus a stubbed observe) for control flow — the last of
  which answers "would this sign?" without writing a verdict.
- The charter's `18` almost certainly came from counting something other than distinct driven
  criteria. It is superseded by the numbers above, which are reproducible from the live store.

## References

- ADR-0295 (the model-driven UAT executor; D2's *no model signs its own verdict* is untouched) ·
  ADR-0348 (the witness flip that created this population) · ADR-0357 (the human-basis rule).
- ADR-0097 (adopt as the human-entered proving process; d.4 the approver) · ADR-0106 (a machine
  leg resolves only against its exact `(proof-gate:)` binding) · ADR-0082 d.2 (the witness guard
  that keeps refusing a human click on a machine leg) · ADR-0085 (observe-and-sign).
- `packages/drive/src/adopt.ts` (`runAdopt`, its status guard and its machine-leg signing loop) ·
  `packages/orchestrator/src/proof/observe-and-sign.ts` ·
  `packages/proof-protocol/src/proof.ts` (the `unitId === criterionId` refinement) ·
  `packages/library/src/witness-resolution.ts` (`resolveWitness`) ·
  `packages/cli/src/uat.ts` (the next-step pointers D5 fixes).
- `stories/drive-machinery/uat-bound-command-adoption.md` — the contract D3 refuses to weaken.
