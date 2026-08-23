# Have reaches into amended decisions fallen? — 2026-08-23

Measured for `decision-read-measurement-arc` increment
`measure-reaches-into-amended-decisions`, against the frozen prior
[`decision-read-baseline-2026-08-23.md`](decision-read-baseline-2026-08-23.md). Reproduce with:

```
pnpm probe:amends-reach
```

ADR-0419 Decision 5 deferred "does `amends` still earn its keep" and named its own test: *"the
question becomes answerable once targets are self-describing: if reaches into amended decisions fall,
the edge has become pure provenance."* The first half of that precondition was satisfied on
2026-08-23, when the annotation drain reached 453/453. **This is the other half, which nobody had
run.** It MEASURES ONLY. It does not answer `oq-retire-the-amends-edge` and it moves nothing.

**The short answer, in four lines.**

1. **NOT YET ANSWERABLE, and that is a measured result rather than a shrug.** The intervention
   finished at `2026-08-23T05:39:57Z` — five and a half hours after the baseline window closed. The
   after arm therefore holds **8 decision-reading sessions** against the 28 needed to detect even a
   halving. All six comparisons return `UNDERPOWERED`.
2. **The BEFORE arm is now frozen, and it did not exist before today.** Over 409 sessions,
   **51.1% crossed an `amends` edge** in one sitting and **89.0% read an amended decision at all**.
   That is the number a later re-run subtracts from; without it the test could never have been run at
   all, whatever the after arm grew to.
3. **It becomes answerable in about two days.** Decision-reading sessions accrue at **10.7/day**, so
   the arm clears 28 on or after **2026-08-25** for a halving, and **2026-09-09** for a 20% fall.
   Nothing about the corpus needs to change; only the clock.
4. **The corpus half of the test has already failed in the other direction.** `amends` edges have not
   fallen since the freeze — they have **risen, 513 → 516** — and `dependsOn` sits at 11 edges over 5
   of 422 decision rows. Whatever the read measurement eventually says, the populations are not
   converging on their own.

---

## 1. Which instrument can answer this, and why it is not the one that was named

**Three artifacts name three different instruments for D5's sentence, and only one of them can see a
reach.** This is recorded first because the arc's own increment log already flags the question as
having been misread, and the misreading survived into the increment that commissioned this work.

| named by | instrument | what it actually measures | can it see a reach? |
|---|---|---|---|
| `-inc-04`'s arc entry | the drain **burndown** | annotation completeness | **No** — that is D5's *precondition* |
| this increment, and `oq-retire-the-amends-edge` option D | `probe:depth-from-work` | the **corpus's shape** — depth from a work anchor | **No** — it observes no reader |
| the frozen baseline §3's own definition | the **read record** | distinct sessions that read a decision | **Yes** |

`probe:depth-from-work` would print the same figure if every agent stopped reading the decision log
tomorrow, and the frozen baseline says so on its own face: it lists that probe under "corpus-SHAPE
depth, which is a different question from this document's behavioural one." The burndown probe is
additionally *gone* — ADR-0427 deleted it along with the annotation checker, which this increment
predicted and which a grep confirms (only a comment in `packages/library/src/index.ts` survives).

So the measurement is taken over the READ RECORD, through the gatherers
`probe:decision-baseline` already uses (`probe-decision-gather.ts`), so the two instruments cannot
drift apart on the population they measure. `probe:depth-from-work` was still run, and its answer is
§2 — it is a real half of the picture, just not the half that carries the word "reach".

### "Reach into an amended decision" is ambiguous, so all three readings are reported

D5's sentence does not say which it means, and silently picking one lets the measurement choose its
own answer. An **amended decision** is the TARGET of an `amends` edge. Then:

- **PLAIN REACH** — sessions that read an amended decision at all. The baseline §3 sense of reach.
- **CROSSING** — sessions that read BOTH ends of an `amends` edge in one sitting. This is the
  induced-subgraph rule `longestReadChain` already uses.
- **DIRECTION** — a crossing split by which end the session reached FIRST. This is the one that
  carries D5's *mechanism*. The annotation is written ON THE TARGET, so what it is supposed to remove
  is the reader who lands on an amended decision and is sent onward to its amender —
  **amended-first**. A session that read the amender first and then its target was never doing the
  thing the annotation discharges, and folding the two together dilutes exactly the signal under test.

---

## 2. The corpus, as of this run — and the half of D5's test that has already answered

