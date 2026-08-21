---
status: accepted
decided: 2026-08-22
arc: anti-slop-adoption-arc
---
# ADR-0407: Adopt the anti-slop rule set as the house TypeScript standard, one rule at a time

## Status

accepted (2026-08-22) — decided/directed by the owner in conversation on 2026-08-21. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask. Recorded here on 2026-08-22 as
`anti-slop-adoption-arc` increment `inc-02`.

## Context

**storytree has never had a linter.** Not eslint, not biome, not prettier — nothing, in any
workspace, verified across every `package.json`. The only automated opinion this codebase has ever
had about its own TypeScript is `tsc --strict` and the tests. Every line of it was written by a
model.

`dmmulroy/anti-slop` (MIT) is a set of 16 Oxlint rules written by TypeScript practitioners to catch
the specific ways LLM-authored TypeScript goes wrong — assertion chains that defeat the checker,
`unknown` used as a shrug rather than as a boundary, widening that throws away type evidence the
compiler already had. It ships as TypeScript source with the explicit instruction to VENDOR and edit
it rather than depend on it.

**The owner's premise is why this arc exists, and it inverts how the first research pass framed the
finding.** Verbatim: *"We have been AI coding the whole way and this was done by professional
frontend devs that actually know TypeScript."* When a rule fires 612 times, that number is not
primarily a migration cost — it is a MEASUREMENT of the gap between what we produce and what a
practitioner would accept, and it is the first outside opinion this codebase has ever received. The
first research pass costed the volume as a burden and recommended against adoption; the owner
corrected that reading, and the correction is the thesis of the whole arc.

The owner's direction, verbatim: *"I think we land an arc on this and slowly chip away at this until
we either comply fully, or have a view of which of these we would turn off."*

**The measured starting position** (`tools/oxlint/inventory.md`, produced by increment `inc-01` from
the tool itself rather than from greps): 5,383 violations across 10 rules; five rules already at
zero. The largest single rule is `require-safety-comment-for-type-assertion` at 2,007.

**Three forces constrain how this can be adopted.**

1. **The rules cannot see types.** Oxlint's JS plugin API is alpha and explicitly outside semver,
   and these rules match the parse tree with NO type information. `no-runtime-typeof` flags every
   `typeof` expression regardless of context — including three inside anti-slop's own rule
   implementations. A firing is evidence, not a verdict, and genuine false positives are expected.
2. **`gate-machinery-audit-arc` inverted the burden of proof on gate rungs** and deleted fifteen of
   them. Re-addition is explicitly cheap but EVIDENCE-GATED: a rung must name what it caught, when,
   and what would ship without it.
3. **`the-gate-costs-what-the-change-risks-arc` is live**, and its standing direction is to make
   each gate CHEAPER. A concurrency cap and an honest-case guard have both already been refused
   there.

Taken together: a session that finds an eleventh rung appearing on `pnpm gate` with no recorded
decision behind it is entitled to read that as drift and revert it. This ADR is what makes the
adoption legible as a decision rather than an accident, and it states the terms the rung must meet
before it is allowed in at all.

## Decision

**D1 — storytree adopts a linter for the first time: oxlint, with anti-slop VENDORED, not depended
on.** The rules live at `tools/oxlint/anti-slop/`, copied from upstream commit
`6d538555cb151d4121ed51a27db81890eacf8ae9` (MIT), on their author's own instruction to copy and edit
rather than depend. Configuration is `oxlint.config.ts` at the repo root; the command is
`pnpm lint`. **The rules are OURS now** — narrowing a rule (adopting it with an option, or with a
scope we choose) is a first-class outcome alongside adopting or rejecting it wholesale.

