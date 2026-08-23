# The frozen held-out control set, and the composition design fork — 2026-08-23

Measured for `decision-read-measurement-arc-inc-04`. Reproduce with:

```
pnpm probe:decision-control-set --from 2026-06-08T00:00:00.000Z --to 2026-08-23T00:00:00.000Z --top 20
```

**This is a SELECTION, frozen before any composition exists**, and its whole value is the order of
those two events. `-inc-02` froze a PRIOR — reach, chain depth and offer-to-follow over a declared
window — which supports a before/after comparison. On a corpus this active, a before/after comparison
measures THE WEEK as readily as it measures the change. The owner's standing finding
(`ground-misled-reader-claims-with-blind-readers`) is that a prose fix must be argued against a
CONTROL, never against a drift number. Choosing the control after seeing which subtrees an
intervention happened to help would be a story told afterwards, so the choosing is done here, now, in
public, by deterministic code.

**Nothing here decides the design fork.** §4 states it and leaves it open. It is authored for the
owner as an `open-question` artifact stamped to this arc; ADR-0419 D5 remains evidence-gated and is
not answered here.

**The short answer, in four lines.**

1. **The obvious experiment is impossible, for a structural reason nobody had looked for.** The
   decision log is not a forest of comparable families. **310 of its 416 decisions sit in ONE
   weakly-connected support component**, holding 85.1% of every walked chain. Assigning whole
   components to arms puts the entire experiment in one arm.
2. **A finer unit does work, and it is the fork's own object.** Assigning CHAIN FRONTIERS — the
   decisions nothing amends, where a composed statement would live — gives **54 matched pairs**, the
   largest single unit holding just 4.1% of frontier walks.
3. **The matching is tight and the arms balance.** 52 of 54 pairs match EXACTLY on walked chains;
   arm totals are 86 walks treated against 84 control, and 155 reach against 167.
4. **The price is stated, not hidden: 11.5% contamination.** 46 of 401 sittings read both arms. It is
   behavioural rather than structural, it cannot be designed away at this grain, and it biases toward
   the null.

---

## 1. The subject, as of this freeze — and how it differs from `-inc-02`'s

| | this selection | `-inc-02`'s frozen prior |
|---|---:|---:|
| Decisions | 416 | 414 |
| `amends` edges | 516 | 513 |
| `dependsOn` edges | 2 | 0 |
| Rows carrying the `dependsOn` field | 1 | 0 |
| Reads / context windows | 2,782 / 401 | 2,782 / 401 |
| Windows walking a chain (depth >= 2) | 203 (50.6%) | 203 (50.6%) |

The two edge populations are counted APART and never summed (ADR-0419 D1).

**The read half is byte-identical to `-inc-02`'s and the subject half is not, and both facts are
expected.** Reads come from append-only host transcripts over a closed window, so they reproduce
exactly: re-running the baseline probe for this increment returned the same 2,782 reads, the same 401
windows, the same 203 walkers and the same deepest sitting of 9. The decision log meanwhile gained two
decisions, three `amends` edges and the first two `dependsOn` edges in the hours between. That is the
corpus being alive, not drift.

It is also why the frozen record in §3 is **member lists** rather than a rule for recomputing them. A
later trial reports against these names; re-running the probe tells it how far the ground has moved
under them.

The two `dependsOn` edges are the first ever written, and they came from `-inc-06`'s
`adr new --depends-on` authoring surface rather than from `-inc-07`'s drain — the corroboration
recorded on ADR-0419 that its Decision 2 is FORWARD-LOOKING rather than a description of a large
mislabelled population waiting to be rehomed.

---

## 2. THE ASSIGNMENT UNIT — why the obvious one fails

A trial composes a statement somewhere and leaves somewhere else alone. The first question is what
"somewhere" can be, and structure settles it rather than preference.

**A chain cannot be a unit, because chains OVERLAP.** One decision lies on as many chains as there are
paths through it, so composing at the frontier of one chain changes what a reader walking another
finds. An intervention assigned to overlapping units has no control arm, only a contaminated one.

### Unit A — the SUPPORT COMPONENT. Safe, and unusable.

A weakly-connected component of the support graph has the property that makes assignment safe: **no
support edge crosses it**, so treatment cannot propagate along the graph into the other arm.
Components are the finest partition carrying that guarantee. The code CHECKS that property
(`componentsAreEdgeClosed`) rather than asserting it in a comment, and the check has a positive
control — a deliberately split partition must be rejected, or the invariant is satisfied by anything.

