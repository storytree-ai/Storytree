# The composition trial's PRE-COMPOSITION reading — depth by altitude, by arm, 2026-08-23

Measured for `compose-the-treated-arm-with-a-staleness-marker` (ADR-0428). Reproduce with:

```
pnpm probe:decision-composition-trial --to 2026-08-23T00:00:00.000Z
```

**This is the BEFORE half of a comparison, taken from reads that all predate any composed statement.**
It is written down for the same reason `-inc-04` wrote down the arms before anything was composed: a
reading taken afterwards, against a number nobody had recorded, is a story told later. The reads
themselves come from append-only host transcripts over a closed window, so this table is reproducible
on demand and did not strictly have to be committed — what could not be reproduced is the *statement
of what it was expected to show*, which is §3.

**The metric is PROPORTIONALITY, not shortening**, and that is owner-directed (ADR-0428 D5):

> *"we are not trying to universally shorten the agents walk, as a whole maybe but I imagine sometimes
> it structurally makes sense for some things to take a while to reach."*

A fall in mean chain depth is, from that number alone, indistinguishable from readers ceasing to read
what they needed. So the reading is always per ALTITUDE CLASS and always per ARM.

---

## 1. What is measured

For each of the 108 frontiers in the frozen matched pairs
(`docs/research/decision-composition-control-set-2026-08-23.md`), and each context window that read it:

- **depth** — the longest chain *rooted at that frontier* lying wholly inside that window's read set,
  in records. A window that read the frontier and nothing beneath it counts **1**. Rooted rather than
  global, because a frontier walk is anchored at the frontier by definition — that is what `-inc-04`
  counted — and the longest chain anywhere in the same read set may start at an inner node the reader
  reached some other way.
- **walked** — the share of readings whose rooted depth reached 2 or more.

Both are reported per arm within each altitude class, from `probe:decision-altitude`'s **editorial**
classification (pass A, `docs/research/decision-altitude-labels-2026-08-23.json`). Pass B, the lexical
classifier, is deliberately not used: it reproduces the editorial reading only 52.4% (kappa 0.288), so
substituting it would silently change what "altitude" means between two instruments meant to be
compared.

**Two depths are carried, not one.** Depth over READERS is the primary outcome, because a composed
statement's success case is turning a walk into a single read and only that denominator can see it.
Depth over WALKERS separates "fewer walks" from "shallower walks" — two different behaviours with the
same effect on the first number.

## 2. The reading

Window: everything up to `2026-08-23T00:00:00.000Z` — the same closed window `-inc-02` froze the
baseline over. 401 context windows, 2,776 decision reads.

| altitude | arm | frontiers | readings | mean depth | walked |
|---|---|---:|---:|---:|---:|
| executive | treated | 16 | 44 | 1.86 | 45.5% |
| executive | control | 13 | 45 | 1.60 | 44.4% |
| property | treated | 22 | 66 | 1.77 | 51.5% |
| property | control | 22 | 70 | 1.64 | 48.6% |
| existence | treated | 16 | 45 | 1.76 | 53.3% |
| existence | control | 19 | 52 | 1.81 | 48.1% |

**treated − control**, which is the figure a later run compares against:

| altitude | depth difference | walk-share difference |
|---|---:|---:|
| executive | **+0.26** | +1.0 pts |
| property | **+0.13** | +2.9 pts |
| existence | **−0.05** | +5.3 pts |

Denominators: **0** frontiers went unread in this period, and **0** are unlabelled by the committed
classification — so no cell is resting on a silently-empty population.

The reading cross-validates the freeze independently: total treated reach is 155 windows against 167
control, exactly the arm balance `-inc-04` recorded, computed here by a different instrument over the
same transcripts.

## 3. What this table is expected to show, stated BEFORE the intervention

**Every contrast above should be near zero, and they are.** That is the matched design working, not a
result. The arms were matched on walked chains and reach, not on depth, so the small residual spread
is what matching-on-a-neighbouring-variable leaves behind.

**The largest residual is `executive` at +0.26**, and it is recorded here rather than discovered later.
It runs in the direction that would FLATTER a post-composition fall: the treated arm starts deeper in
that class, so some regression toward the mean is expected there with no intervention at all. A later
run reporting a treated-arm fall concentrated in `executive` should be read against this line first.

**The prediction ADR-0428 makes.** A later window should show the treated arm's depth fall where the
question was SHALLOW and HOLD where it was DEEP. What is *not* the predicted result, and must not be
reported as one:

- a uniform fall across all three classes — indistinguishable from readers reading less than they
  needed;
- a fall in mean depth reported without its altitude breakdown at all — explicitly does not satisfy D5;
- a fall in the *walked share* with no change in depth-over-walkers, read as "walks got shorter" — it
  means fewer walks, which is a different claim.

## 4. Floors and known prices

- Every figure is a FLOOR and a property of ONE BOX's transcript history. Every capture blind spot
  REMOVES reads, and removing a node from a read set can only shorten the longest chain it contains.
- **Contamination: 46 of 401 sittings (11.5%) read from both arms in one sitting** at the freeze. It is
  behavioural rather than structural, cannot be designed away at frontier grain, and biases toward the
  NULL — it makes a real effect look SMALLER, so a positive result survives it and a null result does
  not become one because of it. It is the one figure here that is not conservative (a blind spot makes
  it look smaller than it is), so a later run should re-derive it against its own window rather than
  inherit this one.
- **A read count is not a sufficiency measure.** A model given insufficient context answers confidently
  rather than abstaining, so nothing here says a walk was expensive, that a composed statement was
  read, or that agents were getting on fine without one.
- The arms are read from the frozen write-up's own table and never re-derived (ADR-0428 D6). The corpus
  has grown since the freeze, so re-running `probe:decision-control-set` today produces a DIFFERENT
  experiment rather than a refreshed one.

## 5. Provenance

`packages/cli/src/decision-composition-trial.ts` is pure; `probe-decision-composition-trial.ts` is the
only half that touches the world. Reads and the support graph are gathered through
`probe-decision-gather.ts` — the SAME reader `probe:decision-baseline` and `probe:decision-control-set`
use, because a trial matched on reach that gathered reads differently from the baseline it is compared
against would be matched to a number nobody ever measured.

It is a PROBE, not a gate rung: its read half is a property of one laptop's history, so nothing it
prints is a repo invariant anyone could be held to. It is also not a quality check over composed
statements — it measures reading behaviour and grades no prose (ADR-0428 D7, ADR-0427).
