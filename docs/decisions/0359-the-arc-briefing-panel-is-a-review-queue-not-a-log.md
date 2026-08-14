---
status: accepted
decided: 2026-08-12
amends: [314]
arc: arc-drilldown-reviewability-arc
---
# ADR-0359: The arc briefing panel is a review queue, not a log

## Status

accepted (2026-08-12) — decided/directed by the owner in conversation on 2026-08-12. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends** [ADR-0314](0314-the-arc-surface-is-momentum-lanes-with-a-briefing-panel-bars.md) — the
briefing panel (D3) keeps its purpose and its click-through, but its four blocks stop being four
equal blocks: two lead, two fold. It also widens D5's authored-briefing shape by one field. It
overturns nothing: `blocked` stays unlit (D4), the panel stays read-only (D9), and the lane states
are untouched.

Read D2 below as a NARROWING of D3 rather than a widening of it. D3 already scoped the panel to
"what is waiting on the owner — open questions **and anything else halted on their decision**"; a
parked proposal is that second clause, and the implementation simply never carried it. Nothing in
ADR-0314's body is falsified by this ADR, which is why the edge is `amends` and no prose there is
corrected in place (ADR-0139).

## Context

ADR-0314 D3 gave the arc surface a briefing panel and named the three questions a returning owner
asks — what it is about, where it is up to, what comes next — plus `waiting`, the half that makes the
panel somewhere to act. All four shipped as peer sections in
`apps/studio/src/components/ArcSurface.tsx`, each rendering its full list.

Reviewing the shipped surface on 2026-08-12, the owner reported it as the panel they actually use
and named two defects in it.

**The landed log drowns the panel.** "Where it is up to" renders *every* closed increment. Measured
against the live store the same day: `verification-integrity-arc` renders **57** rows,
`traversal-panel-arc` 8, and the section sits at the bottom of a scroll the owner has to travel past
whatever they came for. The owner's words: *"sometimes its very noisy, looks like we have some sort
of log that populates at the bottom, this is not useful."* The information is not worthless — it is
one of D3's three questions — but it is the LEAST perishable of the four blocks and it is drawn at
the same volume as the most perishable.

**Parked work is invisible where the owner looks for it.** `arcBriefing().waiting` is
`rollup.questions` and nothing else (`apps/studio/src/lib/arcSurface.ts`), so a parked increment
appears only under "What comes next", below the fold, styled as queue rather than as something to
read. Live the same day: 3 arcs carry **9** `proposal`-status increments — `traversal-panel-arc` 5,
`codex-factory-parity-arc` 3, `verification-integrity-arc` 1 — and not one of them is reachable from
the block the owner scans. Their words: *"some have proposals but the proposals dont show up on the
waiting on me, so i cant quickly review them."*

**The authored briefing has a picture slot and no analogy slot.** `KIND_SPECS["open-question"]`
already carries an optional `diagram` field whose placeholder names a ` ```mermaid ` fence, and the
studio renders those fences to SVG (ADR-0096, `Markdown.tsx`), so the picture path works end to end
today. What it lacks is the other half of how this owner reads an unfamiliar decision: an ANALOGY.
That preference is durable and repeatedly stated — they reason about this system in organisational
terms (agents as employees, the orchestrator as a manager) — and a question authored without one
costs them a reconstruction round trip that a sentence would have saved.

The forces pulling against the obvious fix. Deleting the landed log outright would make ADR-0267's
"where is it up to" unanswerable from the surface that exists to answer it. And promoting parked
work into `waiting` at the LANE level would light `waiting` on 12 of 13 active arcs — the exact
degeneracy [ADR-0351](0351-the-arc-lane-state-stops-implying-a-session-it-cannot-see-ru.md) D1 just
removed by renaming `running` to `moving`, when every visible lane read the same state and the
vocabulary stopped discriminating.

## Decision

**D1 — "Where it is up to" collapses to one line.** The landed block renders a summary — the count
and the most recent landing, e.g. `57 landed · last 2026-08-12 #1297` — inside a disclosure that is
CLOSED by default and opens to the existing full list. Nothing is deleted: D3's third question stays
answerable in one click, and the CLI's `arc show` is unchanged. "What it is about" and "Waiting on
you" stay always-open; they are the two blocks the owner named as the ones to keep, and they are the
two whose content changes fastest.

