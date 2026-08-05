---
status: proposed
arc: first-class-edges-arc
amends: [270]
---
# ADR-0310: Edges are addressable objects in a typed claim namespace

## Status

proposed — 2026-08-05. The owner directed the DIRECTION ("i was thinking that the pathways/edges
between story nodes probably needs to behave like a its own node that can be claimed") and directed a
session to explore and land it, but did not direct any of the four decisions below; under ADR-0110
that makes this `proposed`, not `accepted`. D1 and D2 are additionally the ones that measurement
supports outright; D3 and D4 are a reasoned bet the owner should be able to refuse — see the
falsifier on `first-class-edges-arc`.

## Context

An edge between two story nodes has no identity. `depends_on` and `consumed_by` are bare `z.array(z.string())`
in story frontmatter (`packages/library/src/schema.ts`); the routed edge the map draws is
`TrailEdgeOut { from, to, segments }` with no id of its own
(`packages/forest-world/src/routing.ts:77`); only the drawn segments carry ids. Measured on
2026-08-05: 127 distinct declared story-to-story edges across 45 stories — 118 consumer-side
`depends_on` plus 11 provider-side `consumed_by`, with not one edge declared from both ends. Nearly
three times as many edges as nodes, and none of them nameable. So this ADR builds an object; it does
not expose a latent one.

The direction arrived from `claim-grain-is-a-fourth-coupling-channel` (parked on
`session-decoupling-arc`), which measured three sessions serialising 64 and 71 minutes behind a single
arc-grain claim on `verification-integrity-arc`. That incident is real and the machinery held
throughout — refused, queued, promoted, all four sessions landed (#1133–#1136). It had never been
placed against the whole history, because no CLI verb reads `events.claim_event`.

**This ADR ran that query, and it reframes the problem.** Over the ledger's full 40-day life — 1,864
events, 207 distinct unit ids, 331 sessions — there are 56 `conflict-refused` events:

| grain of the claimed id | events | distinct units | refusals |
|---|---|---|---|
| story | 1,099 | 45 | **48** (86%) |
| capability | 620 | 121 | 4 (7%) |
| arc | 63 | 15 | 3 (5%) |
| resolves to nothing | 84 | 26 | 1 |

Three things follow, each weightier than the incident that started this.

1. **Arc-grain contention is the smallest real channel, not the largest** — three refusals ever, two
   of them the motivating incident. The dominant contention is hot STORY nodes: `website-experience`
   9, `cli` 7, `forest-world` 6, `library-tech-tree-overlay` 5, `library` 5, `notice-board` 4. The
   parent fork's four options were being priced against 5% of the problem.
2. **ADR-0270 D1 works where it is used, and is the minority practice.** Per claim event, story grain
   refuses at 4.4% and capability grain at 0.65% — roughly seven times better, across 121 distinct
   capabilities. But sessions took 1,099 story-grain events against 620 capability-grain ones, so the
   mandated finer grain is chosen less than half the time. That is a compliance gap, not a design
   gap, and no new claimable object fixes it. This ADR `amends` ADR-0270 to record that, without
   disturbing D1's rule.
3. **The claim namespace has no validation at all.** Twenty-six distinct claimed ids — 84 events —
   name nothing in the story tree, and `git log --diff-filter=A` confirms they never did at any
   commit: `whoami`, `drive`, `friction-loop`, `library-corpus`, `adr-decision-log`,
   `write-authority`, `session-claim-ledger`, `spawn-uat-demo-2`, and twice a PATH where an id
   belonged (`stories/studio`, `stories/website-experience`). `packages/drive/src/noticeboard-claims.ts:274`
   answers "the story wisp is lit" for any string; `packages/cli/src/check-declared.ts` performs no
   tree resolution, because ADR-0270 D3 made it deliberately grade- and tier-blind. A session that
   typos its claim holds a claim on a phantom, protects nothing, contends with nobody, and passes the
   gate green.

Finding 3 is the forcing constraint on ordering: a new claimable KIND cannot be added honestly to a
namespace with no discipline, because nothing distinguishes a legitimate edge claim from a typo —
both are unrecognised strings.

Finally, the honest position on the owner's own justification: **on this evidence, edge claims would
have prevented zero of the 56 refusals.** Every one was on a node, and the hot ones are single
stories under sustained parallel pressure, not glue between two stories. The case for edge identity
rests on ADDRESSABILITY, not contention.

## Decision

**D1. `events.claim_event` gets a read verb, and it ships first.** The audit log is the only
instrument that shows TRANSITIONS (`claimed` / `reclaimed` / `released` / `promoted` /
`conflict-refused` / `upgraded` / `downgraded` / `queued`); the board shows only STATE. A
point-in-time board read cannot distinguish "refused and about to queue" from "never claimed" — that
exact confusion produced a wrong report to the owner on 2026-08-04 which had to be retracted. Every
number in this ADR required hand-written one-shot scripts against the table. That is the cheapest
useful item on this list and it serves every future coordination question, including the falsifier
below.

**D2. The claim namespace becomes typed and resolvable.** A claim names a KIND — story, capability,
arc, edge — and an id that resolves to a real object of that kind. An id resolving to nothing is
REFUSED at the point of claiming, naming the near-miss, instead of being accepted and reported as a
lit wisp. `check:declared` verifies resolution rather than mere presence. This does not re-open
ADR-0270 D3: that decision made the rung blind to GRADE and TIER, deliberately, so that it fences
against having no claim rather than against having the wrong one. Refusing an id that names nothing
is orthogonal — it is not a judgment about which grain a session chose, and a phantom claim is not a
"wrong grain", it is the absence D3 already means to catch, wearing a string.

**D3. An edge's identity is DERIVED from `{from, to}`, never authored.** The composite of the two
endpoint ids is the address. Rationale: it is already the key the entire render pipeline uses —
`TrailEdgeOut` carries `{from, to}`, and `neighbourHighlightPlan` matches incident edges on exactly
that pair — so a derived id cannot drift from the declaration that produces it, needs no third home,
and needs no uniqueness gate. The accepted cost is that the address is not stable under a story
rename; a rename rewrites edge addresses, and any claim held on one is orphaned. That is the right
trade at 127 edges with renames rare, and it is the same trade the routing layer already makes.

Note the one wrinkle the schema permits and practice has not yet hit: an edge `A→B` may be declared
consumer-side in A's `depends_on` OR provider-side in B's `consumed_by` (ADR-0074 §4), and
`mergeDeclaredGraph` folds both into one directed graph. The declaration SITE is therefore ambiguous
while the edge itself is not — which is another argument for deriving from the merged `{from, to}`
pair rather than from wherever the text happens to sit. Measured: zero edges are currently declared
from both ends.

**D4. The edge declaration stays disk-canonical; only the claim on it is live.** The edge remains
authored in story frontmatter under `stories/**`, owned by `story-author` (ADR-0192 landlord rule);
the claim is a live-store row, exactly as for a story. This is NOT the two-home contradiction
ADR-0288 D6 warns about — the edge is derived from disk and the claim is live, which is precisely
the existing arrangement for every node claimed today.

**The enforcing half does not change.** `packages/drive/src/node-build.ts` takes its write-claim on
`spec.id` for a node it BUILDS. An edge has no proof mode and no test, so it is not buildable and
never reaches that path. Option (c) of the parent fork foundered on exactly this wall for parked
entries; the wall does not transfer to edges — but only once D2 exists, so the ledger can tell an
edge kind from junk.

## Consequences

**Good.** The instrument arrives before the build that depends on it, so this arc can be falsified
cheaply rather than defended expensively. D2 fixes a live silent failure that has run for forty days
and is worth landing whatever happens to edges. D3/D4 give the seam between two stories — where
cross-story glue and declared-edge drift already live (`check:declared`, `artifact_edges`, ADR-0166)
— an address it has never had, and unlike the parked-entry claim of the parent fork's option (c),
there is somewhere real on the map for a wisp to sit: the edge's own routed trail segments.

**Bad, and stated plainly.** D3 and D4 are a bet. No measured refusal would have been prevented by
them, and the arc carries a binding falsifier: thirty days after D1 ships, if no claim was taken at
edge grain and no refusal occurred that an edge claim would have prevented, D3/D4 must be
re-justified on addressability alone — with the owner told the claiming rationale did not survive —
or dropped. D3's derived address is rename-fragile by construction. And the 127-edge namespace is
nearly 3× the node namespace, so a typed namespace inherits a much larger surface to resolve against.

**Sequencing.** D2 strengthens `check:declared`, which `gate-machinery-audit-arc` is auditing with a
standing bias to DELETE — confirm that rung survives before hardening it. The map work must not
collide with the ADR-0242 `trail-lit` selection lane shipped in PR #923
(`map-connection-legibility-arc`, closed and owner-attested): a claim wisp is a distinct lane, not a
reuse of that one.

**Not settled here.** Whether the claim unit should generalise to "any addressable object in the work
graph" — covering substrate and parked entries too — was put to the owner on 2026-08-04 and not
answered. It stays an owner question. The measurement makes the wider frame weaker rather than
stronger: the genuinely homeless work is cross-cutting SUBSTRATE (`gate-run.ts`,
`graduation-drain.ts`, under all 47 stories), and an edge connects exactly two nodes, so edge
identity homes none of it.

**Not a concurrency cap.** Every decision here removes coupling by making things finer and more
precisely addressable, or adds an instrument. The owner rejected a cap on 2026-08-04 on the ground
that the system was divided into story nodes precisely so work could run in parallel; nothing here
reinstates one.

## References

- `first-class-edges-arc` — the owning arc, carrying the falsifier and the increment plan.
- ADR-0270 — capability-grain claims (D1) and the grade/tier-blind `check:declared` (D3); amended
  here with the adoption measurement, rule undisturbed.
- ADR-0298 — made a parked entry on an arc the unit of dispatch, which is what moved claims to arc
  grain.
- ADR-0200 — the noticeboard as the deterministic claim ledger; `events.claim_event` is its audit log.
- ADR-0121 — the enforcing half in `node-build.ts` that keys on `spec.id`.
- ADR-0192 — the landlord rule that keeps the edge declaration disk-canonical.
- ADR-0074 §4 — provider-side `consumed_by` declaration, the source of the declaration-site ambiguity.
- ADR-0166 — `artifact_edges`, today's only per-edge annotation.
- ADR-0242 / PR #923 — the `trail-lit` selection lane the claim render must not collide with.
- ADR-0223 / `directional-dag-arc` — the same first-class-edge question for the KNOWLEDGE graph's
  `standsOn` edge; sibling, not parent (see the arc's parked sequencing note).
- `packages/library/src/schema.ts`, `packages/forest-world/src/routing.ts`,
  `packages/drive/src/noticeboard-claims.ts`, `packages/cli/src/check-declared.ts`,
  `packages/library/src/store/schema.sql` (`events.claim_event`).
