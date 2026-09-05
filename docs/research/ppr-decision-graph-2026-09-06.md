# Personalized PageRank over the decision graph — does spreading beat what we already have?

Measured 2026-09-06 for `follow-the-research-arc-inc-03`. Reproduce with:

```
pnpm probe:ppr
```

**Answer: no. Against the stronger of our two shipped retrievers, every PPR arm lands within
noise.** Personalized PageRank over the authored decision graph recovers what a context window went
on to read at **58.2%** recall@20, and `library related` — which already ships — recovers **57.1%**.
The paired 95% interval on that difference is **[−4.4, +6.7] percentage points**: they are not
distinguishable. Adding co-read edges reaches 59.5% and is likewise within noise (**[−3.1, +7.9]**).

Three things DO separate, and two of them are about the harness rather than the method:

1. **The authored edge DIRECTION is the wrong way to walk** — undirected beats directed by
   **+34.4pp** [27.9, 40.8], the largest effect measured here.
2. **PPR beats the WEAKER shipped retriever by +10.0pp** [3.9, 16.2] at recall@5 — and that gap is
   an artefact of baseline choice, not a finding. See §4(a); it is the single most important thing
   on this page.
3. **HippoRAG's own two-stage shape is WORSE than `library related`** at the top of the ranking,
   by **−12.2pp** [−18.2, −6.2] at recall@5.

---

## 1. Why this was asked

HippoRAG (NeurIPS 2024, `arXiv 2405.14831`) collapses a multi-hop walk into ONE retrieval:
Personalized PageRank seeded from the query spreads probability across a knowledge graph, so
material several hops away surfaces without iterating. The survey
(`chain-walk-methods-survey-2026-09-05.md` §3B) parked it here because the method needs exactly one
asset — a graph with real edges — and that is the thing we already have and every paper in the field
has to fabricate by LLM extraction. Our `dependsOn` is written by the agent that made the decision,
at the time it made it.

ADR-0513 D7 declines a graph database on scale: at this size PPR runs in memory in milliseconds. It
does.

## 2. The population, and the two splits that shape it

| | |
|---|---:|
| decisions in the log | 518 |
| authored `dependsOn` edges | 828 |
| ...naming a decision the log does not hold | 0 |
| decisions carrying no edge at all | 17 |
| transcript files scanned | 4,916 |
| context windows reading a decision | 417 |
| ...reading 2+ distinct decisions — the scorable cases | 290 |
| reads dropped for carrying no window id | 0 |
| reads that resolved to no decision | 0 |
| train / test windows (deterministic hash split) | 147 / 143 |
| co-read edges derived from the TRAIN half | 177 |
| gold pairs in the test half | 617 |

**The gold is OBSERVED, not authored, and that is what makes the trial mean anything.** ADR-0513 D8
forbids generating queries from `dependsOn` and scoring them against `dependsOn` — it passes
trivially, and it is why MuSiQue exists. So a case here is a real context window: its FIRST decision
read is the seed, and every other decision it read in that sitting is the gold. The edges PPR walks
and the answers it is scored against therefore come from two independent sources.

The seed is the first read specifically because that is the only information available *before* the
rest of the window happened. Seeding from a mid-window read would leak the answer's neighbourhood.

**The window is the unit; the worktree slot would manufacture the finding** — the same trap
`co-read-edges.ts` documents. Slots are pooled across a parent session, its subagents, and later
sessions handed the same slot, so keying on one would join decisions read weeks apart by different
sessions into a single "sitting".

**The train/test split exists for exactly one arm.** Co-read edges are derived from the very reads
that form the gold, so scoring them on the windows that built them is circular in the flattering
direction. The split is by `windowId`, deterministic (FNV-1a, no RNG), applied FIRST; the co-read arm
is built from the train half only and scored on the test half. The authored arms do not need this,
but are scored on the same test half regardless — two arms compared on different case sets are not
compared at all.

## 3. The result

Scored on the 143 test windows against a pool of 517 candidate decisions.