From `pnpm probe:depth-from-work` — the instrument this increment was told to use, which answers this
half and only this half — and from `probe:amends-reach`'s own census. The two ran about twenty minutes
apart and agree on **both edge populations exactly** (516 / 11); they differ by one decision, because
ADR-0429 landed between the runs. The later figure is the one tabulated.

| | frozen (baseline §1) | now | change |
|---|---:|---:|---:|
| decisions | 414 | **422** | +8 |
| `amends` edges | 513 | **516** | **+3** |
| `dependsOn` edges | 0 | **11** | +11 |
| decision rows carrying `dependsOn` at all | 0 | **5** of 422 | +5 |
| amended decisions (distinct targets) | — | **237** | — |
| amenders (distinct sources) | — | **308** | — |

Counted apart and never summed (ADR-0419 D1).

**Two things worth reading off this table.** First, `amends` did not shrink — it grew by three edges
while `dependsOn` gained eleven, which is ADR-0419 D2's deprecation behaving exactly as the arc's own
memory predicts: the backlog is annotation debt rather than mislabelled support, so the split moves
only as new decisions are authored. Second, **237 of 422 decisions (56.2%) are amended.** More than
half the log is a target, which is why the plain-reach measure below sits near 90% and is a weak
discriminator: a session that reads any decision at all is more likely than not to have read an
amended one by chance.

---

## 3. Calibration — this instrument reproduces the freeze exactly

Before either arm is compared, the probe re-computes the frozen window (`2026-06-08T00:00:00.000Z` ..
`2026-08-23T00:00:00.000Z`) at window grain and checks itself against the frozen figures:

| | frozen | recomputed | |
|---|---:|---:|---|
| sessions that read a decision | 401 | **401** | AGREES |
| sessions that crossed an `amends` edge | 203 | **203** | AGREES |

The second row is the load-bearing one. The baseline's "walked a chain (depth ≥ 2)" figure was 203,
and over that window the support graph held 513 `amends` edges and **zero** `dependsOn` — so "walked
a chain" and "crossed an `amends` edge" were the same event, and the two instruments must agree
element for element. They do. That is the evidence that the numbers below are on the same series as
the freeze rather than a fresh reading of a moved corpus.

---

## 4. The BEFORE arm — frozen here for the first time

`2026-06-08T00:00:00.000Z` .. `2026-08-23T05:39:56.999Z`, i.e. the frozen baseline's window plus the
five hours and thirty-nine minutes of 2026-08-23 that elapsed before the drain finished. 2,835 reads.

| | window grain | slot grain |
|---|---:|---:|
| sessions that read a decision | 409 | 290 |
| **read an amended decision** | **364 (89.0%)** | **257 (88.6%)** |
| **crossed an `amends` edge** | **209 (51.1%)** | **151 (52.1%)** |
| (session, edge) crossings | 661 | 694 |
| distinct edges crossed | 327 of 516 | 321 of 516 |
| **amended-first** crossings | **344 (52.0%)** | **365 (52.6%)** |
| amender-first crossings | 304 | 318 |
| both ends first seen at one instant | 13 | 11 |
| sessions crossing a `dependsOn` edge | 1 | 1 |

Both grains are reported for the reason the baseline gives: a trace's slot is a pooled worktree that
unions several sittings, which can only lengthen a chain, while the window is the sitting itself. As
in the baseline, the axis is worth little here — the headline moves one point.

**Three findings in this table that stand on their own, whatever the after arm eventually says.**

**(a) The amended-first crossing is real and it is the majority.** 344 of 661 crossings (52.0%) are a
session landing on an amended decision and then going to its amender. That is precisely the read
ADR-0139 D4's annotation exists to discharge, it happens in about one crossing in two, and until
today nobody had counted it. It is also the sharpest instrument this measurement has: it is the only
one of the three whose *mechanism* the intervention targets directly.

**(b) Amended decisions are read about twice as heavily as unamended ones.** 220 amended decisions
were read, with a median reach of **4** sessions; 152 unamended decisions were read, median reach
**2**. Read this as observational and confounded, not causal — amended decisions are older and more
central by construction, which is *why* they attracted an amendment in the first place. It is
recorded because it bounds the upside: if `amends` were retired, the prose-only amendment would land
on the decisions that get read most, not on the tail.

**(c) 327 of 516 `amends` edges (63.4%) have actually been crossed by somebody.** The edge type is
not decorative. Whatever it costs to author, roughly two thirds of it has been walked at least once
inside the observed window.

---

## 5. The AFTER arm — and why it cannot answer yet

`2026-08-23T05:39:57.000Z` .. open. Observed `05:41:20Z` .. `11:13:21Z` — **five and a half hours.**

