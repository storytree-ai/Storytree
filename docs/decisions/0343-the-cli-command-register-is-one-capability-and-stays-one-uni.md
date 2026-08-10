---
status: accepted
decided: 2026-08-10
arc: parallel-session-dispatch-arc
amends: [342]
---
# ADR-0343: The CLI command register is one capability, and stays one unit

## Status

accepted (2026-08-10) — owner-directed in conversation, on reading ADR-0342: *"we shouldn't be
decomposing the cli commands register, it could be split into separate files but as a capability it
should just be one unit — can you land an ADR on this so it doesn't get brought up again."* That is
design-time direction and therefore ratification (ADR-0110).

This is a STANDING architectural fence, not a second cost argument. ADR-0342 declined the
decomposition on a measurement; this ADR records that the decomposition was never architecturally
available in the first place, so no future measurement can reopen it.

## Context

ADR-0340 named `packages/cli/src/commands.ts` as one of nine shared registry surfaces serialising
parallel work. ADR-0341 ranked it second and left it as an open owner fork. ADR-0342 measured it and
declined: a fix confines only 31.0%–59.7% of the file's churn against a modelled +1.7% that assumes
100%, and the CLI's single strict `parseArgs` before dispatch makes a central flag enumeration
structural.

All three framed the question as **an economic one** — is the refactor worth its price? None of them
consulted the work hierarchy, which had already answered a different and prior question: **is this
surface one unit or many?**

It is one, and it is already modelled as one:

- `stories/cli/story.md` — *"The CLI — one agent-facing command surface that wires every organism
  together"*, whose outcome is *"Every organism is reachable through **one** agent-facing CLI…the
  **composition root** that wires the system into one command."* It is a pure SOURCE hub
  (ADR-0102): `depends_on: []`, `consumed_by: []`.
- Its first capability is `cli#unified-command-dispatch` — the register itself, whose name is the
  decision. Its guidance already states the shape: *"The shim holds no domain logic — every verb
  forwards into the organism that owns it; the CLI only parses, dispatches, and maps to the
  envelope/exit code."*
- Nine distinct stories cite `commands.ts` as the area branch their verb is reached through
  (`binding-staleness`, `cli`, the three `context-traversal-*` stories, `drive-machinery`,
  `headless-orchestrator`, `library`, `notice-board`).

So the register is not a module that happens to be large. It is a bounded context whose entire
purpose is being singular, and which nine other bounded contexts pass through.

## Decision

**D1 — THE COMMAND REGISTER IS ONE CAPABILITY: `cli#unified-command-dispatch`. IT STAYS ONE UNIT.**
The dispatch path (`main.ts` → `commands.ts:run`, plus the `CLI_OPTIONS` table it parses against) is
a single unit of ownership, a single proof surface, and a single place a verb is resolved. It is not
decomposed into several capabilities, several dispatch entry points, or several flag universes.

**D2 — FILE ORGANISATION IS FREE; CAPABILITY DECOMPOSITION IS REFUSED. THIS IS THE WHOLE
DISTINCTION.** Splitting the register across files is a normal, unremarkable, already-practised
move — `commands.ts` already imports 39 per-command modules (plus eight organism packages), and
adding more is nobody's architectural event. What is refused is treating those files as separate
CAPABILITIES: giving them
independent dispatch, independent argument parsing, or separate ownership in the work hierarchy.
**One unit may live in many files. Many files do not make many units.**

**D3 — THE REASON IS OWNERSHIP, NOT SIZE.** A capability is an organ with one owner (ADR-0192's
landlord rule: one owner per path). Decomposing the register per-command would hand nine stories a
shard each of the one path every verb enters through — nine owners of one entry point, which is the
precise thing the landlord rule exists to prevent. The register's singularity is what makes it
ownable at all: it belongs to `cli`, the composition root, because it belongs to no organism in
particular.

Size is therefore not an argument for splitting it, and neither is churn. A composition root is
*expected* to be touched whenever anything it composes gains a verb. That is the root doing its job,
not a defect in it.