Connectivity is computed UNDIRECTED even though the edges are directed. That is deliberate: a reader
crosses an edge in whichever direction the reading takes them — down from an amender to what it
amends, or up from a decision to what has since narrowed it.

The census kills the idea:

| | |
|---|---:|
| Components | 65 |
| Singletons (one decision, no support edge) | 48 |
| Structurally eligible (>= 2 decisions, >= 1 internal edge) | 17 |
| Informative (eligible and read at least once) | 17 |
| **Largest component** | **310 decisions — 74.5% of the log** |
| Its share of all walked chains | **85.1%** |
| Its share of all reach | 70.5% |

The next largest components are 16, 6, 5, 4, 3, 3 and 3 decisions. The giant component carries 466 of
the 516 `amends` edges, both `dependsOn` edges, 339 windows of reach, 183 walked chains, and the
deepest sitting in the corpus (depth 9).

**So whichever arm receives it IS the experiment**, the other arm is a rounding error, and any
difference between arms would be a fact about that one component rather than about composition. The
probe refuses to emit a component-level split and prints exactly that reason. The threshold it applies
— one unit holding more than half the outcome — is a stated JUDGMENT, and the shares are printed
beside it so a reader may apply their own.

**This is a finding in its own right, independent of any trial: the decision log is one dense,
interconnected object, not a set of separable topics.** Any design that assumed it could treat "the
decisions about X" apart from "the decisions about Y" was assuming a modularity the graph does not
have. That bears on more than this experiment — it is also why `adr list --load-bearing`'s closure
grows the way it does, and why a reader cannot be handed a topic-shaped slice of the log.

### Unit B — the CHAIN FRONTIER. Usable, with a measured price.

A frontier is a decision **nothing rests on** (in-degree 0 across both support edges) which **itself
rests on something** (out-degree >= 1). It is the current end of its chain, and it is precisely where
a composed statement of the current position would be carried — so it is the thing a reader is or is
not exposed to.

| | |
|---|---:|
| Frontiers | 132 |
| Informative (read by >= 1 window) | 109 |
| Largest frontier's share of all frontier walks | **4.1%** |

Frontier subtrees overlap heavily inside the giant component, so leakage is real. But leakage between
frontiers is **behavioural, not structural**: it happens only when one reader's sitting touches both
arms. That is measurable, and §3 measures it rather than assuming it away.

**The honest summary a later trial inherits: the guaranteed-clean unit is unusable on this corpus, and
the usable unit carries a stated contamination rate.** Reporting only the first would say no trial is
possible; reporting only the second would hide why the clean design was abandoned.

---

## 3. THE FROZEN SPLIT

Selection is deterministic and seedless — sorted keys throughout, no RNG. Units are ranked by walked
chains (the outcome a composed frontier acts on), then reach, then subtree size, then decision number;
every tiebreak is total. **Adjacent pairs on that ranking are the match**: neighbours in this order are
the two most similar units still unassigned. Which side of a pair is treated ALTERNATES across pairs
rather than following a constant rule like "lower number is treated", which would load one arm with a
systematic age bias — older decisions have had longer to accumulate both amenders and readers.

Of 109 informative frontiers, 108 form 54 pairs. **The odd tail unit is left ineligible rather than
assigned unpaired**, which would silently unbalance the arms.

### Arm balance

| | treated | control |
|---|---:|---:|
| Frontiers | 54 | 54 |
| Walked chains | **86** | **84** |
| Reach (windows) | 155 | 167 |

Worst single pair: walk gap **1**, reach gap **4**. Within-pair gap distribution — walk: 52 pairs at 0,
two at 1. Reach: 41 at 0, nine at 1, two at 2, one at 3, one at 4.

**Read that beside `-inc-02`'s broad-and-thin finding before trusting it.** Matching on a variable
whose median value is 3 is partly matching on counting noise: two units differing by one walk may
differ because one reader had one more sitting, not because of anything about the decisions. The gaps
above are small in absolute terms because the values themselves are small. A later trial should treat
the arms as comparable-in-expectation rather than equated, and the honest statement of what this
design can detect is a LARGE effect, not a subtle one.

### CONTAMINATION — the price, stated

**46 of 401 windows (11.5%) read both a treated and a control frontier in one sitting.**

It cannot be removed at this grain, and it biases **toward the null**: a reader given a good composed
answer in the treated arm may simply stop reading, depressing the control arm too. A later trial
reports this figure rather than discovering it, and an effect measured across these arms is a FLOOR on
the true effect for that reason.