**D2 — every rule ends in exactly TWO terminal states: `error` at zero violations, or `off` with a
written reason. `warn` is transitional only.** A rule parked at `warn` indefinitely is precisely the
"kept but weakened" rung `gate-machinery-audit-arc` FENCE ONE names: it buys the APPEARANCE of a
standard without the substance, because a warning nobody must clear is a warning nobody reads.
`warn` is legitimate ONLY while an increment is actively driving that rule's count to zero, and an
increment that ends with a rule still at `warn` has not closed its lane. The reason for each `off`
is recorded on the rule itself in `oxlint.config.ts`, not only on the arc — the file a session
actually opens is the file that must carry the reason.

**D3 — rejections are adjudicated by an LLM JUDGE PANEL, never by a session's own preference.** The
owner directed this, verbatim: *"if we find something want to push back on i think we just do a
panel of llm judges to decide, if we find something our codebase fights against then we do a small
panel to figure out if theres a viable refactor that fits and still passes."* There are TWO panels
and they answer different questions; do not collapse them.

  - **The RULE panel — "is this rule right?"** Convened when a session wants to REJECT a rule. A
    session that merely finds a rule inconvenient, noisy, or expensive to satisfy does not get to
    turn it off. That judgment is exactly what we have no standing to make unaided, since the rules
    encode expertise this codebase demonstrably lacks. A rejection carries the panel's reasoning AND
    its dissent where there was any — a unanimous panel and a 3–2 panel are different evidence and
    must not be recorded identically.
  - **The REFACTOR panel — "our code fights this rule; is there a shape that satisfies both?"**
    Convened when the rule is AGREED CORRECT but the architecture resists it. Deliberately smaller
    ("a small panel", per the owner). It hunts for a viable refactor that still passes; it does not
    hand out exemptions. **"No viable refactor found" is a legitimate result and is the STRONGEST
    available reason to turn a rule off**, as against the weakest, which is that it was tedious.

**D3a — the panels are affordable HERE and are not becoming a general default.** The owner named
this as a deliberate exception, verbatim: *"We dont use llm judge panels much because they are
expensive but in this case i think its viable."* Nothing in this ADR licenses convening a panel on
ordinary work.

**D4 — tests are held to a laxer bar than source, via oxlint `overrides` scoped by test-file
glob.** Owner-decided 2026-08-21. Roughly 60% of the total violation volume sits in test files, and
a test faking a dependency is doing something categorically different from production code lying
about a type. The lane driving a rule to zero adds the `overrides` entry when that rule needs one; a
laxer bar is still a DECIDED bar, so an override carries its reason like any other `off`.

**D5 — `require-safety-comment-for-type-assertion` is REJECTED, off, owner-decided, and it is the
one rejection on this arc that did not go through a panel.** It is the highest-volume rule in the
set by a wide margin (2,007 sites, 2.6x the grep estimate the decision was taken against, which
strengthens rather than weakens it) and the one where AI-driven compliance actively DEFEATS the
rule's own purpose. Its entire value rests on each safety comment being TRUE, and an agent asked to
satisfy it will generate two thousand plausible comments that assert nothing — converting a real
check into documentation-shaped slop. This codebase is AI-authored end to end, so that is the
EXPECTED outcome rather than a risk. Anyone wanting to revisit it takes it to a panel like every
other rule.

**D6 — the gate rung is DEFERRED to the end of the arc and is evidence-gated on the
`gate-machinery-audit-arc` terms. Adopting the rules does NOT commit us to a gate rung.** The lint
rung gets no exemption for being new. It enters `pnpm gate` only if it can name WHAT IT CAUGHT,
WHEN, and WHAT WOULD SHIP WITHOUT IT, with catch instances harvested from the migration itself — and
its wall-clock cost MEASURED and recorded rather than assumed small because oxlint is written in
Rust, since the JS-plugin path runs in Node and is not the Rust fast path. If it cannot produce
catches, the rules remain available as a local `pnpm lint` and the gate does not grow. Until that
decision is taken, `pnpm lint` is a local command and nothing else.