| | window grain | slot grain |
|---|---:|---:|
| reads | 19 | 19 |
| sessions that read a decision | **8** | **6** |
| read an amended decision | 5 (62.5%) | 5 (83.3%) |
| crossed an `amends` edge | 2 (25.0%) | 2 (33.3%) |
| (session, edge) crossings | 3 | 3 |
| amended-first crossings | 1 | 1 |

### The verdicts, all six

The arm must clear **28 sessions** before any measure returns a direction — the largest sizing in the
report, so that a high-base-rate measure cannot answer off an arm the load-bearing one cannot use.

| measure | before | after | verdict |
|---|---|---|---|
| [window] crossed an `amends` edge | 209/409 = 51.1% (CI 46.3–55.9) | 2/8 = 25.0% (CI 7.1–59.1) | **UNDERPOWERED** |
| [window] read an amended decision | 364/409 = 89.0% (CI 85.6–91.7) | 5/8 = 62.5% (CI 30.6–86.3) | **UNDERPOWERED** |
| [window] amended-first, of all crossings | 344/661 = 52.0% (CI 48.2–55.8) | 1/3 = 33.3% (CI 6.1–79.2) | **UNDERPOWERED** |
| [slot] crossed an `amends` edge | 151/290 = 52.1% (CI 46.3–57.8) | 2/6 = 33.3% (CI 9.7–70.0) | **UNDERPOWERED** |
| [slot] read an amended decision | 257/290 = 88.6% (CI 84.4–91.8) | 5/6 = 83.3% (CI 43.6–97.0) | **UNDERPOWERED** |
| [slot] amended-first, of all crossings | 365/694 = 52.6% (CI 48.9–56.3) | 1/3 = 33.3% (CI 6.1–79.2) | **UNDERPOWERED** |

Every after-arm interval comfortably contains its own baseline. The point estimates all sit lower —
25.0% against 51.1% is the eye-catching one — and **not one of them is distinguishable from no change
at all.** A Wilson interval of 7.1%–59.1% is what two crossings out of eight sessions actually knows.

### The one comparison that DID print a fall, and why it was wrong

This is recorded because it is the failure this document exists to avoid, and it was live for one
run. `[window] read an amended decision` initially returned **FALL** on 5 of 8 sessions: a 50%
relative fall from an 89% base is a 44-point absolute effect, so that measure's own power sizing is
satisfied by six sessions, and the Wilson upper bound (86.3%) cleared the baseline (89.0%) by two and
a half points. Technically significant; a single session reading differently would have flipped it.
Printed beside five `UNDERPOWERED` siblings, that one line would have been the whole finding and the
one number anybody quoted.

The fix is in the instrument, not in the prose: **no measure returns a direction until the after arm
could carry the least sensitive comparison in the same report.** It costs a true positive on the
cheap measures and removes the ability to cherry-pick whichever measure the arm happens to be big
enough for, which is the error that actually gets published. Regression-tested both ways
(`amends-reach.test.ts`).

### The after arm is not merely small, it is contaminated — and measurably so

Its eight sessions, by the decisions each read:

```
05:41Z  e7be671c   9
05:46Z  f90bbbcb   426
06:51Z  acf68d51   139, 419, 427     <- authored ADR-0427: retiring the amends checker
06:58Z  037403eb   426
10:57Z  e6b403d0   428
10:59Z  7ee396bf   2, 13, 425
10:59Z  c0304a73   419               <- THIS session, taking this measurement
11:12Z  d09a4d93   404, 422, 429
```

**Two of the eight are sessions working on the `amends` question itself**, including the one taking
this measurement. Session `acf68d51` — which authored ADR-0427 — supplies one of only two observed
crossings, by reading ADR-0419 alongside ADR-0139, which it amends. A session studying the amendment
machinery reads amenders and their targets together *because that is its subject*, so the
contamination biases the after arm **upward**, toward more reaching.

That direction matters for how a future run is read: it means a fall observed later is, if anything,
understated by whatever residue of this contamination survives, while a *rise* observed later would
be the more suspect result. It is also self-limiting — the share shrinks as the arm grows.

---

## 6. When this CAN be answered

Decision-reading sessions accrue at **10.71/day** at window grain, averaged over the fourteen full
days to 2026-08-22 (daily counts ranged 2–26; the mean is used because the arm accumulates linearly).
Against the before arm's 51.1% crossing rate, at 95% two-sided significance and 80% power:

