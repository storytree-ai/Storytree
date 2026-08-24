# The two after arms, read on 2026-08-25 — and the attribution that is gone for good

`decision-read-measurement-arc`. Reproduce with `pnpm probe:amends-reach` and
`pnpm probe:decision-composition-trial --from 2026-08-23T13:13:58.000Z`.

This is the arc's two remaining entries taken on the first date either was due:
`rerun-d5s-read-test-once-the-after-arm-is-powered` (ADR-0419 D5) and
`measure-the-composition-trials-after-arm` (ADR-0428 D5). Both were parked on 2026-08-23 as
**time-gated, not work-gated** — "Nothing needs building. Only time."

**That premise is refuted for the first entry and re-dated for the second.** The headline is not the
directions; it is that one of the two questions can no longer be answered by waiting, and no amount
of accrual will change that.

---

## 1. ADR-0419 D5's read test — a fall that nobody can attribute

### What the run says

Six comparisons, after arm split at the drain's completion (`2026-08-23T05:39:57Z`), both arms joined
against the frozen edge snapshot:

| grain | measure | before | after | verdict |
|---|---|---|---|---|
| window | crossed an `amends` edge | 207/405 · 51.1% | 8/31 · 25.8% | FALL — **not attributable** |
| window | read an amended decision | 364/405 · 89.9% | 19/31 · 61.3% | FALL — **not attributable** |
| window | amended-first, of all crossings | 339/654 · 51.8% | 8/17 · 47.1% | UNDERPOWERED |
| slot | crossed an `amends` edge | 151/289 · 52.2% | 8/29 · 27.6% | FALL — **not attributable** |
| slot | read an amended decision | 256/289 · 88.6% | 17/29 · 58.6% | FALL — **not attributable** |
| slot | amended-first, of all crossings | 360/687 · 52.4% | 8/17 · 47.1% | UNDERPOWERED |

The arm cleared the report's 28-session floor for the first time, which is what the 2026-08-25 gate
was waiting for. The two still-underpowered rows are denominated in **crossings**, not sessions
(17 of the needed 28), so they clear later than their session-denominated siblings.

### Why none of those falls belongs to the annotation

**A second intervention lands inside the after arm, roughly seven and a half hours into it.**

| instant | event |
|---|---|
| `2026-08-23T05:39:57Z` | the annotation drain completes, 453/453 — **the intervention D5 wants to measure** |
| `2026-08-23T13:13:58Z` | ADR-0428's composed statements land on the treated frontiers (PR #1596) |
| `2026-08-23T13:23Z .. 14:22Z` | `-inc-18` rewrites all 517 `amends` edges onto `dependsOn` in place |
| `2026-08-24T00:23:44Z` | `-inc-19` deletes the field, and with it `adr list`'s `☆` and `amended by NNNN` |

The migration timestamps are measured from the write log, not inferred: the `claude/retire-amends`
writes on `-inc-18`'s own row (13:23Z, 14:22Z) and on the decision rows themselves (adr-0045 at
13:40Z, 14:19Z). The store's history renders **UTC** — checked against `-inc-19`'s close at `08-24
00:25` versus PR #1617's merge at `2026-08-24T00:23:44Z`.

**The edges survived the migration; the LABEL did not.** `adr list` still derives a `depended on by
NNNN` back-edge from `dependsOn`, so both directions of every former `amends` edge remain walkable —
this is not a case of the pointer being deleted. What went is the semantics: a pointer that said
*this decision was NARROWED by that one* now says only that something supports it, mixed in
undifferentiated with every other support edge. **A reader with less reason to follow the pointer is
a complete, independent explanation of a fall in crossings, and it is not the annotation.**

So the after arm contains two candidate causes and this design separates neither.

### The arm that could have answered it is frozen at nine sessions

Bounded to the clean window — annotation complete, edge still labelled —
`pnpm probe:amends-reach --to 2026-08-23T13:13:58.000Z`:

- **window grain — 9 sessions that read a decision, 3 of which crossed an `amends` edge**
- **slot grain — 7 sessions, 3 crossings**
- all six comparisons UNDERPOWERED against a floor of 28

That window is ~7.5 hours long and it **ended on 2026-08-23**. Time only moves forward, so it can
never grow. Every session that accrues from here lands on the confounded side.

> **ADR-0419 D5's read test is permanently unanswerable at its intended attribution.** It is not
> waiting on a denominator. The re-run dates the parked entry carries — 2026-08-30 for a 30% fall,
> 2026-09-09 for a 20% fall — buy power that cannot be spent on the question D5 asked.

### What the run does still establish

The falls are real as **descriptions**, and they are large: crossing rates roughly halved and plain
reach fell ~28 points at both grains. Something changed in how sessions read the decision log across
2026-08-23. The measurement cannot say which of the two interventions did it, and it would be wrong
to quote the numbers as evidence that the annotation worked. It would be equally wrong to quote them
as evidence the retirement hurt reading — the same ambiguity runs both ways.

Two known biases, both already measured and neither re-derived here: the after arm is **contaminated
upward** by sessions working on the `amends` question itself (so a fall is understated), and the
annotation was never all-or-nothing — 61% of edges were already annotated on 2026-08-22, so the
intervention measured is only the last 39% (which makes a fall harder to detect, not easier). This
session's own reads are in the arm too: it grew 30 → 31 sessions between two runs an hour apart.

Do **not** substitute a cross-sectional design (already-annotated vs silent targets inside the before
window). It is answerable today and was deliberately rejected: it needs per-target annotation state,
i.e. rebuilding the presence checker ADR-0427 deleted.

---

## 2. ADR-0428 D5's composition trial — the after arm exists but carries nothing yet