**D2 — "Waiting on you" carries proposals, as a second and visibly distinct group.** The block
becomes two labelled groups: authored open questions (unchanged, first — they are answerable now),
then `proposal`-status increments as "Proposals to review". Each proposal keeps the same
click-through contract as a question: a real `#/asset/<id>` href, plain left-click opening the
in-place overlay.

**D3 — `ready` and `active` increments stay under "What comes next", and are NOT waiting.** The line
is decided work versus undecided: under [ADR-0305](0305-arcs-hold-increments-one-durable-typed-tier-replaces-increme.md)
D2's `proposal → ready → active → closed`, a `proposal` is work whose shape is still open to the
owner's review, while `ready`/`active` are already dispatched. Promoting all unlanded work would put
every arc's whole queue in the block that is supposed to mean "this needs you".

**D4 — the LANE state is unchanged: proposals do not light `waiting`.** `arcState` keeps deriving
`waiting` from `rollup.questions` alone. The lane list is a triage index across arcs and must stay
discriminating; the panel is where an arc's contents are read. This is the one place D2 deliberately
does not propagate, and ADR-0351 D1's measurement is why.

**D5 — the open-question template gains an optional `analogy` field, and `question new` prompts for
both it and the diagram.** `analogy` joins `KIND_SPECS["open-question"]` after `context` — optional,
like `diagram` and `recommendation`, since a narrow value choice needs neither. `storytree question
new` gains `--analogy <text|@file>` alongside the existing `--diagram`, and its help and the
escalation guidance name both as expected-by-default for anything structural rather than as exotic
extras. Optional-but-prompted, not required: a mandatory analogy would be padded rather than thought
about, which is worse than none.

## Consequences

- The panel's default height stops scaling with an arc's age. The worst live case falls from 57
  rendered rows to one summary line, and the two blocks the owner reads are both above the fold on
  every arc, not just young ones.
- 9 parked proposals across 3 arcs become reachable from the block the owner scans, without any new
  surface, new route, or new write path — the panel stays read-only (ADR-0314 D9).
- **The lane list and the panel now disagree on purpose, and that is the design.** An arc with
  proposals and no questions shows something under "Waiting on you" while its lane chip reads
  `moving` or `quiet`. A future session will read that as a bug; D4 is why it is not. If the owner
  later wants proposals to reach the lane list, the honest move is a distinct chip, never widening
  `waiting`.
- Adding `analogy` to `KIND_SPECS` is additive and optional, so there is NO `CURRENT_SCHEMA_VERSION`
  bump and no migration — every existing open-question doc still validates and renders unchanged
  (the `arcRef` / `Agent.model` precedent). Existing questions simply have no analogy section.
- The three live open-questions gain nothing retroactively. The template change only pays off on the
  next authored escalation, which is the same delayed payoff ADR-0314 D5 accepted.
- **Coordination note, not a conflict.** ADR-0358 (accepted the same day by another session, and
  not yet on `main` — so it is deliberately named here without a link, which would dangle) also
  lands on `OpenQuestion` and `question new`, adding
  `verifiedAt` / `leaseDays`. Those are schema-level metadata OUTSIDE the KIND_SPECS body table;
  `analogy` is a body field inside it. The decisions are complementary and the fields are disjoint —
  whichever lands second merges the other's hunks rather than choosing between them.

## References

- [ADR-0314](0314-the-arc-surface-is-momentum-lanes-with-a-briefing-panel-bars.md) — the surface this
  amends: D3 the briefing panel, D4 the states, D5 the authored briefing shape, D9 read-only.
- [ADR-0351](0351-the-arc-lane-state-stops-implying-a-session-it-cannot-see-ru.md) — D1's measured
  degeneracy, the reason D4 refuses to widen `waiting`.
- [ADR-0305](0305-arcs-hold-increments-one-durable-typed-tier-replaces-increme.md) — the
  `proposal → ready → active → closed` lifecycle D3 draws its line on.
- [ADR-0096](0096-render-mermaid-diagrams-in-the-studio-markdown-surface.md) — mermaid already renders; D5 adds the
  prompt, not the capability.
- `apps/studio/src/components/ArcSurface.tsx` · `apps/studio/src/lib/arcSurface.ts` ·
  `packages/library/src/knowledge.ts` · `packages/arc/src/question.ts` (moved out of `packages/cli`
  by ADR-0369).
