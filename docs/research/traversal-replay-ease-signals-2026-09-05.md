# Can the traversal replay say how easily an agent got what it needed?

**Measured 2026-09-05** for `replay-answers-retrieval-ease-arc-inc-01`. Corpus: 884 local trace files
under `~/.storytree/traces`, 16,812 events, of which 252 sessions are window-keyed (a real context
window; the other 632 session ids are pre-2026-08-22 slot-keyed and are not one session's — see
`context-cost-is-re-reads-not-offers`).

This is an **exploration record**, not a design. It exists so the next session does not re-run these
probes. Nothing here was landed into the panel.

---

## 1. The headline: the vertical axis is not a property of the retrieval

The owner's reading — *"its not really useful at telling me how easy it was for the agent to get what
they needed other than seeing how many hops it did"* — is generous to the panel. The vertical is not
hops at all.

Two different depths exist in the code, named apart on purpose. The authority is the axis resolution
at `apps/studio/src/components/TraversalSpine.tsx:251-260` and the rendered caption at `:394`
(`'depth ↓ corpus distance'`):

> It cannot be resolved in `buildTraversalSpine` instead, which is where the old `parentVisitId`
> depth was: that reading came out of the trace alone, and this one needs the CORPUS.

⚠ The prop JSDoc at `:158-163` still asserted the *opposite* — that the drawn indentation is session
depth — which was true before ADR-0482 and false since. Corrected in this landing; if you are reading
an older checkout, do not trust that comment.

- **Session-traversal depth** (`apps/studio/src/lib/traversalDepth.ts:42`) resolves *only* from the
  recorded `parentVisitId` chain and refuses to infer a parent from order, time or the node graph.
  It is still computed — and **no longer drawn**, kept as the `data-depth` telemetry attribute
  (ADR-0482 D5).
- **The drawn row** (`TraversalSpine.tsx:251-260`) is a render-time join against the corpus:
  **distance over `dependsOn` from the graph's own surface** (ADR-0482 D1).

So the axis measures **where the material sits in the knowledge graph**, not what the agent did to
reach it. An agent that opens one deep artifact directly plots identically to one that crawled there
over ten steps. That is why no amount of re-reading this picture yields an ease reading: *the axis is
a property of the corpus, not of the retrieval.*

Supporting figure: `parentVisitId` — the only field that could carry an actual walk — is present on
**704 of 11,585 read events (6.1%)**.

## 2. The inherited assumption, tested: hop count is orthogonal, not inverted

The increment asked whether hop count might be *inverted* (a long confident walk being easier than
three flailing searches). It is not inverted. It is **null**.

Over 252 window-keyed sessions:

| correlation | r |
|---|---|
| reads vs. distinct artifacts touched | **0.908** |
| reads vs. searches | 0.598 |
| reads vs. session span (minutes) | **0.051** |
| reads vs. searches *per read* | **0.052** |

And across read-count quartiles (240 sessions with ≥3 reads), the searches-per-read ratio — the
closest available proxy for "flailing" — does not rise with hop count:

| quartile | sessions | median reads | searches/read | re-read rate |
|---|---|---|---|---|
| Q1 | 60 | 6 | 0.096 | 0.313 |
| Q2 | 60 | 11 | 0.057 | 0.445 |
| Q3 | 60 | 17 | 0.048 | 0.506 |
| Q4 | 60 | 37 | 0.096 | 0.520 |

**Reading:** hop count is ~82% explained (r² of 0.908) by how many *distinct* artifacts a session
consulted. It does not track elapsed time, and it does not distinguish a confident session from a
flailing one. It is a **breadth-of-material** figure wearing a difficulty label.

⚠ Caveat on the span correlation: session span is first-to-last *observed CLI event*, so a session
with two reads three hours apart scores a 180-minute span. The r=0.051 is honest evidence that reads
do not track elapsed time; it is not a claim that reads are unrelated to effort.

## 3. The five candidate signals, and what the data does to each

| candidate | status | evidence |
|---|---|---|
| **Re-reads** | needs a **capture** change | see §3.1 |
| **Search-then-abandon** | the only live one; ambiguous | see §3.2 |
| **Time-to-first-useful-read** | dead | "useful" is observed nowhere in the vocabulary |
| **Offer-following vs cold search** | **dead in capture** | see §3.3 |
| **Dead ends** | dead | needs the walk chain; `parentVisitId` on 6.1% of reads |

### 3.1 Re-reads measure the pager, not confusion

2,420 repeat reads in window-keyed sessions. Decomposed:

- **7.3%** are `front_matter_read` → `full_payload_read` **escalations** — a peek then a full read.
  Not a re-read at all.
- **49.1%** have **zero intervening reads** (an immediate repeat); 34.2% land within one minute.
  Prior art (`context-cost-is-re-reads-not-offers`) established that 71% of zero-gap repeats are
  paging (`| tail -20` then `| sed -n …`) or field extraction (`--raw status` then `--raw outcome`)
  — one lookup, several ways.