**D4 — WHAT REMAINS PERMITTED, AND IS ARGUABLY OWED.** `commands.ts` still holds inline domain logic
for the library/artifact verbs (`editArtifact`, `dashboard`, `viewArtifact`, `newArtifact`,
`retireArtifact`, `listCategory`, `libraryCheck`, `rawField`, `treeFocus` and their help renderers).
By `unified-command-dispatch`'s OWN guidance — *the shim holds no domain logic* — that is drift, and
moving it into the organism that owns it is **spec conformance, not decomposition.** It is permitted
at any time, needs no ADR, and D1 does not fence it.

It should also not be undertaken expecting a width dividend: ADR-0342 D2 measured that extracting
every one of those bodies *plus* the wiring still confines only 59.7% of the file's commits, and
ADR-0342 D3's central-`parseArgs` finding means the rest is structural. Do it because the spec says
the shim holds no domain logic. Do not do it to move a number.

**D5 — THIS DOES NOT REOPEN, AND CANNOT BE REOPENED BY, A MEASUREMENT.** ADR-0342's numbers stand
and are not re-derived here. The relationship is one-directional: ADR-0342 says the refactor cannot
pay for itself; this ADR says it would not be taken even if it could, because the unit is the
architecture. A future measurement that made `commands.ts` look more expensive would therefore change
nothing — it would be evidence about a fix that is not on the table.

## Consequences

**The recurring question is closed, which was the point.** `commands.ts` has now been raised as a
decomposition candidate across three consecutive ADRs and consumed a full measurement cycle to
decline on cost. The cost argument was correct and was also the wrong frame; a reader who found only
ADR-0342 would reasonably conclude that a better refactor, or a worse number, could revive it. It
cannot. Anyone who reaches this idea again should find D1 and stop.

**A pointer is placed where the idea actually occurs.** A header note on `packages/cli/src/commands.ts`
names this ADR, because the file itself — not the decision log — is where a session stands when the
thought "this should be broken up" arrives.

**The measurement work is not retroactively wasted, but its lesson is sharpened.** ADR-0341 and
ADR-0342 produced a reusable instrument and a genuine de-registry of `node-build.test.ts`, both of
which stand. The lesson to carry forward is that **a candidate surface should be checked against the
work hierarchy before it is measured**: `commands.ts` was named as a registry by a mechanical
≥5%-of-PRs rule (ADR-0341 D3 already recorded that this rule detects shared surfaces well and
predicts width cost badly), and one look at `stories/cli/` would have shown it was a composition root
doing its job. Cheap check, expensive omission.

**Accepted knowingly.** The register will keep appearing at or near the top of any factory-wide churn
or conflict ranking, permanently, and that is now expected rather than actionable. If parallel
dispatch is ever built, `commands.ts` is a surface lanes genuinely contend on, and the remedy is
merge-level coordination — never splitting the unit.

## References

- ADR-0342 — **amended here** (`amends: [342]`): it stays current in full and its measurements are
  untouched, but it declined the decomposition on cost alone and so is not wholly self-describing;
  the decomposition was never architecturally available. Its D2/D3 findings are cited by D4 above.
- ADR-0341 D3 — the ≥5%-of-PRs derivation detects shared surfaces well and predicts width cost badly;
  D1's instrument and D4's `node-build.test.ts` de-registry both stand.
- ADR-0340 — the measurement that first named `commands.ts` among the nine surfaces.
- ADR-0192 — the landlord rule (one owner per path), which D3 applies.
- ADR-0102 — the CLI as a first-class SOURCE hub organism; ADR-0074 §4 — its edges are declared
  provider-side on each spoke.
- ADR-0023 — the choose-your-own-adventure CLI; ADR-0112 — the drive-package extraction that moved
  the build/orchestrate drivers out of `cli`, the precedent for D4's permitted direction.
- ADR-0110 — owner direction in-conversation is ratification, which is why this is born accepted.
- `stories/cli/story.md` and `stories/cli/unified-command-dispatch.md` — the modelled unit this ADR
  records; `packages/cli/src/commands.ts` — the register itself.
