---
status: accepted
decided: 2026-08-08
arc: session-cost-arc
amends: [182]
load_bearing: true
---
# ADR-0325: Exploration is delegated to a disposable-context leaf, and every agent is tiered

## Status

accepted (2026-08-08) — decided/directed by the owner in conversation on 2026-08-08. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

The rule that exploratory sweeps belong in a disposable subagent context is NOT new and is not
decided here: `asset:delegate-exploration-to-digest-subagents` settled it on 2026-07-16, from a
~10.6B-token trace study, and `session-orchestrator` cites it. ADR-0323 D1 re-affirms it and reports
that it is not being followed. This ADR fixes the structural reason.

**The principle had no delegate of its own.** Its "How to apply" says to spawn *"the `Explore` agent,
or a general read-only agent"* — a pointer at a harness built-in, because the factory has no agent
that fits: EIGHT of the nine delegatable library `agent`
artifacts are AUTHORS or ADJUDICATORS with write authority and a durable output
(`story-author` writes the hierarchy, `planner` writes a plan, `librarian-curator` curates,
`glue-worker` edits). The ninth, and the only read-only one, is `corpus-investigator` — and it is
deliberately narrow: it verifies ONE claim about live corpus state and returns a verdict. Neither shape covers the
commonest expensive thing a session does: *"sweep the repo/corpus and tell me what's there"*, with
the answer's shape unknown in advance.

So following the principle meant reaching for something the factory neither owns nor tiers, and the
measurement shows both ways that decays: 246 of 1,033 bash calls (24%) were ad-hoc inline inspection
(the rule ignored), and the single observed `Explore` spawn ran on **opus-5** — $1.86 for a grep
sweep — because built-in agents carry no model pin and inherit the spawning session's tier (the rule
followed, expensively). A principle whose only delegate is unowned and untierable decays into inline
sweeps; that is a tooling gap, not a discipline gap, and exhortation will not close it.

The tier picture across the nine library agents (from their `model:` frontmatter, ADR-0182):

| agent                  | tier   | profile                                        |
|------------------------|--------|------------------------------------------------|
| graduation-synthesist  | opus   | adjudicates — decides what is true and routes   |
| guidance-curator       | opus   | decides whether a rule is true and durable      |
| planner                | opus   | ADR-0183 D5 names it expensive-tier by design   |
| story-author           | opus   | bounds a journey; owner-directed to STAY opus   |
| librarian-curator      | opus   | sweep-compare-correct — **workhorse profile**   |
| corpus-investigator    | sonnet | correct                                          |
| friction-analyst       | sonnet | correct                                          |
| frontend-builder       | sonnet | correct                                          |
| glue-worker            | sonnet | correct                                          |

Eight of nine are tiered defensibly. `librarian-curator` is the one mismatch and ADR-0324 D3 flips it.
The systemic gap is elsewhere: the harness BUILT-INS (`Explore`, `general-purpose`, `Plan`) are not
library artifacts, have no `model:` frontmatter to pin, and therefore inherit opus silently. Tiering
by artifact only covers agents this factory authors.

The owner directed the delegate be named `explorer`, and be reachable as `scout` and `probe`. The
`agent` schema has no alias concept; ADR-0182 established the exact precedent for adding one
(an optional field on `buildKindSchema("agent").extend({...})`, read by the renderers into
frontmatter, never a `KIND_SPECS` body section, no `CURRENT_SCHEMA_VERSION` bump, no migration).

## Decision

**D1 — A new library `agent` artifact, `explorer`, is the named delegate for exploratory sweeps.**
Read-only: it searches, reads, and returns a SUMMARISED finding with citations
(`file_path:line`), and writes nothing. It is the first choice for ADR-0323 D1 work and is preferred
over the harness built-in `Explore` for the reason D3 gives — a library agent can be tiered and
versioned, a built-in cannot. Its value is that its context dies with it: the sweep's raw output is
never charged to the parent again.

**D2 — `explorer` runs on `sonnet`.** Locating and summarising is the workhorse profile in ADR-0182's
split. An exploration leaf that reasons like a judge is paying opus rates to run `grep`.