| a relative fall of | to | sessions needed | ≈ days | re-run on or after |
|---:|---:|---:|---:|---|
| 50% (a halving) | 25.6% | 28 | 2.6 | **2026-08-25** |
| 40% | 30.7% | 45 | 4.2 | 2026-08-27 |
| 30% | 35.8% | 82 | 7.7 | 2026-08-30 |
| 20% | 40.9% | 186 | 17.4 | 2026-09-09 |
| 10% | 46.0% | 750 | 70.0 | 2026-11-01 |

**Two days buys the coarse answer; a fortnight buys a real one.** If the honest expectation is that
annotation removes *some* of the reaching rather than half of it, 2026-09-09 is the date that
matters, and re-running on 2026-08-25 will most likely return `UNDERPOWERED` again at anything below
`--fall 0.5`.

Nothing needs to be built, drained or decided for the answer to arrive — only time. Re-run:

```
pnpm probe:amends-reach --fall 0.3
```

---

## 7. Limits, named rather than implied

- **Every blind spot in the frozen baseline §5 applies unchanged**, because this uses the same
  gatherer: Codex runs, the primary checkout (`deriveIdentity()` rule 3), shell reads that do not
  name a path literally, `Grep` over a directory, the studio (no reader-side telemetry at all), and
  non-tool reads. All of them REMOVE reads.
- **The direction of that bias is not symmetric between the arms, and it is not a floor here.** In
  the baseline a lost read could only shorten a chain, which made a positive result robust. Here both
  arms lose reads the same way, so the *rates* are roughly unbiased — but the after arm's small
  denominator makes it far more sensitive to a handful of missed sessions than the before arm is.
- **A read is not comprehension, and a crossing is not a need.** A session that read both ends of an
  `amends` edge may have been browsing. Nothing here shows that the reaching was *necessary*, which
  is the claim D5 would need to conclude the edge earns its keep — only that it happened.
- **The split instant is derived, not stamped.** Batches 2 and 3 landed as live-store decision-row
  edits with no PR, so git records nothing. `2026-08-23T05:39:57Z` is the newest `updatedAt` across
  `-inc-09`'s 47 annotated targets, and `-inc-09`'s arc entry reports the WHOLE backlog at zero when
  it finished — which is what makes it the completion instant rather than merely its own last write.
- **Annotation was never all-or-nothing.** 272 of 446 edges (61%) were already annotated on
  2026-08-22, and the obligation has existed since ADR-0139. So the "before" arm is not an
  un-annotated corpus; it is a partly-annotated one, and the intervention measured here is the last
  39%. That makes any fall *harder* to detect, not easier.
- **A cross-sectional design was considered and rejected.** Comparing already-annotated targets
  against silent ones within the before window would be answerable today, but it requires
  reconstructing per-target annotation state — which is rebuilding the presence checker ADR-0427
  deleted, against that decision's explicit instruction. Not done.

---

## 8. What this does NOT decide

- **It does not answer `oq-retire-the-amends-edge`**, and it does not narrow it to one option.
- **It does not touch that question's named blocker.** `loadBearingReach` closes over `amends`
  ALONE; ADR-0419 D1 forbids a plain support edge promoting its target into the calibrate set; no
  replacement computation has been designed. A fan-out run before that design lands would leave
  `adr list --load-bearing` with no input. That is unchanged by anything above.
- **It does not retire, rewrite or schema-deprecate anything.** No edge moved, no decision body was
  edited, and `loadBearingReach` is untouched.
- **It says nothing about the composition fork.** ADR-0428 D7 fixes the order: the composition
  question is answered first, because frontiers are computed from these edges. This measurement may
  be taken at any time; the decision it feeds waits.

## Reproducing and extending

- `pnpm probe:amends-reach [--from <iso>] [--split <iso>] [--to <iso>] [--fall <0..1>] [--json-out <path>]`
  — the whole computation, including the self-calibration against the freeze. Exits non-zero only
  when the BEFORE arm measured nothing; an `UNDERPOWERED` comparison is a reading and exits 0.
- `pnpm probe:decision-baseline` — the frozen prior this is reported against.
- `pnpm probe:depth-from-work` — the corpus-SHAPE reading in §2.

The arithmetic is `packages/cli/src/amends-reach.ts` (pure, no clock and no world, 23 tests); the
gather and render are `packages/cli/src/probe-amends-reach.ts`. Both arms are filtered by
`withinWindow` from `decision-read-baseline.ts` — the frozen baseline's own window rule, exported
rather than copied, so an arm cannot drift from the number it is compared against.
