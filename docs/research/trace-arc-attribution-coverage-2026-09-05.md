# Can a traversal trace say which arc it belongs to? — measured coverage, 2026-09-05

Evidence for increment `trace-says-which-arc-it-belongs-to` on `replay-answers-retrieval-ease-arc`.
The owner's complaint: *"i can't tell what arc each session was working on if any, the left panel
just shows me trace/session ids."*

**This is a READING of coverage, never a compliance score** — the same posture
`traversal origin --census` takes. A session that recorded nothing is not in breach of anything;
the honest response to a low share is to distrust the derived figure, not to chase the sessions.

**Re-derive nothing from this file by hand.** The queries are reproducible against the live store
plus `~/.storytree/traces`; the method is stated below so a later reader can re-run rather than
re-invent it.

---

## 0. The first finding: there are TWO trace populations, and the panel shows the smaller-covered one

| store | sessions | span | read by |
|---|---|---|---|
| local JSONL `~/.storytree/traces` | **885** | 2026-06-08 .. 2026-09-05 | **the studio panel** |
| shared Postgres `events.traversal_event` | 96 | 2026-08-29 .. 2026-09-04 | the CLI only |

`apps/studio/server/traversalApi.ts:64-67` reads the local sink and nothing else; its own header
says shipping traces anywhere shared is out of scope, and `PgTraversalEventStore` has zero
references under `apps/studio`. ADR-0484 D6 kept history local and unmigrated on purpose.

**So every coverage figure below is quoted over the 885, because that is the list the owner is
looking at.** Quoting the 96-session shared store instead would flatter every number roughly
threefold — its population is entirely post-2026-08-29, which is exactly the era with the best
coverage.

## 1. The fields are already computed, then discarded one line later

`summarizeTraversalSession` (`packages/context-traversal-capture/src/sink.ts:317-335`) returns a
fully-populated `TraversalSessionSummary`:

```ts
{ sessionId; eventCount; lastObservedAt;
  identity: "window"|"declared"|"slot"|"mixed";
  slots: readonly string[];                      // every worktree slot recorded
  origin: { reading: "human"|"cut"|"unknown"|"mixed"; cutBy: string[]; cutFor: string[] } }
```

The handler narrows it to three fields at `traversalApi.ts:172-179`, dropping `slots`, `origin`
(which subsumes `cutBy`/`cutFor`) and `identity`. The client type
(`apps/studio/src/types.ts:936-954`) carries only `sessionId`/`eventCount`/`lastObservedAt`, and the
row renders exactly those (`apps/studio/src/components/TraversalTab.tsx:104-117`).

**This is a wire-shaping omission, not a missing capability.** No new capture, no new computation
and no schema change is needed to put a `cut_for`-derived arc on the row — only stopping the drop.

## 2. Two routes to an arc, and they are not the same kind of evidence

**Route A — DECLARED.** The session said what it was cut to drive. `cut_for` is stamped on every
trace line from the declaration onward (ADR-0484 D7 / ADR-0487); the columns already exist
(`events.traversal_event.origin/cut_by/cut_for`, `schema.sql:623-625`) and the local JSONL carries
the same riders. It is a recorded fact.

⚠ `cut_for` is a MIXED namespace — it holds arc ids (`website-refresh-arc`), increment ids
(`context-window-composition-arc-inc-01`) and bare increment slugs
(`the-cliffs-dark-base-must-read-against-the-sea`). Resolving it to an arc needs the
`Increment.arcRef` lookup, which is required on the kind, so resolution is total: **0 of 18 local
declared values failed to resolve.**

**Route B — INFERRED.** Join the trace's worktree `slot` to `events.claim_event.session_id` (the
claim ledger's session id IS the slot), take the claimed `unit_id`s, resolve each to an arc.

## 3. Coverage over the 885 traces the panel lists

```
Route A — the session DECLARED its unit (cut_for)
  declared                                     18  (2.0%)
  ...resolving to an arc                       18  (2.0%)     [0 unresolved]

Route B — slot -> claim ledger -> arc  (INFERRED)
  yields >=1 arc                              179 (20.2%)
  exactly ONE arc                              96 (10.8%)
  SEVERAL arcs                                 83  (9.4%)
  claimed units but NO arc                     39  (4.4%)

A union B — what the panel could honestly label
  exactly one arc                             100 (11.3%)
  several arcs (list them all)                 84  (9.5%)
  "no arc" — evidenced                         34  (3.8%)
  "arc unknown" — no evidence at all          667 (75.4%)
```

## 4. The gap is HISTORICAL, and it is closing fast