### The 54 matched pairs

`subtree` is the decision's descendant closure including itself; `depth` the longest support path from
it; `reach` distinct windows reading the frontier; `walks` windows that read the frontier AND something
beneath it — exactly the readers a composed statement there would have served.

| # | TREATED | subtree | depth | reach | walks | CONTROL | subtree | depth | reach | walks | walk gap | reach gap |
|---:|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | ADR-0278 | 2 | 2 | 10 | 7 | ADR-0249 | 3 | 3 | 9 | 7 | 0 | 1 |
| 2 | ADR-0293 | 15 | 11 | 7 | 6 | ADR-0324 | 5 | 3 | 10 | 6 | 0 | 3 |
| 3 | ADR-0272 | 4 | 3 | 7 | 6 | ADR-0287 | 4 | 4 | 9 | 5 | 1 | 2 |
| 4 | ADR-0297 | 7 | 5 | 7 | 5 | ADR-0346 | 10 | 8 | 8 | 5 | 0 | 1 |
| 5 | ADR-0316 | 3 | 3 | 7 | 5 | ADR-0262 | 3 | 3 | 8 | 4 | 1 | 1 |
| 6 | ADR-0337 | 12 | 8 | 4 | 4 | ADR-0269 | 2 | 2 | 6 | 4 | 0 | 2 |
| 7 | ADR-0322 | 11 | 7 | 4 | 4 | ADR-0127 | 3 | 3 | 4 | 4 | 0 | 0 |
| 8 | ADR-0312 | 2 | 2 | 4 | 4 | ADR-0256 | 2 | 2 | 4 | 4 | 0 | 0 |
| 9 | ADR-0333 | 3 | 3 | 7 | 3 | ADR-0363 | 3 | 3 | 6 | 3 | 0 | 1 |
| 10 | ADR-0330 | 2 | 2 | 4 | 3 | ADR-0279 | 3 | 3 | 5 | 3 | 0 | 1 |
| 11 | ADR-0336 | 40 | 9 | 3 | 3 | ADR-0308 | 10 | 8 | 3 | 3 | 0 | 0 |
| 12 | ADR-0285 | 3 | 3 | 3 | 3 | ADR-0370 | 8 | 7 | 3 | 3 | 0 | 0 |
| 13 | ADR-0325 | 12 | 6 | 7 | 2 | ADR-0175 | 11 | 8 | 7 | 2 | 0 | 0 |
| 14 | ADR-0347 | 12 | 8 | 5 | 2 | ADR-0419 | 46 | 10 | 6 | 2 | 0 | 1 |
| 15 | ADR-0329 | 10 | 9 | 3 | 2 | ADR-0359 | 3 | 3 | 3 | 2 | 0 | 0 |
| 16 | ADR-0318 | 2 | 2 | 2 | 2 | ADR-0286 | 2 | 2 | 3 | 2 | 0 | 1 |
| 17 | ADR-0259 | 10 | 6 | 6 | 1 | ADR-0060 | 5 | 5 | 6 | 1 | 0 | 0 |
| 18 | ADR-0265 | 2 | 2 | 6 | 1 | ADR-0169 | 4 | 4 | 6 | 1 | 0 | 0 |
| 19 | ADR-0353 | 3 | 3 | 4 | 1 | ADR-0326 | 14 | 8 | 3 | 1 | 0 | 1 |
| 20 | ADR-0035 | 3 | 3 | 3 | 1 | ADR-0369 | 7 | 7 | 3 | 1 | 0 | 0 |
| 21 | ADR-0292 | 3 | 3 | 3 | 1 | ADR-0350 | 2 | 2 | 3 | 1 | 0 | 0 |
| 22 | ADR-0277 | 13 | 9 | 2 | 1 | ADR-0107 | 17 | 8 | 2 | 1 | 0 | 0 |
| 23 | ADR-0210 | 10 | 6 | 2 | 1 | ADR-0303 | 8 | 7 | 2 | 1 | 0 | 0 |
| 24 | ADR-0071 | 4 | 3 | 2 | 1 | ADR-0343 | 7 | 7 | 2 | 1 | 0 | 0 |
| 25 | ADR-0360 | 4 | 3 | 2 | 1 | ADR-0228 | 3 | 2 | 2 | 1 | 0 | 0 |
| 26 | ADR-0049 | 2 | 2 | 2 | 1 | ADR-0258 | 3 | 3 | 2 | 1 | 0 | 0 |
| 27 | ADR-0053 | 2 | 2 | 2 | 1 | ADR-0058 | 2 | 2 | 2 | 1 | 0 | 0 |
| 28 | ADR-0072 | 2 | 2 | 2 | 1 | ADR-0061 | 2 | 2 | 2 | 1 | 0 | 0 |
| 29 | ADR-0229 | 2 | 2 | 2 | 1 | ADR-0315 | 2 | 2 | 2 | 1 | 0 | 0 |
| 30 | ADR-0421 | 37 | 14 | 1 | 1 | ADR-0372 | 43 | 10 | 1 | 1 | 0 | 0 |
| 31 | ADR-0309 | 33 | 12 | 1 | 1 | ADR-0396 | 20 | 10 | 1 | 1 | 0 | 0 |
| 32 | ADR-0386 | 13 | 8 | 1 | 1 | ADR-0418 | 18 | 12 | 1 | 1 | 0 | 0 |
| 33 | ADR-0299 | 12 | 8 | 1 | 1 | ADR-0234 | 11 | 5 | 1 | 1 | 0 | 0 |
| 34 | ADR-0125 | 8 | 5 | 1 | 1 | ADR-0362 | 9 | 5 | 1 | 1 | 0 | 0 |
| 35 | ADR-0382 | 8 | 6 | 1 | 1 | ADR-0411 | 8 | 7 | 1 | 1 | 0 | 0 |
| 36 | ADR-0080 | 6 | 5 | 1 | 1 | ADR-0045 | 7 | 4 | 1 | 1 | 0 | 0 |
| 37 | ADR-0225 | 6 | 6 | 1 | 1 | ADR-0356 | 6 | 4 | 1 | 1 | 0 | 0 |
| 38 | ADR-0128 | 5 | 5 | 1 | 1 | ADR-0078 | 5 | 5 | 1 | 1 | 0 | 0 |
| 39 | ADR-0086 | 3 | 3 | 1 | 1 | ADR-0349 | 3 | 3 | 1 | 1 | 0 | 0 |
| 40 | ADR-0373 | 3 | 3 | 1 | 1 | ADR-0371 | 3 | 3 | 1 | 1 | 0 | 0 |
| 41 | ADR-0388 | 3 | 3 | 1 | 1 | ADR-0398 | 3 | 3 | 1 | 1 | 0 | 0 |
| 42 | ADR-0264 | 12 | 8 | 3 | 0 | ADR-0246 | 11 | 7 | 7 | 0 | 0 | 4 |
| 43 | ADR-0254 | 3 | 3 | 3 | 0 | ADR-0114 | 2 | 2 | 3 | 0 | 0 | 0 |
| 44 | ADR-0238 | 6 | 4 | 2 | 0 | ADR-0273 | 12 | 8 | 2 | 0 | 0 | 0 |
| 45 | ADR-0099 | 3 | 2 | 2 | 0 | ADR-0110 | 3 | 3 | 2 | 0 | 0 | 0 |
| 46 | ADR-0181 | 2 | 2 | 2 | 0 | ADR-0291 | 3 | 3 | 2 | 0 | 0 | 0 |
| 47 | ADR-0361 | 2 | 2 | 2 | 0 | ADR-0410 | 37 | 14 | 1 | 0 | 0 | 1 |
| 48 | ADR-0379 | 16 | 14 | 1 | 0 | ADR-0414 | 17 | 11 | 1 | 0 | 0 | 0 |
| 49 | ADR-0390 | 16 | 14 | 1 | 0 | ADR-0374 | 15 | 8 | 1 | 0 | 0 | 0 |
| 50 | ADR-0383 | 9 | 8 | 1 | 0 | ADR-0236 | 13 | 6 | 1 | 0 | 0 | 0 |
| 51 | ADR-0198 | 7 | 5 | 1 | 0 | ADR-0112 | 4 | 4 | 1 | 0 | 0 | 0 |
| 52 | ADR-0365 | 3 | 3 | 1 | 0 | ADR-0205 | 3 | 3 | 1 | 0 | 0 | 0 |
| 53 | ADR-0397 | 3 | 3 | 1 | 0 | ADR-0376 | 2 | 2 | 1 | 0 | 0 | 0 |
| 54 | ADR-0393 | 2 | 2 | 1 | 0 | ADR-0391 | 2 | 2 | 1 | 0 | 0 | 0 |

