---
status: accepted
decided: 2026-08-01
amends: [252]
arc: verification-integrity-arc
---
# ADR-0278: A fifth verification-decay instrument: an injected seam whose default no test exercises

## Status

accepted (2026-08-01) — decided/directed by the owner in conversation on 2026-08-01. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends** [ADR-0252](0252-verification-decay-detection-continuous-mechanical-warns-a-j.md) — it charters a
FIFTH cheap instrument alongside D1's four. Nothing in ADR-0252 is overturned: the two-phase
discipline, the gate-resident advisory shape (D2), the per-located-finding advisory rule and
per-instrument drain ceiling (D3), the process home (D4), and the blind-instrument escalation line all
govern the new instrument exactly as they govern the other four. What changes is the roster's size,
and therefore the denominator in `chartered coverage: N/4`.

## Context

ADR-0252 D1 chartered exactly four cheap instruments — contract-binding-drift, mirror-pair-drift,
vacuous-proof, warn-list-hygiene — and as of the 2026-08-01 correction to that ADR all four sweep, so
the run prints `chartered coverage: 4/4` and the `NOT swept:` tail is unreachable. The roster is
complete against its charter. This ADR exists because a fifth decay shape was found that the charter
could not have named, since it was not yet known when the four were chosen.

**The shape.** Injecting an IO seam makes a decision provable offline with fixtures, and in the same
move exempts the seam's DEFAULT implementation — the code the binary actually calls — from every test
that injects a fake. The suite gets GREENER the more thoroughly the seam is mocked, so nothing
red-flags the hole; the symptom is a cleaner test file. The rule itself landed as
`asset:a-mocked-seam-leaves-its-default-implementation-unproven` (PR #1052), which states the shape and
its remedy in prose. This ADR decides only whether a MACHINE should locate it.

**Why the existing four cannot.** `vacuous-proof` is the near neighbour and is structurally blind
here: it locates option-form skips (`test(name, { skip: !DB }, fn)`), where a test declines to run.
In this shape every test RUNS and every assertion is TRUE — about a fake. There is no skip, no
`todo`, no empty body, and no false assertion for it to key on. `contract-binding-drift` maps DECLARED
capability contracts to tests by name, and a seam default is not a declared contract.
`mirror-pair-drift` and `warn-list-hygiene` are not on this axis at all. The rest of the verification
floor was checked when the principle was authored and misses it for a stated reason:
`test-creation-principles`' deletion check is applied per test and every one of these tests passes it
honestly, and `test-fixtures-mirror-production-failure-modes` asks whether a fake stages a world more
forgiving than production, which `statMtimeMs: () => 0` does not. Both govern a test that exists;
this is a property of the SUITE, invisible to any check applied one test at a time.

**The measured cost of the last instance.** `packages/cli/src/worktree.ts` split `classifyWorktree`
(pure) from a `WorktreeIo` seam; all 26 pre-existing tests injected a fake and `defaultStatMtimeMs`
had none. The defect lived exactly there — it read the per-worktree admin reflog as an activity
signal, and `git reflog expire --all` rewrites every worktree's reflog in one pass, so no worktree
could age past the 48 h threshold. `storytree worktree prune` reported `reap 5, keep 77` while
reclaiming zero bytes, and `.claude/worktrees/` grew from 21 GB to roughly 93 GB with the suite green
throughout. The fix was about twenty lines. The cost was that a green gate was read as evidence of a
working reaper for weeks.

**A CORRECTION ESTABLISHED BY THIS INCREMENT, recorded because it was load-bearing for the
escalation and is FALSE.** The escalation that raised this fork, and the principle artifact behind it,
both state that `defaultStatMtimeMs` is uncovered TODAY — that the reaper fix "re-keyed the signal and
left the hole". It did not. The fix commit `f4ef42d8` added a NEW sibling file,
`packages/cli/src/worktree-idle-signal.test.ts`, which builds real worktree admin layouts in a temp
directory, stamps real mtimes, and drives the real `defaultWorktreeIo.statMtimeMs` — that being
`defaultStatMtimeMs` — including a named regression test for the reflog-rewrite condition. The claim
arose from searching ONE file (`worktree.test.ts`) where the principle's own remedy says to search
*the package's* test files, and the coverage had landed next door.

**That correction is the argument for the instrument, not against it.** A careful prose audit,
performed by the agent authoring the very rule, got this wrong in the direction that matters — it
reported a hole that was already filled — and the mechanical sweep got it right on the first run
without being told. The same applies to the sizing probe run while framing this decision: a hand-run,
name-keyed scan reported 28 of 28 candidate defaults uncovered, and that number is discarded here
rather than cited, because its word-boundary regex was built through a shell heredoc that collapsed
`\\b` into a literal backspace, so it matched nothing and reported every symbol as uncovered. It was
wrong about `defaultWorktreeIo` and `builtinRealpath`, both genuinely covered. **Three
hand-measurements of this shape were attempted and all three were wrong; the instrument's first sweep
was right.** That is the strongest available evidence that this belongs in a machine.

**Population, measured 2026-08-01 by the instrument itself: 24.** That is the honest first-sweep
baseline through the aperture described in D4, and it sits between `contract-binding-drift` (5) and
`check:coverage` (121) — the readable range the arc's guardrail
`an-advisory-list-stays-readable-or-stops-being-advisory` requires. The shape is a house convention
replicating without its test discipline rather than four isolated misses: the same `builtinRunGit`
appears in both `packages/cli/src/branch.ts` and `packages/drive/src/noticeboard.ts`. Also measured:
`symlinkSync` had zero occurrences repo-wide before this increment, so no test anywhere had driven
link resolution against a real filesystem.

**The sharpest instance is a containment boundary, not a disk-space problem.**
`builtinRealpath` in `packages/drive/src/write-authority.ts` is the resolver behind the ADR-0255 /
ADR-0257 session-isolation write-authority wall. That module's own header declares "FAIL-CLOSED IS
THE WHOLE POINT" and enumerates the traps it encodes — junction/symlink escapes out of a worktree,
Windows drive-letter case, `..` escapes, canonicalising a path that does not exist yet. **Every one
of those is decided by `realpath`**, and all 28 pre-existing tests injected a fake `RealpathFn`. The
suite proved the policy reacts correctly when a fake SAYS a junction resolved somewhere, and proved
nothing about whether the real resolver follows one.

**Demonstrated on this branch, not argued.** Coverage for that default was added first (the owner
directed that ordering), and its grip was then established by mutation: a `builtinRealpath` that
resolves but does NOT follow links — precisely the escape vector the header names — leaves **all 28
pre-existing tests GREEN** and reds only the four new real-substrate tests, including the end-to-end
refusal. The defect class is therefore not hypothetical for this file; it is reproducible on demand.

> **The exemplar file was DELETED on 2026-08-02, after this ADR was accepted — annotated in place
> per ADR-0139; the DECISION is unaffected.** [ADR-0284](0284-the-write-authority-wall-stays-static-worktree-to-worktree-i.md)
> retired the claim-aware half of the write-authority wall, taking `packages/drive/src/write-authority.ts`
> and its suite with it. The two paragraphs above can therefore no longer be re-run against `HEAD`:
> `builtinRealpath`, the 28 fake-injecting tests, and the four real-substrate tests that were **this
> instrument's first drain** are all gone. Three things follow, and only the third is a task:
> 1. **The finding stands and is not weakened.** It was a measured demonstration on a real file at a
>    real commit, and `git show f34b35a7^:packages/drive/src/write-authority.test.ts` reproduces it
>    exactly. An exemplar that later leaves the tree does not retroactively become an argument — and
>    ADR-0284 cites this very defect class approvingly, as one reason the deleted layer was not worth
>    finishing.
> 2. **The instrument is unaffected and still sweeping.** It reads the tree as it is; measured
>    2026-08-02 after the deletion, `check:verification-decay` reports `chartered coverage: 5/5`.
> 3. **~~The ceiling may now be baselined against a population that no longer exists.~~ CLOSED — it
>    was RE-MEASURED, not assumed.** The drained seam left the tree, which SHRINKS the measured
>    population — ADR-0269 governs enlargement, not shrinkage, so nothing forced a re-baseline and
>    nothing would have gone red. That is exactly why it was checked by hand rather than left: a
>    shrinking population quietly loosening a ceiling is the same drift ADR-0269 exists to prevent in
>    the other direction. Measured 2026-08-02 after the deletion (commit `3e8d9b39`): **still 24
>    located against a ceiling of 24** — exactly AT its population and still biting. It gained no
>    slack, because the drained symbol was COVERED and therefore was never in the located set, so
>    removing it took nothing out of the count. The arithmetic is recorded at the number
>    (`packages/cli/src/check-verification-decay.ts`, ADR-0269 4(f)), which is the authority; this
>    ADR carries no live count.
>
> When a fresh exemplar of this shape is wanted, take a live one from the instrument's current warn
> list rather than reviving this one.

## Decision

**1. A fifth cheap instrument is chartered.** It locates injected IO seams whose default
implementation is exercised by no test, and it joins the four of ADR-0252 D1 in the same registry, on
the same terms.

**2. It inherits ADR-0252's frame unchanged — this ADR adds a member, not an exception.** Concretely:
it runs on every `pnpm gate` as a gate-resident WARN (D2); no individual located finding ever blocks
a landing (D3); it carries its OWN drain ceiling, baselined on its OWN first real sweep so it ships
GREEN, and enforcement is on the COUNT and on growth (D3 as scoped by the per-instrument correction);
that ceiling is tightening-only within a fixed measurement aperture and may be re-baselined only when
the aperture genuinely enlarges, under [ADR-0269](0269-a-drain-ceiling-rises-only-when-the-measured-population-enla.md)'s
evidence bar; it SKIPs cleanly where it cannot read; and if it fails to run it trips D1's
blind-instrument escalation line, which reds the gate on its own and is excluded from every counted
total. The two-phase discipline holds: this instrument LOCATES a region, and only adversarial
refutation ESTABLISHES that a given default is genuinely unproven rather than covered by a route the
sweep cannot see.

**3. `chartered coverage: N/4` becomes `N/5`.** The 2026-08-01 correction to ADR-0252 noted that the
`NOT swept:` tail was unreachable "at today's registry", and that a fifth instrument would make it
reachable again. It now is, exactly as that sentence anticipated. No correction to ADR-0252 is
required for this — the reporting mechanism is unchanged and the denominator is read from the
registry, not written in prose.

**4. Not decided here: the aperture.** How the sweep recognises a seam default — the naming
convention, the wiring shape, which directories it walks, and what it deliberately excludes — is a
build-time decision, exactly as ADR-0252's own "Not decided here" clause assigns such calls to the
implementing increment. The 28-symbol probe above is a sizing measurement and must NOT be mistaken for
the aperture; in particular, a name-keyed aperture would inherit that probe's over- and
under-inclusion, and the reasoning for whatever aperture ships belongs AT the ceiling in
`packages/cli/src/check-verification-decay.ts` (ADR-0269 4(f)), not in this ADR.

## Consequences

**Good.** The one decay shape known to be invisible to the whole existing floor becomes a machine
fact printed on every gate, instead of prose that a session must remember to apply at the moment it
introduces a seam — which is the moment the principle itself identifies as the trigger, and the
moment nobody is reading the Library. The evidence for chartering it is unusually strong for a
verification instrument: a measured 72 GB cost, a blind spot that survived its own repair, a
28-of-28 population sweep, and a reproducible mutation on a containment boundary. And because the
instrument inherits ADR-0252 D3 wholesale, it cannot silently grow into the unbounded advisory list
that ADR's own counter-example warned about.

**Bad, and accepted.** Gate output gets one more advisory line, on a gate ADR-0252 already
acknowledges is noisy. The aperture will be imperfect at first: a name-keyed or wiring-keyed sweep
will both over-locate (pure helpers that need no real-substrate test) and under-locate (defaults that
follow no recognisable convention), so the first sweep's ceiling encodes a population the instrument
can SEE rather than the true one — and a later aperture widening is an ADR-0269 re-baseline, with its
evidence bar, not a quiet bump. The located list is also drained by writing real-substrate tests,
which are slower and more platform-sensitive than the fixtures they sit beside; that cost is real and
is the point.

**One residual, found while building it and permanent.** The coverage oracle asks whether a symbol's
NAME appears in test code, which the principle prescribes and which is drainable by any honest route —
but it means an unrelated identifier COLLISION silences a finding. This was not hypothetical: the
instrument's own first test suite named three real seam defaults, twice in prose and once as a fixture
key, and promptly went silent on all three. Comments and string literals are now excluded, so prose
can never discharge a finding; a fixture that uses a scanned symbol as live code still can, and tests
near a scanned symbol therefore use synthetic names. The alternative oracle — count a symbol covered
only when a test IMPORTS it — was considered and rejected: most of these defaults are module-private
and can never be imported, so it would create a backlog no honest drain could clear, which is worse
than a collision that a rename fixes.

**Explicitly not claimed.** Locating a default with no test does not establish that the default is
wrong, and this instrument asserts only an obligation to LOOK — the same distinction ADR-0252 draws
for its escalation line. Some located defaults will be pure path arithmetic that a real-substrate
test would not meaningfully improve; discharging those is a judgment call made per finding, not a
defect admitted.

## References

- [ADR-0252](0252-verification-decay-detection-continuous-mechanical-warns-a-j.md) — the four-instrument
  charter this amends, and the frame (D1–D4) the fifth inherits unchanged.
- [ADR-0269](0269-a-drain-ceiling-rises-only-when-the-measured-population-enla.md) — the
  population-enlargement rule governing any future re-baseline of this instrument's ceiling.
- [ADR-0255](0255-the-primary-checkout-is-a-read-only-agent-lobby-write-author.md) /
  [ADR-0257](0257-the-write-authority-wall-is-agent-inescapable-and-binds-shar.md) — the write-authority
  wall whose `builtinRealpath` **was** this ADR's sharpest instance and the first drain.
- [ADR-0284](0284-the-write-authority-wall-stays-static-worktree-to-worktree-i.md) — retired that
  layer on 2026-08-02 and deleted the exemplar module and its suite. See the annotation in Context:
  the finding stands (recoverable at `f34b35a7^`), the instrument is unaffected, and the ceiling was
  re-measured against the now-smaller population the same day (24/24, `3e8d9b39`) — **no open item
  remains from that deletion.**
- [ADR-0301](0301-drain-ceilings-charge-by-authorship-verification-decay-and-g.md) — this instrument's
  measured 25/24 breach is what motivated charging decay signals by AUTHORSHIP. It amends ADR-0252's
  frame, which clause 2 above inherits by reference rather than restatement, so nothing here is
  overtaken: the ceiling value is untouched and only whom a breach belongs to moved.
- `asset:a-mocked-seam-leaves-its-default-implementation-unproven` — the principle stating the shape
  and its remedy (ADD a real-substrate test, never replace the fakes); PR #1052.
- `asset:an-advisory-list-stays-readable-or-stops-being-advisory` — the arc guardrail the population
  sizing above answers.
- `packages/cli/src/check-verification-decay.ts` / `packages/cli/src/verification-decay.ts` — the
  instrument registry and pure judge; where the aperture and ceiling are recorded and reasoned.
- `packages/drive/src/write-authority.test.ts` — the first drain, and the mutation demonstration
  described in Context. *(**Deleted 2026-08-02 by ADR-0284**; read it at
  `git show f34b35a7^:packages/drive/src/write-authority.test.ts`.)*
