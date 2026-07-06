---
status: accepted
load_bearing: true
decided: 2026-06-25
amends: [85, 97, 98]
---
# ADR-0105: Drive and adopt are peer best-efforts: every green is provisional, none is full proof

## Status

accepted (2026-06-25) — a direct owner decision during a design conversation on 2026-06-25, made while
reconciling the per-capability display (Option A, the [ADR-0097](0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md)
§5 completion — a covered capability renders the same green as an own-driven one). The owner sharpened
the model past the display fix: *"just because it wasn't driven green doesn't mean it is full proof —
both are assumed states that time may reveal require more coverage; drive and adopt both make best
efforts to bring the stories under the TDD umbrella."* The owner then chose to **flatten the value
distinction while keeping the basis record** (the `adopted` `ProofMode` survives as value-neutral
provenance, not a rank). The `status:` flip was applied by this session per
[ADR-0084](0084-agents-may-flip-an-adr-green.md).

It **amends the value FRAMING (not the mechanism)** of
[ADR-0085](0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md) (the `adopted` basis as
"weaker" / a "weakening"), [ADR-0097](0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md)
(observe-and-sign as the "cheap first step", build-tests as "REAL WORK"), and
[ADR-0098](0098-a-build-tests-capable-inner-loop-refactor-for-testability-ea.md) ("strong driven
provenance" distinguishing "real coverage" from "merely observed"; "only observe earns the weaker
adopted"). It **overturns no honesty wall and changes no code**: `green = a signed verdict`
([ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md)) stands; the `adopted` `ProofMode` stays
(now read as value-neutral provenance); the observe ↔ build-tests routing
([ADR-0085](0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md) /
[ADR-0098](0098-a-build-tests-capable-inner-loop-refactor-for-testability-ea.md)) is unchanged. This
reframes how the two paths RELATE, not what either DECIDED.

## Context

The brownfield proof model grew a real and useful distinction (ADR-0085 / 0097 / 0098): a green is
earned two ways —

- **adopt / observe** — the spine observes an existing suite green at a clean committed HEAD and signs
  an `adopted` verdict (the suite already covers the code);
- **drive / build-tests** — the spine drives a genuine red→green (the coverage didn't exist; it was
  built).

But the prose accreted a **value hierarchy** on top of that honest mechanism: adopt became the "cheap
first step" / the "weaker basis" / "merely observed", and drive became "REAL WORK" / "strong driven
provenance" / the green that "MEANS the pocket got real coverage." Read together, that language implies
**driven green is full/complete proof and adopted green is a lesser placeholder.**

The owner rejected that framing while reconciling the per-cap display (the
[ADR-0097](0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md) §5 completion, Option A
— a covered capability renders the same green as an own-driven one):

1. **Neither green is "full proof."** A driven red→green can still be vacuous (its assertions may not
   bite — the same bound [ADR-0098](0098-a-build-tests-capable-inner-loop-refactor-for-testability-ea.md)
   §2 already concedes for the structural red), can go **stale** when the code it proved changes
   ([ADR-0016](0016-knowledge-code-binding-and-staleness.md)), and only ever covered the cases it
   tested. A driven green is an *assumed* state too — confident, but provisional.
2. **Time may reveal EITHER needs more coverage.**
   [ADR-0085](0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md)'s expandable floor
   ("grow a `build-tests` gate as observation proves insufficient — a defect slips through, a consumer
   breaks") was framed as applying only to adopted code. The same trigger applies to *driven* code: an
   escaped defect or a broken consumer grows a new gate over a pocket that was already driven green. The
   floor grows over **both**.
3. **Drive and adopt are peers, not a ladder.** Both are **best efforts to bring a story under the TDD
   umbrella** — adopt by recognising coverage that exists, drive by building coverage that's missing.
   They are two moves toward the same goal, chosen by *which one the code needs* (does an honest test
   already exercise it?), not by which produces a "better" green.

The honest distinction that REMAINS is one of **basis / provenance, not rank**: an observed test was
never witnessed failing (no evidence it discriminates beyond author review), while a driven test was.
That is a real epistemic fact worth RECORDING — but it is a difference in *how the green was
established*, not a difference in the green's *standing*.

## Decision

**1. Drive and adopt are peer best-efforts to bring code under the TDD umbrella; every green is
provisional.** No tier of green outranks another. A `healthy` unit is `healthy` — whether its verdict
was driven or adopted — and every green is an *assumed* state open to revision (drift, an escaped
defect, a vacuous test). "Full proof" is not a state the system claims for anything.

**2. The reliability floor grows over BOTH paths.**
[ADR-0085](0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md)'s expandability — grow
a `build-tests` gate when observation proves insufficient — is generalised: the trigger (a defect slips
through, a consumer breaks, a should-behaviour is found unmet) grows a new gate over a *driven* pocket
exactly as over an *adopted* one. Growing the floor is the system's standing response to "time revealed
we need more coverage", on either basis.

**3. The `adopted` `ProofMode` stays — as VALUE-NEUTRAL provenance.** It records *how* a green was
established (observed existing coverage vs a driven red→green), the way `boundCommit` records where a
proof was signed and drift rides alongside status without downgrading it
([ADR-0016](0016-knowledge-code-binding-and-staleness.md) /
[ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md) §7). It is an audit + targeting
signal — knowing which greens are observe-only (never witnessed failing) is exactly where to consider
growing the floor first (decision 2) — and it **ranks nothing**: the world's hue, the crown roll-up, the
per-cap display, and the status word treat an `adopted` pass and a driven pass **identically**. This is
already true in code — `rollupStatus` / `rollupCapStatus` / `provenStatus` / `rollupStoryGreen` all key
off `outcome === 'pass'`, never the mode, and the per-cap display flattening landed with the
[ADR-0097](0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md) §5 completion — **so
this ADR changes no code.** Collapsing the label entirely (one green, no basis record) was the heavier
alternative the owner considered and deferred: it would cost a verdict-shape + stored-data change and
lose the "never witnessed failing" audit record, for no gain the peer-framing doesn't already give.

**4. The value language in ADR-0085 / 0097 / 0098 is reframed (amended); the mechanism is preserved.**
"Weaker basis" / "the deliberate weakening"
([ADR-0085](0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md)), "cheap first step" /
"REAL WORK" ([ADR-0097](0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md)), and
"strong driven provenance" / "real coverage vs merely observed" / "only observe earns the weaker
adopted" ([ADR-0098](0098-a-build-tests-capable-inner-loop-refactor-for-testability-ea.md)) read as a
value hierarchy and are superseded by this ADR's peer framing. What those ADRs DECIDED is untouched: the
`## Reliability Gates` section, the observe / build-tests / integrate kinds, observe-and-sign →
`adopted`, build-tests → a driven-tier verdict, and `green = a signed verdict` all stand. Only the
*relationship* — peer-and-provisional, not ladder-and-complete — changes.

## Consequences

**Good.**
- The corpus stops implying a green is "incomplete" until it's been driven — which matches how the
  world already renders it (a covered cap is as green as a driven one) and removes the contradiction the
  owner hit (a green crown over "lesser" plants).
- "Grow the floor when reality reveals a gap" becomes a *uniform* response, not an adopted-only patch —
  a driven pocket is honestly as open to a new regression gate as an observed one.
- The honest provenance survives: `adopted` still records the observe basis for audit + for targeting
  where to grow coverage next, without dressing it as a lesser green.
- No code change, no data migration — the verdict shape and every roll-up are unchanged; this is a
  decision-log reframing the running system already embodies.

**Bad / costs / follow-on (surfaced, not buried).**
- **The `adopted` label can still be *read* as a tier** by someone who skims. Mitigated by this ADR and
  the reframed prose; if it proves misleading in practice, collapsing the distinction entirely (one
  green, no basis label) is the named heavier alternative — a verdict-shape + stored-data change that
  also loses the "never witnessed failing" audit record.
- **Reword, not rewrite.** ADR-0085 / 0097 / 0098 keep their bodies (copy-on-write,
  [ADR-0086](0086-librarian-curated-adr-lifecycle-supersede-authority-copy-on.md) *(superseded by*
  *[ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md))*); this ADR carries the
  reframing and they gain light dated cross-reference notes pointing here, so a reader of the old
  "weaker / cheap / real" lines is sent to the peer framing. The `librarian-curator` applies those notes
  + the `amends` edges + any glossary reconciliation (`mapped` = "observational, never healthy" predates
  the `adopted` exit and should read as a basis, not a rank) *(the glossary itself is retired by*
  *[ADR-0135](0135-retire-docs-glossary-md-the-library-is-the-sole-term-authori.md))*.
- **No new enforcement.** This is a framing decision; it adds no gate. The vacuity-of-a-driven-test
  concern it names is already an open strengthening
  ([ADR-0098](0098-a-build-tests-capable-inner-loop-refactor-for-testability-ea.md) §2's optional
  mutation / fault-injection follow-on), not opened here.

## References

- [ADR-0085](0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md) — brownfield
  reliability gates + observe / build-tests + the `adopted` mode (**amended**: the `adopted` basis is
  peer provenance, not a "weaker" basis; the expandable floor applies to driven pockets too).
- [ADR-0097](0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md) — brownfield go-green
  is a proving process (**amended**: adopt and drive are peer best-efforts, not "cheap first step" vs
  "REAL WORK"; both earn a provisional green). Its §5 per-cap display completion (Option A) is where the
  equal-green treatment already landed.
- [ADR-0098](0098-a-build-tests-capable-inner-loop-refactor-for-testability-ea.md) — the build-tests
  inner loop (**amended**: a driven verdict carries a different *basis*, not a higher *rank*; "real
  coverage vs merely observed" reads as peer provenance; the vacuity bound it concedes is itself the
  proof that a driven green is provisional too).
- [ADR-0016](0016-knowledge-code-binding-and-staleness.md) — binding-staleness / drift: a once-driven
  green goes stale when its code changes — the standing proof that a driven green is provisional.
- [ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md) — verdict-derived green;
  drift rides alongside status without downgrading it (the pattern `adopted`-as-neutral-provenance
  follows).
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) / [ADR-0007](0007-proof-model.md) —
  `green = a signed verdict`; the proof modes (both preserved; `adopted` stays, re-read as
  value-neutral).
- [ADR-0099](0099-synthetic-smoke-verdicts-must-not-derive-a-green-unit.md) — its Option A echoes
  ADR-0085's "weaker" wording; reframe that cross-reference to "records a different basis, never
  silently equated with a driven pass."
- [ADR-0086](0086-librarian-curated-adr-lifecycle-supersede-authority-copy-on.md) — the copy-on-write
  rule under which this reframing is a NEW ADR, not an in-place body edit of 0085 / 0097 / 0098
  *(superseded — the discipline is now carried by [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md))*.
- [ADR-0084](0084-agents-may-flip-an-adr-green.md) — the policy under which this ADR's `status:` flip was
  applied.