Pairs 42–54 have zero observed walks on both sides. They are matched and frozen anyway: a frontier
read but never walked is exactly the case where a composed statement might CREATE a walk that does not
happen today, and dropping them would build "composition only helps where walking already happens"
into the selection rather than testing it.

### Frontiers deliberately in NEITHER arm

Twenty-four frontiers are in neither arm, for two different reasons, and the reasons are recorded
apart so a later trial cannot quietly recruit one.

**Twenty-three were read by no window** in the declared period — an arm could learn nothing from them:

ADR-0104, ADR-0111, ADR-0119, ADR-0124, ADR-0132, ADR-0141, ADR-0149, ADR-0151, ADR-0172, ADR-0190,
ADR-0193, ADR-0197, ADR-0206, ADR-0208, ADR-0224, ADR-0231, ADR-0385, ADR-0399, ADR-0401, ADR-0409,
ADR-0416, ADR-0422, ADR-0423.

**One is the unpaired tail: ADR-0413** (reach 1, walks 0). It IS informative, and it is held out only
because 109 is odd — assigning it unpaired would silently unbalance the arms. If a later trial widens
the window and a 110th informative frontier appears, this is the one already waiting to be matched.

---

## 4. THE DESIGN FORK — stated, and left open

**The question.** Should the frontier of an `amends` chain carry a composed, maintained statement of
the current position — and if so, is the composed unit the decision DOCUMENT or the decision CLAUSE?