```
month     sessions   has-slot     declared    exactly-1-arc
2026-06         6      0 (  0%)    0 (  0%)      0 (  0%)
2026-07       191      0 (  0%)    0 (  0%)      0 (  0%)
2026-08       628    182 ( 29%)    4 (  1%)     70 ( 11%)
2026-09        60     55 ( 92%)   14 ( 23%)     30 ( 50%)
```

Split by regime, as the four states the panel would render:

```
SEPTEMBER (60 sessions)          AUGUST (628 sessions)
  exactly ONE arc      30 (50%)    exactly ONE arc      70 (11%)
  SEVERAL arcs         10 (17%)    SEVERAL arcs         74 (12%)
  "no arc"             12 (20%)    "no arc"             22 ( 4%)
  "arc unknown"         8 (13%)    "arc unknown"       462 (74%)
                                     [no slot 446, slot but no claim 16]
```

**197 June–July traces carry no worktree identity at all** — the slot rider did not exist yet
(`linked-session-context-arc-inc-30`). For them no route exists at any price: it is not that the
join is lossy, it is that the joinable attribute was never written.

## 5. ⚠ Route B reintroduces the pooling defect the project already measured and removed

Both cases where a session's DECLARED arc disagreed with its claim-derived one are **slot reuse**:

```
slot xenodochial-rosalind-2c7c51
  declared cut_for: land-ground-stack-arc
  claimed units resolve to: adr-0139-consolidation-arc, mutation-rung-weight-arc,
                            follow-the-research-arc, (one unhomed capability)

slot vigilant-herschel-d903a5
  declared cut_for: adopt-the-land-into-the-shipped-map-arc
  claimed units resolve to: prove-unproven-capabilities-arc, (one unhomed capability)
```

The claim ledger keys on the **worktree slot**, and slots are pooled and reused. So Route B does
not attribute *this context window's* arc — it attributes **every arc ever worked in that
worktree**. That is precisely the defect `packages/context-traversal-capture/src/session-identity.ts`
documents at length and that `linked-session-context-arc-inc-30` removed from trace IDENTITY, where
it was the direct cause of a published wrong number ("one document pulled 28 times in one session"
was eleven-plus sessions over 15 days). **It would be reappearing on the arc axis.**

It also means the 10.8% "exactly one arc" is not a clean 10.8%: a slot used once and reused later
yields one arc for BOTH windows, one of which is wrong, and nothing in the output distinguishes
that case.

### Does time-bounding repair it?

Scored against the 27 shared-store sessions that declared a resolvable `cut_for` (the only ground
truth available), restricting the join to claims whose interval overlaps the trace's own span:

```
slack   correct  WRONG  ambiguous  no-claim   precision on the confident set
  0h        9      1        4        13              90%
  1h       10      1        4        12              91%
  6h       10      1        4        12              91%
 24h       10      1        4        12              91%
```

Time-bounding helps and then plateaus. At best it answers confidently for **10 of 27** ground-truth
sessions at **~90% precision** — about **1 in 10 wrong**. ⚠ n=11 on the confident set, so the
precision estimate is itself weak; treat 90% as "roughly nine in ten", not as a measured rate.

## 6. "No arc" and "arc unknown" are different, and the difference is large

The owner's *"if any"* is correct and quantified: **20% of September sessions claimed real work that
belongs to no arc** (capabilities such as `r3f-world-spike`, `terminal-capture-activation`,
`dev-server-persistence-backbone` — 27 distinct unhomed units across the corpus). That is a recorded
fact about the work, not missing data.

Collapsing it with "arc unknown" would report a session that demonstrably worked outside every arc
as one whose arc nobody knows — and would inflate the apparent unknown share of the current regime
from 13% to 33%.

## 7. Method

- Local: parse every `~/.storytree/traces/*.jsonl`; per session take the last non-null `slot`, the
  set of `cutFor`/`origin` riders, and the min/max event `at`. 885 files yielded ≥1 parsable event
  (989 files present; the rest hold no event with an `at`).
- Shared: `events.traversal_event` grouped by `session_id`, taking `max(...) FILTER (WHERE ... IS NOT NULL)`
  for `slot`/`cut_for`/`origin`/`grade`.
- Unit→arc: `events.library_artifact`, `kind='arc'` maps to itself, anything with `arcRef` maps to
  `strip('asset:')`. 2,966 artifacts; 1,761 units resolve to one of 129 arcs.
- Claims: `events.claim_event` grouped by `(session_id, unit_id)` with `min(at)`/`max(at)`
  — 4,365 rows, 859 slots, 809 units, 2026-06-26 .. 2026-09-04.
- **Ambiguity is never collapsed to a single arc anywhere above.** A session resolving to several
  arcs is counted as "several", never silently reduced to the first or the most recent.