| arm | recall@5 | recall@10 | recall@20 | ×chance@20 |
|---|---:|---:|---:|---:|
| `bm25` — shipped `library search`, queried with the seed's title | 30.9% | 44.4% | 52.2% | 13.5x |
| **`related` — shipped `library related`, the fair text bar** | **42.3%** | 52.1% | 57.1% | 14.8x |
| `degree` — static hub ranking, ignores the seed entirely | 1.8% | 5.3% | 9.4% | 2.4x |
| `ppr-hybrid` — HippoRAG's two stages: BM25 picks 5 seeds, PPR spreads | 30.0% | 45.4% | 58.2% | 15.0x |
| `ppr-0.50` — authored edges, undirected, α 0.50 | 40.9% | 50.2% | 58.2% | 15.1x |
| `ppr-0.85` — authored edges, undirected, α 0.85 | 39.2% | 49.1% | 58.7% | 15.2x |
| `ppr-dir` — authored edges, DIRECTED, α 0.50 | 21.4% | 22.8% | 23.9% | 6.2x |
| **`ppr+coread` — authored + co-read (train half only), α 0.50** | 40.0% | **53.1%** | **59.5%** | 15.4x |
| chance (exact: k/517) | 1.0% | 1.9% | 3.9% | 1.0x |

### ★ The paired test, and why the raw table above cannot be read on its own

Two arms scoring 58.2% and 57.1% look like a result and are not one. On ~140 cases a gap of about a
point sits comfortably inside the noise, and the same windows are hard for every arm — so the honest
comparison differences each arm against the other PER CASE, which removes the case-to-case variance
that dominates the raw means.

| comparison | cut | mean Δ | 95% interval | verdict |
|---|---|---:|---:|---|
| `ppr-0.50` − `related` | @5 | −1.4pp | [−7.3, +4.6] | within noise |
| `ppr-0.50` − `related` | @20 | +1.1pp | [−4.4, +6.7] | within noise |
| `ppr+coread` − `related` | @20 | +2.4pp | [−3.1, +7.9] | within noise |
| `ppr+coread` − `ppr-0.50` | @20 | +1.3pp | [−1.7, +4.3] | within noise |
| `ppr-hybrid` − `related` | @20 | +1.1pp | [−3.5, +5.6] | within noise |
| `ppr-hybrid` − `ppr-0.50` | @20 | −0.1pp | [−3.9, +3.8] | within noise |
| **`ppr-hybrid` − `related`** | **@5** | **−12.2pp** | **[−18.2, −6.2]** | **SEPARATES** |
| **`ppr-0.50` − `bm25`** | **@5** | **+10.0pp** | **[+3.9, +16.2]** | **SEPARATES** |
| **`ppr-0.50` − `ppr-dir`** | **@20** | **+34.4pp** | **[+27.9, +40.8]** | **SEPARATES** |

**Not one PPR-versus-`related` comparison separates.** That is the answer to the question this
increment was written to ask.

### ★ The null that says the lift is about the seed at all

A high α on an undirected graph drives PPR toward the degree-proportional stationary distribution,
so an arm can score well by returning the same dozen hub decisions for EVERY query — a live risk on
a corpus whose load-bearing set is re-read constantly. The `degree` arm ranks by degree alone and
never looks at the seed.

It scores **9.4%** at recall@20 against PPR's 58.2%. The seeding is doing the work; this is not
popularity wearing personalization's clothes. The chance null cannot catch that failure, because it
is a fact about the corpus rather than about the arithmetic.

### Where the gold sits relative to the seed

| | | |
|---|---:|---:|
| gold pairs in the test half | 617 | |
| one hop away over authored edges | 152 | 24.6% |
| two or more hops | 413 | 66.9% |
| unreachable at any distance | 52 | 8.4% |

This is the honest analogue of MuSiQue's connectedness filter. The filter does not transfer
literally — our queries are not composed from `dependsOn`, so there is no intermediate to mask — but
what it was FOR does: separating what a retriever wins in one trivial hop from what needs real
spreading. Reporting the partition beats dropping the easy cases, because the share of gold that is
adjacent is itself a fact about whether agents walk the paths we lay for them. **Three quarters of
what a window goes on to read is NOT adjacent to where it started.**

## 4. ⚠ Four things a reader must carry