It is left unanswered here deliberately. This increment measures what a trial could look like; it
decides nothing about edge rollups.

### What is already settled, and must not be relitigated

- **Sessions DO walk chains.** `-inc-02` put the hypothesis at genuine risk and it survived: 203 of
  401 windows (50.6%) at depth >= 2, deepest 9. A rollup at a frontier removes exactly the cost of a
  walk, so the behaviour the design targets is real and common.
- **There is no small hot core to compose first.** Reach is broad and thin: 370 of 414 decisions read,
  hottest reaching 31 of 401 windows, median 3, top-20 holding 19.6% of reach. Any proposal that
  starts "compose the top N" has no short list, and this constrains the intervention rather than
  merely describing it.
- **What the corpus POINTS AT is not a usable proxy for what to compose.** Offers are noise — 4.7%
  followed, 111 of 151 offered decisions never followed once, offer rank close to unrelated to reach
  rank. Sizing composition work off the offer surface would size it off the wrong distribution.

### The two constraints the owner has already set

1. **A pointer is not an acceptable payload at the frontier.** "See ADR-0139 D4" forces a guess or a
   full re-read, which is the cost the design exists to remove. Whatever sits at a frontier must
   answer, not redirect.
2. **The composed text must state the coherent SYSTEM the decisions beneath it add up to, not list
   them.** This is Gentner's systematicity principle: unconnected relations transfer badly, connected
   systems transfer well. A frontier carrying "0139 said X, 0402 said Y, 0403 said Z" has re-created
   the walk in one paragraph and paid for a maintained artifact to do it.

### The evidence on DOCUMENT versus CLAUSE, and why it is not the decision

Our own guidance already votes for the clause. Measured here on this checkout:

| scope | ADR references | clause-level (`D4`, `§1`, `dec 6`) | share |
|---|---:|---:|---:|
| `CLAUDE.md` alone | 228 | 95 | 41.7% |
| `CLAUDE.md` + `AGENTS.md` | 309 | 146 | 47.2% |
| all 42 guidance projection files | 957 | 458 | 47.9% |

Roughly half of every decision reference our own guidance makes already points at a CLAUSE rather than
a document, and the share is stable across three nested scopes. (The increment brief quotes 134 of 301
from an earlier count; the small difference is a slightly narrower reference pattern, and the shape is
the same.)

**Evidence is not the decision, for two reasons worth stating.** First, this measures how we WRITE
references, which may reflect the precision of the writer rather than the needs of the reader. Second,
the clause has no identity in the store: `amends` edges point at DECISIONS, `adr list` derives its
closure over decisions, and `loadBearingReach` closes over decisions. Choosing the clause as the
composed unit means minting a first-class clause identity, which is a much larger change than choosing
the document — and its cost belongs in the decision rather than being discovered after it.

### The risk this arc does not solve, and should not pretend to

RAPTOR (ICLR 2024) and Microsoft GraphRAG both compose hierarchical summaries and retrieve from them
instead of the leaves; GraphRAG reports root-level answers at ~97% fewer tokens. **Neither survives its
leaves being EDITED.** Both assume a static corpus: build the tree once, query it many times.