**D7 — whatever survives is also a GUARDRAIL, not only a lint rule.** Catching a pattern at the gate
is the weaker half of the win. Every ratified rule lands in the Library as a `guardrail` or
`principle` so it reaches agent guidance and the pattern stops being WRITTEN in the first place.
Given that this codebase is AI-authored end to end, generation-side prevention is worth more than
detection-side catching, and an adoption that shipped a green lint config without this would have
fixed detection and left generation entirely untouched.

## Consequences

**"We adopted all sixteen" and "we adopted four and rejected twelve with reasons" are EQUALLY
LEGITIMATE endings.** The deliverable is a DECIDED STANDARD, not a compliance score. An adoption
that drove the violation count to zero by turning off everything inconvenient has failed exactly as
badly as one that never started.

**Five doors closed on day one at no migration cost.** `no-object-parameters`, `no-reflect-apply`,
`no-reflect-get`, `no-unknown-type-aliases` and `no-widen-then-assert` measured at zero and are at
`error` now. Three of them were estimated non-zero by grep and turned out clean — the tool disagreed
with the grep and the tool won, which is the same lesson the arc's thesis states about outside
opinions.

**The remaining rules are adopted one lane at a time, and a lane that sprawls has failed.** If a
rule sorted as cheap turns out not to be once its real inventory lands, it comes OUT of that
increment and is parked as its own lane rather than being carried; a lane whose scope grew
mid-flight is how the ratchet stops being legible.

**Every `off` in `oxlint.config.ts` is a live obligation, not a resting state.** A rule sitting
`off` with "not yet adjudicated" is unfinished work with an owning increment, and the config is
where a session finds out which. That is deliberate: the alternative — a wall of warnings nobody
must clear — trains sessions to ignore the linter, which is the precise habit this adoption exists
to avoid.

**The cost is real and is being paid deliberately.** ~5,400 violations is a large migration by any
reading, and this ADR does not pretend otherwise. What it rejects is treating the SIZE of the number
as an argument against the standard: the number measures the gap, and a gap you decline to measure
does not thereby close.

**The bad case this accepts knowingly.** The rules are syntactic, so some lanes will spend real
effort discovering that a rule cannot tell a good pattern from a bad one — `no-runtime-typeof` at
727 firings is the likeliest instance, and `no-conditional-empty-object-spread` (646, of which 564
in production source) collides head-on with `exactOptionalPropertyTypes: true`, a compiler setting
we deliberately turned on. That effort is not wasted — "no viable refactor found" is a real finding
and turns a rule off with the strongest reason available — but it is not free, and a lane may end in
a rejection after paying most of a migration's cost.

**oxlint's own default rules are NOT adopted by this ADR.** They fire 155 times across 14 built-ins
and arrived free with the linter. They are left at their default (warning, non-blocking) severity
and are deliberately out of scope: adopting a rule set someone else designed is a different decision
from adopting oxlint's defaults, and letting 155 unadjudicated findings ride in on this ADR's
authority would be exactly the conflation D2 forbids. They are worth their own increment if anyone
wants them.

## References

- `anti-slop-adoption-arc` (live store: `storytree arc show anti-slop-adoption-arc --pg`) — the
  owner's premise and direction, quoted verbatim; the arc's five end-state clauses.
- `tools/oxlint/inventory.md` — the real per-rule violation inventory produced by increment
  `inc-01`, and the two mechanical traps for measuring it.
- `oxlint.config.ts` — the configuration itself, where each rule's state and reason live.
- ADR-0110 — design-time alignment IS ratification; why this ADR is born `accepted`.
- `gate-machinery-audit-arc` — the inverted burden of proof on gate rungs that D6 defers to, and
  FENCE ONE's "kept but weakened", which D2 names.
- `the-gate-costs-what-the-change-risks-arc` — the live standing direction to make each gate
  cheaper, which D6 keeps faith with.
- `dmmulroy/anti-slop` (MIT), upstream commit `6d538555cb151d4121ed51a27db81890eacf8ae9` — the
  vendored source, and its author's instruction to copy and edit rather than depend.