- Only **8.1%** follow a gap over 60 minutes — the "came back to it later" population that a
  difficulty reading would actually want.

**The blocker is structural.** A read event carries `kind, eventId, sessionId, at, visitId, nodeId,
surfaceId, parentVisitId?, priorVisitId?, followedEdgeId?` — and **no command, flags or field scope**.
So a `--raw status` field peek and a full document read are *indistinguishable in the trace*. A
re-read metric built on today's events would draw the output pager as agent confusion. Making this
signal real is a **capture** change, not a rendering change — and forward-only, since existing traces
cannot be repaired.

### 3.2 Search-then-abandon: live, sparse, and ambiguous in both directions

Searches *are* recorded distinctly from pulls, with their `resultNodeIds`
(`packages/context-traversal-telemetry/src/traversal-events.ts:109-130`). Query text is never
recorded — only what the search returned.

Splitting by operation matters, because the listing operations (`arc_list`, `adr_list`,
`friction_list`) are inventory reads whose answer *is* the list:

| operation | n | with results | never followed | median results |
|---|---|---|---|---|
| `library_search` | 115 | 115 | 30% | 20 |
| `library_related` | 12 | 12 | 17% | 20 |
| `arc_list` | 70 | 70 | 21% | 7 |
| `adr_list` | 57 | 56 | 34% | 428 |
| `library_artifact_list` | 112 | 44 | 25% | 39 |
| `friction_list` | 25 | 25 | 56% | 617 |

Ranked searches only (`library_search` + `library_related`): **36 of 127 (28.3%)** had no result read
afterwards in the same session.

**Two problems, and the second is the serious one.**

1. **Materiality.** Rendered as a mark property, this lights up in **44 of 253 sessions (17.4%)** and
   touches **96 of 5,304 marks (1.8%)**. Five sessions in six would look unchanged.
2. **It is ambiguous in exactly the way hop count is.** "No result was opened" supports two opposite
   readings — *the search failed* and *the search answered the question outright* (result lines print
   titles and descriptions). Nothing in the trace separates them. Buying this signal without
   naming that is buying the panel's existing disease in a new colour.

Note the fence: the **positive** half ("this read followed that search") is the ruled-out inference —
adjacency is not causation. The **negative** half is a set-disjointness fact and is genuinely
observed; it is the *interpretation* that is ambiguous, not the observation.

### 3.3 Offer-following is dead in capture, not merely fenced

The increment lists offer-following as a candidate. It is no longer recorded at all:

| kind | last emitted |
|---|---|
| `search` | 2026-09-05 (alive) |
| `full_payload_read` | 2026-09-05 (alive) |
| `model_context` | 2026-09-05 (alive) |
| `candidate_set` | **2026-08-28** |
| `followed_edge` | **2026-08-20** |

ADR-0464 D1 deleted the citation-derived offer surface, and the emitters went with it. The vocabulary
still *has* `CandidateSetEvent`/`FollowedEdgeEvent`, but nothing in production constructs them. The
historical population was already the accepted signal, not a renderer bug (ADR-0260 D4): 2,106
`candidate_set` events against **5** `followed_edge` corpus-wide.

## 4. What is out of bounds, and stays out

- Admitting `arcRef` / `frictionRefs` as walkable edges is **measured and refused** (ADR-0511) — the
  clean record-only variant makes 89 knowledge artifacts deeper for record-keeping reasons, i.e. the
  axis manufacturing its own headline. Do not re-propose it; see
  `unmeasured-row-is-three-bands-and-record-edges-are-refused`.
- The panel's look is stamped (owner, 2026-08-30). A change to the picture is its own decision —
  that is the route, not a way around. ⚠ The governing decision is **ADR-0354 D5** (a landing that
  moves the drawn picture does not carry a standing signature over it), generalised in ADR-0482's
  Consequences. `replay-answers-retrieval-ease-arc`'s intent text cites ADR-0511 for this; that is a
  misciting — ADR-0511 is about the fifth `record` reading state and the refused edge widenings.
- There is no vertical space: rows floor at 11px (`TraversalSpine.tsx:686`) and a deep trace fills the
  320px dock (`BottomDock.tsx:38`). Any proposal needing a row must say what it removes.
- ADR-0524 puts a horizontal composition bar across the top and removes the vertical occupancy track.
  Anything proposed here must fit beneath it.

## 5. Reproducing

The probes were one-shot scripts over `~/.storytree/traces` (parse each `.jsonl`, take `.event`,
key by `sessionId`, keep only uuid-shaped ids). Depth figures come from the shipped
`computeTraversalDepth` / `surfaceDepthOf` — never a second implementation. Re-derive corpus-linkage
figures with `pnpm probe:surface-depth` / `pnpm probe:corpus-linkage`.