Ours are edited in place, by mandate. ADR-0139 D1 requires every accepted decision to be true in full
and directs that overtaken prose be CORRECTED IN PLACE rather than superseded. So every leaf under a
composed frontier is mutable, and a composed statement is stale from the first correction beneath it.

**Staleness detection, not summarisation, is the engineering.** The summarisation is the part the
literature has already solved and the part a model does well. The unsolved part is knowing that a
frontier's composed text no longer describes what is beneath it — and ADR-0419's own Consequences
already flag the cheap version of this as a leading indicator: if 451 one-line annotations cannot be
held current, composed rollups will not be either. The `-inc-07` drain burndown (129 silent edges over
101 targets after batch 1, from 175 over 114) is that indicator, and it is the instrument ADR-0419 D5
actually waits on.

### What D5 waits on, stated precisely because it has been misread

ADR-0419 D5 defers retiring `amends` and gates it on evidence: the question becomes answerable "once
targets are self-describing: if reaches into amended decisions fall, the edge has become pure
provenance."

**Its precondition is ANNOTATION COMPLETENESS and nothing else.** It names no convergence of the
`amends` and `dependsOn` populations. So D5's instrument is the `-inc-07` drain burndown, NOT the
edge-type split — which, on the finding that the backlog is annotation debt rather than mislabelled
support, will barely move. A write-up that presented the fork as though D5 waits on a split that will
never come would send the next session to watch the wrong number.

### Where `-inc-03` changes the shape of this

`-inc-03` (altitude classification) was still in flight when this was frozen, so its result is not an
input here. Its own brief states the interaction: if reads cluster by altitude — strategic decisions
read broadly, operational ones narrowly — then **a single flat rollup is the wrong object** and the
fork changes shape before anyone builds anything.

The frozen split above is robust to that, because it is a selection over frontiers and not a
commitment to any particular composed payload. But the fork's second half (document or clause) may
need a third option — *composed per altitude* — and that option should not be closed off by this
write-up. Kruchten's ontology already supplies the axis our log lacks: existence, property, executive.

---

## 5. Floors, stated

Every reach and walk figure is a FLOOR and a property of ONE BOX's transcript history. Every capture
blind spot REMOVES reads, and removing a node from a read set can only shorten the longest chain it
contains — the same asymmetry that let `-inc-02` freeze without its blind spots sized.

The contamination figure runs the other way and is the one number here that is NOT conservative: a
blind spot that hides a window's second-arm read makes contamination look SMALLER than it is. 11.5% is
therefore a floor on contamination too, which is the unhelpful direction. A later trial should re-derive
it against its own observation window rather than inheriting this one.

And the standing limit outranks all of it: **a read count is not a sufficiency measure.** A model given
insufficient context answers confidently rather than abstaining, so nothing here says a walk was
expensive, that a composed frontier would have been read, or that agents are getting on fine without one.

The 50% dominance threshold in §2 is a stated JUDGMENT rather than a derived quantity. The underlying
shares are printed so a reader may apply their own — at any threshold above 85.1% the component design
becomes "feasible", and it would still be a one-unit experiment.

---

## 6. Fences honoured

- `loadBearingReach` (`packages/cli/src/adr.ts`) untouched and still `amends`-only (ADR-0419 D1).
- `packages/library/src/amends-annotation.ts` still UNWIRED from the gate.
- No figure anywhere sums `amends` and `dependsOn`; the chain walk unions them as one adjacency while
  counting them apart, and a test asserts no blended figure is exported.
- The `amends` field is neither deleted nor schema-deprecated; no edge was moved and no decision body
  was edited by this increment.
- This increment decides nothing about edge rollups. It states the fork and leaves it open.

## 7. Provenance

`packages/cli/src/decision-control-set.ts` is pure; `probe-decision-control-set.ts` is the only half
that touches the world. Reads and the support graph are gathered by
`packages/cli/src/probe-decision-gather.ts` — extracted from the baseline probe so both instruments
read ONE population, because a control set matched on reach that gathered reads differently from the
baseline it is matched against would be matched to a number nobody ever measured.

22 tests, mutation-tested five ways, each mutation red: components reading `amends` alone; frontiers
dropping the out-degree requirement; frontier walk counting mere reach; the treated side ceasing to
alternate; the dominance guard removed. All reverted, suite green.
