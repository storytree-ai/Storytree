---
status: proposed
arc: first-class-edges-arc
amends: [270]
---
# ADR-0310: The claim namespace is typed and resolvable, and which object becomes addressable next is an owner fork

## Status

proposed — 2026-08-05. The owner directed the exploration ("i was thinking that the pathways/edges
between story nodes probably needs to behave like a its own node that can be claimed"), then WIDENED
it mid-session: weigh a `check:capability-coverage`-style gate against edge-claiming and come back
with a recommendation rather than building edges because that is what the original brief said. None
of the decisions below were directed, so under ADR-0110 this is `proposed`. D1 and D2 are what
measurement supports outright and are unconditional; D3 is a recommendation on the fork, and D4
escalates the question the recommendation cannot settle.

## Context

### What is NOT the problem — stated first, because two earlier framings were wrong

**Package-grain ownership is complete and enforced.** `repo-manifest.json`'s
`packageOwnership.organisms` + `foundational` covers every package on disk — **24 of 24, zero
unmapped** — and `check:boundaries` (ADR-0074, amended ADR-0075/ADR-0100) enforces both that map and
the real cross-package dependency graph. A shared dependency reaching many or all stories
(`@storytree/library` → story `library`, `@storytree/cli` → story `cli`) is the INTENDED
architecture, declared and governed. It is not drift, and nothing here should be read as treating
shared substrate as an accident.

**`gate-run.ts` is not off-map.** `stories/cli` is a node and it owns `packages/cli`. The true
statement is narrower and sharper: `gate-run.ts` sits INSIDE an owned node without being ADDRESSABLE
AS one. An earlier draft of this ADR called such machinery "homeless"; that was misleading and is
corrected here.

### The actual problem — a GRAIN MISMATCH

Ownership is enforced at PACKAGE grain. Claims are taken at CAPABILITY grain (ADR-0270 D1: "claim
the capability you are writing"). **Nothing enforces that the capability layer covers its package.**
So work lands on code with an owning STORY but no owning CAPABILITY, "claim the capability you are
writing" has nothing to bind to, and the session falls upward — to the story, or to the arc. That
fall is the measured 64 and 71 minutes.

No check in the repo runs file→declaration; all three that sound like they would run
declaration→proof, in the opposite direction. `check:coverage` starts only from capabilities already
carrying `proof.real.testFile`, so a file belonging to no capability is never scanned — its own
header calls that real-build filter "the safety net". `check:surface-coverage` asserts a
`process`↔operator-facing-entrypoint bijection: commands, not source files. `check:manifest` refuses
unlisted top-level root entries and loose docs, and says nothing about the inside of a package.

Consequence: a new `.ts` inside an already-owned package, belonging to no capability, lands with
every gate green. Not smuggling — the default path.

### How large the hole is — measured 2026-08-05, and this is the cost argument

509 non-test `.ts`/`.tsx` source files under `packages/*` and `apps/*`, measured two ways:

| definition of "owned" | owned | unowned |
|---|---|---|
| **strict** — matches a declared `proof.real.sourceFile` (the machine-readable binding, 145 patterns, all literal, zero globs) | 111 (21.8%) | **398 (78.2%)** |
| **generous** — any path mentioned anywhere in prose under `stories/**` | 254 (49.9%) | 255 (50.1%) |

The generous figure over-counts ownership (a file named as a *write fence* — "your leaf must NOT edit
this" — reads as owned), so 255 is a floor and the honest number is between the two, nearer the
strict one. Unowned by package under the strict measure: `packages/cli` 91, `apps/studio` 76,
`packages/drive` 38, `packages/orchestrator` 31, `packages/library` 29, `apps/desktop` 26.
`gate-run.ts`, `gate-order.ts` and `graduation-drain.ts` are unowned under BOTH measures — and they
are typical, not exceptional: they are three of 398.

### The claim ledger's own history — 40 days, and it reframes the original brief

No CLI verb reads `events.claim_event`, so the motivating incident had never been placed against the
whole history. Reading all of it (1,864 events, 207 unit ids, 331 sessions, 56 `conflict-refused`):

| grain of the claimed id | events | distinct units | refusals |
|---|---|---|---|
| story | 1,099 | 45 | **48** (86%) |
| capability | 620 | 121 | 4 (7%) |
| arc | 63 | 15 | 3 (5%) |
| resolves to nothing | 84 | 26 | 1 |

- **Arc-grain contention is the smallest channel, not the largest** — three refusals ever, two of
  them the motivating incident. The hot spots are story nodes: `website-experience` 9, `cli` 7,
  `forest-world` 6, `library-tech-tree-overlay` 5, `library` 5, `notice-board` 4.
- **ADR-0270 D1 is under-adopted, not failing** — 0.65% refusal per event at capability grain against
  4.4% at story grain, roughly seven times better across 121 distinct capabilities; but sessions took
  1,099 story-grain events to 620 capability-grain ones, so the mandated finer grain is chosen less
  than half the time. A compliance gap, not a design gap. This ADR `amends` ADR-0270 to record it;
  D1's rule is undisturbed. **And the two findings are one fact:** the reason sessions fall to story
  grain is that most files have no capability to name.
- **The claim namespace has no validation at all** — 26 distinct claimed ids name nothing in the
  story tree and, per `git log --all --diff-filter=A`, never did at any commit: `whoami`, `drive`,
  `friction-loop`, `library-corpus`, `adr-decision-log`, `write-authority`, `session-claim-ledger`,
  and twice a PATH pasted where an id belonged (`stories/studio`, `stories/website-experience`).
  `packages/drive/src/noticeboard-claims.ts:274` reports a lit wisp for any string;
  `packages/cli/src/check-declared.ts` performs no tree resolution. A typo'd claim protects nothing,
  contends with nobody, and passes the gate — silently, for forty days.

### The edge question, answered on evidence

An edge genuinely has no identity: `depends_on`/`consumed_by` are bare `z.array(z.string())`
(`packages/library/src/schema.ts:133`), and the routed edge the map draws is
`TrailEdgeOut { from, to, segments }` with no id (`packages/forest-world/src/routing.ts:77`) — only
the drawn segments carry ids. 127 distinct declared story-to-story edges across 45 stories (118
`depends_on` + 11 `consumed_by`, zero declared from both ends).

But **on this evidence edge claims would have prevented zero of the 56 refusals.** Every one was on a
node. The measured incident was substrate-shaped work — machinery under all 47 stories — not
edge-shaped work, which is glue between two specific stories. Edge contention still has no
measurement behind it.

## Decision

**D1. `events.claim_event` gets a read verb, and it ships first — unconditional.** The audit log is
the only instrument that shows TRANSITIONS; the board shows only STATE, and a point-in-time board
read cannot distinguish "refused and about to queue" from "never claimed" — that exact confusion
produced a wrong report to the owner on 2026-08-04 which had to be retracted. Every number in this
ADR required hand-written one-shot scripts. It is a prerequisite for evaluating any remedy here,
including this arc's own falsifier, and it is the cheapest item on the list.

**D2. The claim namespace becomes typed and resolvable — unconditional, and a prerequisite for BOTH
candidates below.** A claim names a KIND and an id that resolves to a real object of that kind; an id
resolving to nothing is REFUSED at the point of claiming, naming the near-miss, instead of being
accepted and reported as a lit wisp. `check:declared` verifies resolution rather than mere presence.
This does not re-open ADR-0270 D3: that made the rung blind to GRADE and TIER so it fences against
having no claim rather than the wrong one; refusing an id that names nothing is orthogonal — a
phantom claim is the absence D3 already means to catch, wearing a string. Whatever object is made
claimable next, this must exist first, or nothing can distinguish a legitimate new kind from a typo.

**D3. RECOMMENDATION on the fork: substrate addressability before edge addressability — the coverage
gate ships REPORT-ONLY first, and its escape hatch must itself be claimable.** Three findings drive
this:

- *Only one candidate targets the measured incident.* The coverage gate attacks the grain mismatch
  that produced the 64/71 minutes; edge-claiming does not, and has no measurement behind it. If only
  one is built, it should be the coverage gate.
- *A hard ratchet is impossible on day one.* 78.2% of source files are unowned under the
  machine-readable binding, and 50.1% under the most generous reading available. A blocking
  `check:capability-coverage` would red the repo against 398 files immediately. So it lands
  REPORT-ONLY — printing the unowned set and its trend — and ratchets only once the number is walked
  down deliberately. Report-only is not a weak version: it is the instrument that makes a 78% hole
  visible for the first time, and it is the same shape as D1.
- *The escape hatch is where this can silently fail.* Declaring 398 files "substrate" to get the gate
  green would satisfy the check and change NOTHING about coupling: substrate with no claimable
  address still leaves "claim the capability you are writing" with nothing to bind to, and sessions
  still fall upward to the arc — the exact hole, re-created with a declaration in front of it. So a
  declared-substrate entry must be an ADDRESSABLE, CLAIMABLE object, or the gate is bookkeeping. That
  is fork option (a) from `claim-grain-is-a-fourth-coupling-channel` with a gate behind it instead of
  a hand-authoring exercise — which is what made (a) look expensive.

They are a SEQUENCE, not rivals: the coverage gate gives substrate an address, edges give glue an
address, and both need D2's typed namespace underneath. Edge addressability is therefore demoted
behind substrate addressability, and remains governed by this arc's falsifier — after D1 ships, if
thirty days show no edge-grain claim and no refusal an edge claim would have prevented, it is
re-justified on addressability alone or dropped.

**D4. The wider rule is escalated to the owner, not decided here.** The owner floated "the claim unit
is any addressable object in the work graph, not just a story node" and has not chosen it. Both
candidates in D3 are INSTANCES of that rule — substrate declarations and edges are each "an
addressable object that is not a story node" — so picking one without settling the rule means doing
the same design twice, and settling the rule makes both fall out of one decision. That is an owner
call under ADR-0303 and is escalated as a landing, not a wait. D1 and D2 proceed regardless, since
every version of the rule needs them.

**D5. IF edges are built — the design, settled now so the fork is a scheduling question rather than
an open design.** This decision is CONDITIONAL: it binds only if D4's fork lands on edges, and
nothing here argues that it should.

- *The address is DERIVED from the merged `{from, to}` pair, never authored.* That pair is already
  the key the whole render pipeline uses — `TrailEdgeOut` carries it and `neighbourHighlightPlan`
  matches incident edges on exactly it — so a derived address cannot drift from the declaration that
  produces it, needs no third home, and needs no uniqueness gate. Accepted cost: the address is not
  stable under a story rename, which orphans any claim held on it. The right trade at 127 edges with
  renames rare, and the same trade the routing layer already makes. Note the schema permits an edge
  `A→B` to be declared consumer-side in A's `depends_on` OR provider-side in B's `consumed_by`
  (ADR-0074 §4), with `mergeDeclaredGraph` folding both into one graph — so the declaration SITE is
  ambiguous while the edge is not, which is a further argument for deriving from the merged pair
  rather than from wherever the text sits. Measured: zero edges are currently declared from both ends.
- *The declaration stays disk-canonical; only the claim is live.* The edge remains authored in story
  frontmatter under `stories/**`, owned by `story-author` (ADR-0192 landlord rule); the claim is a
  live-store row, exactly as for a story. Not the two-home contradiction ADR-0288 D6 warns about —
  that is already the arrangement for every node claimed today.
- *The enforcing half does not change.* `node-build.ts` takes its write-claim on `spec.id` for a node
  it BUILDS; an edge has no proof mode and no test, so it is not buildable and never reaches that
  path. Option (c) of the parent fork foundered on exactly this wall for parked entries; the wall
  does not transfer to edges — but only once D2 exists, so the ledger can tell an edge kind from junk.

## Consequences

**Good.** D1 and D2 are unconditional, independently justified, and unblock every option — so the
owner's fork does not stall the work. D2 fixes a live silent failure that has run for forty days. The
78.2% measurement converts "some machinery is hard to claim" into a number, which is the first time
the grain mismatch has been sized. D3 targets the measured incident rather than the originally-briefed
one, and names the way the coverage gate could pass while changing nothing.

**Bad, and stated plainly.** D3 recommends against building what the owner's original direction asked
for first, on evidence gathered after that direction was given — if the owner wants edges first
anyway that is their call, and the arc keeps the parked entry ready. The coverage gate is a large
exercise: 398 files need a declaration of some kind, and the binding mechanism it would use
(`proof.real.sourceFile`, 145 literal patterns, zero globs) was designed for proof configuration, not
for ownership, so it may need widening before it can carry this. Report-only means the hole stays
open while it is walked down, and a report nobody reads changes nothing.

**Sequencing.** `gate-machinery-audit-arc` is auditing gate rungs with a standing bias to DELETE, so
homing rungs that may be deleted is waste — but that fence covers ~22 rungs, not 398 files, so it
constrains a subset of the exercise rather than gating it. D2 hardens `check:declared`, which is
itself in that audit: confirm the rung survives before investing, though D2's refuse-at-claim-time
half stands alone and is the more important half regardless.

**Not a concurrency cap.** Every decision here removes coupling by making things finer and more
precisely addressable, or adds an instrument. The owner rejected a cap on 2026-08-04 on the ground
that the system was divided into story nodes precisely so work could run in parallel; nothing here
reinstates one.

## References

- `first-class-edges-arc` — the owning arc, carrying the increments and the falsifier.
- ADR-0270 — capability-grain claims (D1) and the grade/tier-blind `check:declared` (D3); amended
  here with the adoption measurement, rule undisturbed.
- ADR-0074 (amended ADR-0075/ADR-0100) — package-grain ownership and `check:boundaries`, the enforced
  layer this ADR does NOT disturb.
- ADR-0298 — made a parked entry on an arc the unit of dispatch, which moved claims to arc grain.
- ADR-0200 — the noticeboard as the deterministic claim ledger; `events.claim_event` is its audit log.
- ADR-0121 — the enforcing half in `node-build.ts` that keys on `spec.id`.
- ADR-0192 — the landlord rule keeping story-tree declarations disk-canonical.
- ADR-0016 — the re-anchorable code binding; `Anchor.file` is the per-contract file binding.
- ADR-0242 / PR #923 — the `trail-lit` selection lane any future edge render must not collide with.
- ADR-0223 / `directional-dag-arc` — the same first-class-edge question for the knowledge graph's
  `standsOn` edge; sibling, not parent.
- `repo-manifest.json` (`packageOwnership`), `packages/cli/src/check-coverage.ts`,
  `packages/cli/src/check-declared.ts`, `packages/drive/src/noticeboard-claims.ts`,
  `packages/library/src/schema.ts`, `packages/forest-world/src/routing.ts`,
  `packages/library/src/store/schema.sql` (`events.claim_event`).