**(a) THE HEADLINE WOULD HAVE BEEN THE OPPOSITE IF I HAD STOPPED AT THE FIRST BASELINE, AND THIS IS
THE MOST TRANSFERABLE THING ON THIS PAGE.** The first run of this trial compared PPR against
`library search` queried with the seed's title, and PPR won by +10.0pp at recall@5 — separating,
robust, and entirely an artefact. `library search` is the wrong control: the question this trial
asks is *given this decision, what else bears on it?*, and the shipped answer to THAT is
`library related`, which lifts the source's own twelve most distinguishing tf-idf terms. Against the
right control the win vanishes. Both retrievers ship; nothing was misreported; the result simply
inverted on which one was chosen as the bar. **Any bake-off in this repo that names one baseline
should say why it is not the other one.**

**(b) THE METHOD'S OWN SHAPE UNDERPERFORMS OUR SIMPLIFICATION OF IT.** `ppr-hybrid` is what HippoRAG
actually does — retrieve seeds by text, then spread from all of them — and it is **−12.2pp** behind
`library related` at recall@5, the only PPR arm that separates in the losing direction. Diluting the
restart vector across five text-matched seeds costs precision at the top of the ranking, where a
reader actually looks. The single-seed arms are a simplification available to us only because our
"query" is itself a decision; a real free-text query would have to pay the hybrid's cost. Reporting
only the single-seed arms would have overstated the method.

**(c) α BARELY MATTERS AND DIRECTION MATTERS ENORMOUSLY.** 0.50 versus 0.85 is within noise at every
cut. Directed versus undirected is +34.4pp. `dependsOn` is authored from the newer decision toward
the older one it rests on, so walking it forwards makes every foundational decision a sink and
leaves it unreachable from its own dependents — the exact opposite of the observed behaviour that
agents land deep and climb back up. If any future work spreads over these edges, it must treat them
as undirected, and that is a bigger lever than any tuning parameter offered here.

**(d) THE NUMBERS MOVE SLIGHTLY BETWEEN RUNS, AND THE INSTRUMENT IS READING ITS OWN AUTHOR.** The
probe reads this machine's live host transcripts, so the session writing this document adds windows
to the population while it runs — the case count moved 289 → 290 across three consecutive runs.
Differences of a few tenths of a point between a quoted figure and a fresh run are that, not a
defect. Every figure here is from the single run captured on 2026-09-06; a re-run will not reproduce
them exactly and is not meant to.

## 5. What this does NOT license

**No cross-paper comparison** (ADR-0513 D3). Nothing here is parity with, or an improvement on, or a
failure to reproduce, HippoRAG's reported 10–20x cost and 6–13x speed figures. Different corpus,
different queries, different harness. This is an internal bake-off against our own retrievers on our
own reads, and that is the only claim available.

**No conclusion that the graph is worthless.** Every PPR arm beats chance by ~15x and beats a
degree-only null by 6x. The finding is that it does not beat a text retriever we ALREADY SHIP — a
statement about the marginal value of building on it, not about whether the structure carries signal.

**No promotion of co-read edges.** They add +1.3pp over authored-only, within noise. ADR-0513 D6
requires the weighting work to land as one unit with its exposure-bias correction; this page reports
and does not promote.

**No claim about free-text queries.** Every case here seeds from a decision the window had already
read. How these arms behave on a query typed from scratch is untested, and `ppr-hybrid` is the only
arm that even approximates it.

## 6. What it unblocks, and what it costs

**The cheap negative ADR-0513 anticipated has arrived, pointing the other way.** The ADR's
consequences say: *"if Personalized PageRank over unweighted authored edges is already good enough,
the whole weighting trio is declined without being built."* It is not good enough — it is level with
what ships. That does not decline the weighting work (inc-06/07/08); it removes the cheap reason to
skip it, and it sets the bar any weighting scheme must now clear: **beat 57.1% recall@20 by more than
the ~5pp that a 143-case sample can resolve.** On this evidence a scheme that improves ranking by a
point or two is not worth building, because the measurement cannot even see it.

**The 8.4% unreachable ceiling is the strongest argument for the co-read work, and it is structural
rather than statistical.** One gold pair in twelve is reachable from its seed at NO distance over
authored edges — no traversal, no spreading, no tuning will ever surface it. That is precisely the
population `co-read-edges-2026-09-05.md` exists to reach, and it is a ceiling on every authored-edge
method including this one.

**The direction finding transfers immediately and for free.** Anything in this repo that walks
`dependsOn` for RELATEDNESS rather than for provenance should walk it undirected. That is a 34-point
effect sitting in a design choice nobody had measured.