`pnpm probe:decision-composition-trial --from 2026-08-23T13:13:58.000Z`, dated from the composition
landing as the parked entry instructs:

```
THE OBSERVATION PERIOD
  from 2026-08-23T13:13:58.000Z   to (open)   context windows 23   decision reads 120

  executive       treated   1 frontiers    1 readings   ·  control   2 frontiers   3 readings
  property        treated   0 frontiers    0 readings   ·  control   2 frontiers   6 readings
  existence       treated   2 frontiers    3 readings   ·  control   0 frontiers   0 readings
```

**13 frontier readings across six cells, in two days.** Every contrast reports INSUFFICIENT. No
direction is stated, and the run says so at the top rather than leaving it to be inferred.

### The defect this run exposed, now fixed

Before this session the probe reported, for the `property` row:

```
property        treated   0 frontiers    0 readings  depth 0.00
                control   2 frontiers    6 readings  depth 1.00
                treated − control:  depth -1.00   walk share +0.0 pts
```

**A full-record "fall" manufactured out of nobody having read the treated arm at all.** An empty
cell's mean is 0 by convention, and the unguarded subtraction turned that convention into a finding.
This is the same fault `-inc-14` fixed on the sibling probe (a genuine-looking FALL off six sessions)
at a different grain: **a direction computed before anyone asked whether the arm could carry one.**

### When it does become answerable — a projection, not a date

Unlike D5's test, this one is genuinely only waiting. The after arm accrues at ~6.5 frontier readings
per day across six cells (13 readings in two days), consistent with the ~10.7 decision-reading
sessions/day measured by `-inc-14`.

The bar is computed per run from that run's own observed spread of depths, so it moves:

| run | pooled bar | cells clearing it |
|---|---|---|
| after arm (2 days) | 25 readings/arm | 0 of 3 |
| before arm (2.5 months, 397 windows) | 58 readings/arm | 1 of 3 |

At ~1.1 readings per cell per day, reaching 25 in every cell takes **~23 days (mid-September)** and
reaching 58 takes **~53 days (mid-October)**. Expect the later figure: the bar rises toward the
before arm's as the spread stabilises.

### The declared effect size is load-bearing, and now visible

The trial declares 0.5 records as the smallest depth difference worth detecting. That choice decides
the verdict, so it is a flag rather than a buried constant — `--effect <records>` — and the figure is
printed beside every INSUFFICIENT row:

- at `--effect 0.5` the **before** arm resolves **one** altitude class of three
- at `--effect 0.75` it resolves **all three** (+0.26, +0.13, −0.05)

Neither reading is wrong; they answer different questions. But it means **the frozen design sits near
its own resolution limit even given 2.5 months of reads**, which is the quantitative form of the
caveat `-inc-12` already stated in prose: this design can detect a large effect, not a subtle one. The
differences it actually shows (≤0.26 records) are below what it can resolve at the declared effect
size — so even a fully accrued after arm may return INSUFFICIENT or a null it cannot distinguish from
a small real effect.

### What the before arm shows, for the record

Over the frozen baseline window (`--to 2026-08-23T00:00:00.000Z`), when nothing was composed, the
treated arm runs *slightly deeper* than control in two classes of three (+0.26, +0.13, −0.05; walk
share +1.0, +2.9, +5.5 pts). Read as ADR-0428 intends, that is evidence about the **matching**, not
about composition — the arms are comparable-in-expectation rather than equated, and small positive
contrasts before any intervention are what that looks like.

---

## 3. What changed in the instruments

Both probes now refuse to state something they cannot support. Neither change alters any measurement.

**`probe:decision-composition-trial`**
- `TrialContrast.depthDifference` / `.walkShareDifference` are `number | null`; `null` whenever either
  arm is below the sizing floor, so every reader must handle the insufficient case at the type level.
- `minimumReadings` (per-arm sizing, two-sample, 80% power, α=0.05, against the run's pooled spread)
  and `sufficient` are reported whether or not the arm clears the bar.
- `MINIMUM_READINGS_FLOOR = 8` catches the degenerate σ, so a zero spread falls back to a floor rather
  than to "any arm will do".
- The floor is pooled over both arms and every class, so no thin cell can size itself cheaper than its
  siblings — `-inc-14`'s least-sensitive-comparison rule arriving here by construction.
- New `--effect <records>` flag.
- An `ARM POWER — READ THIS BEFORE ANY NUMBER ABOVE` block, which says outright that a table of
  INSUFFICIENT rows is not "composition changed nothing".

**`probe:amends-reach`**
- `afterArmIsConfounded(observedTo, instant)` — a pure predicate, decided from the arm's **observed**
  end rather than its declared one, so an open-ended run whose reads all predate the intervention is
  correctly reported clean.
- Any non-`UNDERPOWERED` verdict is stamped `NOT ATTRIBUTABLE`, and an `ATTRIBUTION` block names both
  events, prints the clean sub-arm's size, gives the `--to` re-run command, and states that the sub-arm
  is frozen.
- The closing paragraph's claim that `oq-retire-the-amends-edge` "stays open" was overtaken on
  2026-08-23 and is corrected in place.

**Power and attribution are different questions.** An arm can be large enough to resolve a direction
and still be unable to name its cause. Every guard on these probes before today answered the first
question; this is the first one that answers the second.

---

## 4. What is not claimed

- Not that the annotation failed. Not that it worked. The design cannot say.
- Not that the retirement was wrong — ADR-0431 was taken knowingly ahead of this evidence, and the
  before arm it accepted as the cost is unaffected by anything here.
- Not that composition changed nothing. Nobody has read enough of the treated arm to say.
- Neither probe is a gate rung, for the standing reason: their read half is a property of one
  laptop's transcript history, so nothing here is a repo invariant anyone could be held to.
