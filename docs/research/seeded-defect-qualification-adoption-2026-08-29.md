# What the seeded-defect experiments earned — 2026-08-29

**Increment:** `adopt-what-the-experiments-earned` · **Arc:** `seeded-defect-qualification-arc` ·
**Decision:** ADR-0474 (D5, reusing ADR-0447 D5)

Three experiments ran. **All three candidate adoptions are refused, each with its measurement as the
reason.** No candidate is left undecided, which is what this increment required.

Under ADR-0447 D5 — reused deliberately by ADR-0474 D5 rather than re-derived — "do not build" is a
first-class outcome and an experiment that refuses a build has paid for itself. The arc's own end
state says the same: *"an arc that spends three experiments and declines to build has bought a
decision, which is the outcome its own end state calls a win."*

---

## The three verdicts

| # | candidate adoption | its own trigger condition | what was measured | outcome |
|---|---|---|---|---|
| 1 | a seeded-defect fixture beside every `check:*` rung | *"if UNQUALIFIED rungs were found"* | 8 rungs, 12 seeded defects (8 canonical + 4 variant), **12 fired, 0 missed** | **REFUSED** |
| 2 | a standing re-injection suite over the harvested mine set | *"if the catch rate was poor"*; if high, *"NOTHING should be built"* | 269 memories harvested → 23 usable mines; 7 re-injected, **7 caught** | **REFUSED** |
| 3 | sealed criteria as a story-authoring practice | *"if the trip rate was material AND the mines were mostly fair"* | 5 units, 5 held-out criteria, **trip rate 0/5** | **REFUSED** |

Full measurements: [`gate-rung-qualification-census-2026-08-29.md`](gate-rung-qualification-census-2026-08-29.md) ·
[`defect-history-reinjection-2026-08-29.md`](defect-history-reinjection-2026-08-29.md) ·
[`sealed-criterion-builder-pilot-2026-08-29.md`](sealed-criterion-builder-pilot-2026-08-29.md).

Every trigger condition failed to fire on its own terms. Not one refusal required a judgement call
beyond reading the number the increment itself asked for.

---

## The two findings that outlast the refusals

**1. The premise was refuted at its own source, and ADR-0474 is corrected in place.**

ADR-0474's Context asserted that the repo's eight catalogued vacuous-green incidents "sit in this
blind spot" — the gate rungs. Classified against the memory bodies: five are **tests**, one is a
**harness floor**, one an ad-hoc **probe**, one an **absent** rung (its memory says outright that no
gate rung catches it), and one names a rung **ADR-0311 D2 retired** whose behaviour that memory calls
expected rather than a defect. **Zero are live gate rungs.** Corrected on `adr-0474` under ADR-0139's
correct-in-place mandate rather than left standing green; D1–D8 are untouched, because the decision
did not change — only a sentence about where the evidence pointed.

**2. The defect class that actually survives is the same mistake in a NEW site — and none of these
three instruments can see it.**

Re-injection returns 100% because it plants each defect at the one site guaranteed to have a
regression test watching it: this factory's fixes ship tests, and the harvest selects on
*"was fixed."* Seeding a gate rung shows the rung fires on the class it was built for. A sealed
criterion asks whether a builder generalises, and on units of this size it does. Meanwhile
`story-baseline.ts` reproduced `criterion-binding.ts`'s exact anchor defect in code written *after*
that defect was found and fixed — a regression test guards its own site, not the next place the same
mistake is made.

That gap is real, it is now located, and **it is deliberately not pursued here.** Mutating new source
and asking whether the suite notices is `test-strength-beyond-red-green-arc`'s subject, parked behind
`oq-is-a-twice-patched-community-plugin-an-acceptable-foundat`. ADR-0474 D8 fences this arc off from
that machinery, and an adoption that needed it would be out of scope by construction. Nothing in this
landing touches `diff-scoped-mutation-rung` or the attribution wire.

---

## Why nothing was kept, including the harnesses

The tempting middle path is to land the census harness as a re-runnable tool so a future author can
qualify a *new* rung. It is refused too, for three reasons and in that order:

1. **No measurement earned it.** D5 forbids building on the strength of the idea, and the census
   found zero unqualified rungs — the tool's yield across a third of the plan was nothing. Landing it
   anyway is exactly the move D5 exists to prevent.
2. **It would rot.** ADR-0474 already concedes that "a seeded-defect fixture beside every check is a
   maintenance surface that will rot if the check's defect class moves." A rotted fixture is a green
   that means nothing — the failure it was built to prevent, one level up.
3. **The evidence says rung authors already do this.** Twelve for twelve, canonical and variant, with
   perfect specificity. An instrument is worth building where the work is unreliable; this work is not.

The method is not lost. Both research documents record the protocol precisely enough to re-run —
assert the target is tracked and clean, apply, **verify the mine landed by re-reading it**, run,
revert, verify the revert, close on a positive control — and that verify step is the load-bearing one
(§5 of the census records two mines that silently failed to land, one of which would have produced a
false UNQUALIFIED verdict).

---

## What this arc hands off, and to whom

**Three live, uninstrumented defects** the harvest surfaced as never fixed. They are ordinary bug
reports, not qualification machinery, and each belongs to the arc that owns its surface — not here:

- `library artifact <id> --set field=value --pg` **silently behaves as a read** when the `edit` verb
  is omitted: exit 0, full artifact render, nothing written. Its own `--out` footer prints the
  verbless form as the suggested next command, and CLAUDE.md's ADR-0361 long-prose recipe reproduces
  it. **This one corrupted this arc's own measurement** before a read-back caught it (census §5.1),
  and a previously recorded incident had six scripted field writes silently no-op while the script
  logged six successes. It is the highest-value of the three.
- `classifyWideningTarget` consults the type-alias environment but never the interface environment,
  so an interface reference escapes a rule a structurally identical alias would still flag.
- `isMutableSource` implements two of the three exclusions its own docstring claims, so a committed
  data fixture outside a `*.test.ts` file is mutated word-by-word.

**One measured property worth remembering:** regression-test retention is ~100% across seven defects
in seven packages. When this factory fixes something it writes a test, and that test is still there
and still fires. Nothing measured that before.

**One correction to how the memory tier gets budgeted:** it is **8.6% code-defect history and 62%
process traps.** Anyone costing work against "~200 recorded defects" should cost it against ~23.