**D3 — Built-in harness agents are pinned at the SPAWN, since they cannot be pinned at rest.** Any
spawn of `Explore`, `general-purpose`, or `Plan` passes an explicit non-opus `model`. This is
DISCIPLINE, not a mechanical fence, and is stated as such: no runtime enforces it, exactly as
ADR-0309 D3 records for agent tool scopes. `explorer` exists partly so this discipline is rarely
needed — a pinned artifact cannot be forgotten the way a per-call argument can.

**D4 — The `agent` kind gains an optional `aliases` field, and `explorer` carries
`["scout", "probe"]`.** Follows the ADR-0182 shape exactly: optional, schema-level metadata, read by
the renderers, never a body section, no schema-version bump, no migration, `.strict()` and the
discriminated union preserved.

**What D4 does and does not buy — stated plainly, because the distinction is easy to misread.** The
harness resolves `subagent_type` by the `name` frontmatter ALONE. That contract is Claude Code's, not
this factory's, so an alias cannot become a second spawnable name without generating a duplicate
agent file — which is refused: every generated agent file is listed in every session's system prompt,
so a duplicate would add ~85k-token-scale preamble weight per session to save typing, in an arc whose
entire subject is preamble weight (ADR-0323 D3). Therefore: **the canonical spawn name is `explorer`,
always.** Aliases are DISCOVERY metadata — rendered into the generated `description` so a session
reaching for "a scout" or "a probe" finds `explorer` in the listing, and resolvable by
`storytree agents <alias>` at the CLI. An alias is a synonym in the index, not a second door.

**D5 — `story-author` stays on `opus`, by owner decision.** Recorded rather than defaulted: bounding
one provable journey is a judgment call about scope, and the owner directed it explicitly in the
conversation that produced this arc. This is the ADR-0323 D4 principle applied to tiering — a tier
should be a decision someone made, not an omission nobody noticed.

## Consequences

**Good.** Exploratory sweeps stop accumulating in the main thread, which is the mechanism behind
ADR-0323's 10–40× downstream-rent multiplier — the largest single lever the measurement identified.
The delegate is tiered once, in an artifact, rather than remembered per call. `aliases` generalises
beyond this agent: any role whose natural name differs from its canonical id can now be found without
minting a second agent.

**Bad / the honest costs.** A subagent pays its own ~85k preamble on its first turn, so delegating a
sweep that would have been two `grep`s is a LOSS. ADR-0323's crossover governs: if you can name the
file and the symbol, read it inline; if you are hunting, delegate. Adding `explorer` also adds one
more entry to the agent listing every session loads — a real, permanent preamble cost, accepted
because the alternative (sessions defaulting to inline sweeps or to an opus built-in) measured worse,
and refused for the alias duplicates in D4 where no such benefit exists.

D3 is the weak decision in this ADR and is worth naming as such: a discipline with no fence is a
discipline that will be forgotten, and the measurement will show it. If future windows still show
opus built-in spawns, the remedy is a harness-level default, not a louder rule.

**Neutral.** ADR-0182 stays accepted and is AMENDED, not superseded: its tier vocabulary
(`inherit`/`sonnet`/`opus`) and its workhorse/judgment split are unchanged and are what D2/D3/D5
apply. What this ADR adds is the `aliases` sibling field and the finding that artifact-level tiering
does not reach built-ins. The `amends: [182]` edge carries it into the load-bearing set transitively
(ADR-0139).

## References

- `asset:delegate-exploration-to-digest-subagents` — the STANDING principle this ADR supplies a
  delegate for; its "How to apply" pointer at the built-in `Explore` is what D1 replaces.
- `asset:exploration-principles` — HOW an explorer behaves once delegated; `explorer` cites it, and
  this ADR deliberately adds no second copy of that behaviour (`asset:reference-dont-restate`).
- ADR-0323 — the measurement, and D1's re-affirmation; the crossover that bounds this ADR's D1.
- ADR-0324 D3 — the sibling tier flip (librarian-curator → sonnet).
- ADR-0182 — the model tier split and the optional-field-on-`agent` precedent D4 follows.
- ADR-0156 / ADR-0161 — the essentials gate the generated `explorer` file must satisfy.
- ADR-0309 D3 — no agent is mechanically tool-fenced; the house wording D3 reuses for its honesty.
- ADR-0183 D5 — `planner` as deliberately expensive-tier; the judgment-side precedent for D5.
- `packages/library/src/knowledge.ts` (`Agent`, `AgentModel`) · `packages/library/src/store/render-agent.ts` (`agentModelFrontmatter`).
