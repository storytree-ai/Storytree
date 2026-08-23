# Altitude and reach — 2026-08-23

Measured for `decision-read-measurement-arc-inc-03`. Reproduce with:

```
pnpm probe:decision-baseline --from 2026-06-08T00:00:00.000Z --to 2026-08-23T00:00:00.000Z --json-out baseline.json
pnpm probe:decision-altitude --baseline baseline.json
```

The arc's second hypothesis: the decision log is **altitude-mixed**, and that — not its size — is why
a 200-plus-artifact calibrate-to-these set cannot be calibrated on. "Own the agent loop" and "the
gate's skip code is 3" carry equal weight in one flat set. If reads cluster by altitude, a single flat
rollup is the wrong object and the edge-rollup design changes shape before anything is built.

**Ships a report, not a stored classification.** No altitude field is written onto any live artifact.
That is a separate decision with its own cost and this increment does not pre-empt it; the labels live
in `docs/research/decision-altitude-labels-2026-08-23.json` as a report input.

**The short answer, in four lines.**

1. **Reads do NOT cluster by altitude.** Mean reach is 3.83 (executive) / 4.11 (property) / 3.48
   (existence) — a **1.18x** spread across the whole log. Kruskal–Wallis **H = 4.025**, permutation
   **p = 0.132** over 416 decisions. The hypothesis is not supported.
2. **And that survives swapping the classifier.** Under a completely independent lexical
   classification the same test reads **p = 0.938**. Two different labelings, same answer: whatever
   altitude is, it does not predict how broadly a decision is read.
3. **The disagreement rate is the real finding, and it cuts the other way.** A committed mechanical
   classifier reproduces the editorial one only **52.4% of the time (kappa 0.288 — "fair")**, while
   the editorial rubric re-applied blind to the same decisions reproduces itself **91.7% of the time
   (kappa 0.873 — "almost perfect")**. Altitude is a **legible** distinction and a **non-automatable**
   one. Anything that sorts 416 decisions by altitude is paying for editorial judgment, every time.
4. **43% of support edges cross an altitude boundary.** 221 of 516 `amends` edges join two different
   classes. An altitude-sorted log cuts across nearly half the chains a rollup would compose.

---

## 1. The subject, and the two halves that move at different speeds

| | |
|---|---:|
| decisions in the live log | **416** |
| `amends` edges (resolvable, counted apart) | **516** |
| `dependsOn` edges (resolvable, counted apart) | **2** |
| `amends` targets the log does not hold | 0 |
| `dependsOn` pointers naming no decision | 0 |
| reads, from `-inc-02`'s frozen baseline | 2,782 over 401 context windows |
| decisions read by ≥1 window | 370 |
| decisions no observed session read | 46 |

**The READS are frozen; the SUBJECT is not, and the two are reported apart rather than reconciled.**
`-inc-02` froze at 414 decisions / 513 `amends` / 0 `dependsOn`; the log now holds 416 / 516 / 2. The
read half reproduced **exactly** — 2,782 reads, 401 windows, 203 walking a chain, deepest 9, the same
top-five reach rows element for element — which is what `-inc-02` predicted (transcripts are
append-only) and is the evidence that this join rests on the same instrument.

The two decisions added since the freeze are unread, which is why `decisionsNeverRead` moved 44 → 46.
Nothing below depends on them.

**The two support-edge populations are counted apart and never summed (ADR-0419 D1).** Where a union
figure appears in §5 it is labelled the *adjacency* — the thing the depth walk traverses — and is
printed beside the pair, never instead of it.

---

## 2. The rubric — fixed before a single decision was classified

Kruchten's ontology of architectural design decisions (2004). The increment fixes these three rather
than Anthony's strategic/control/operational triangle, because they are native to architectural
decisions and were not invented here to fit the answer.

- **EXISTENCE** (*ontocrisis*): the primary claim is that a named element exists, is composed a
  particular way, is moved or renamed, or is **removed** (Kruchten's *anticrisis* — a ban is still an
  existence claim). *Test: could you point at the thing the decision creates or deletes?*
- **PROPERTY** (*diacrisis*): the primary claim is an enduring, overarching trait, rule or constraint
  holding **across** elements and not itself a nameable element. *Test: is the claim a never/always
  that would still bind if the named elements were replaced?*
- **EXECUTIVE** (*pericrisis*): the primary claim concerns the **organisation of work** or the
  **choice of an external technology, vendor or tool** — driven by the business environment. *Test:
  would this change if we bought differently or staffed differently, without the software's own
  structure or invariants changing?*

### The one adaptation this log forces, declared rather than smuggled

Kruchten defines EXECUTIVE by its **driver** — "affects the development process". **This project's
product IS a development process**, so read literally that class swallows most of the log and the
taxonomy collapses to one bucket. The line taken:

> EXECUTIVE is judged against **our own** way of working and **our own** purchasing — how sessions
> land work, which vendor we pay, what the human owner must do — **not** against the process
> storytree implements as a shipped product. A decision that builds a ceremony INTO the software is
> EXISTENCE or PROPERTY; a decision that tells a human or a session how to behave is EXECUTIVE.

### Precedence, because real decisions carry more than one claim

Classify by the **primary claim** — the assertion the title makes. Where two are genuinely balanced,
the tie-break is fixed: **EXISTENCE > PROPERTY > EXECUTIVE**. Existence first because it is the most
concrete and therefore the least arbitrary; executive last because its definition is the broadest and
would otherwise absorb every tie.

### The altitude reading under test, written down so it could fail

Kruchten's three are a **kind** taxonomy, not strictly an altitude ladder. The reading tested is the
one implied by scope-of-effect — **EXECUTIVE ≳ PROPERTY > EXISTENCE** — because executive and property
decisions constrain many elements while an existence decision is local to the one it names. If reads
cluster by altitude, executive and property decisions should be read **broadly** and existence
decisions **narrowly**.

**What the classifier may see:** title and `## Decision` prose. Not reach, not chain depth, not the
offer record. Classify first, join second. In `classifyAltitudeLexically` the blindness is structural
rather than promised in a comment — there is no parameter through which reach could arrive.

---

## 3. Three passes, and what each one actually is

| pass | what it is | covers |
|---|---|---:|
| **A** | **Editorial.** One reading of each decision's title plus its `## Decision` prose, blind to every read figure. The primary classification. | 416 |
| **B** | **Lexical.** A committed, deterministic classifier (`classifyAltitudeLexically`) scoring three signal families derived from Kruchten's definitions. Independent of pass A's labels; re-derivable by anyone. | 416 |
| **C** | **Blind re-test.** The `## Decision` prose alone — no number, no title, no status, presentation order scrambled by a key uncorrelated with the draw — over a seeded held-out sample. | 48 |

### Pass C is a replication, not a second rater, and the report will not pretend otherwise

The increment asks for "a second independent pass". **What was available was the same rater under a
reduced presentation**, and calling that inter-rater reliability would be the more comfortable lie.
It measures whether the rubric is **stable** — can the same rubric, applied to the prose alone with
every identity cue removed, land on the same class? — which is a real and necessary question, and a
strictly weaker one than whether two minds agree. **The true inter-rater number is unmeasured**, and
that is a named gap, not a rounding error, because it bounds exactly one reading in §4.

**The held-out sample is DRAWN, never picked**: `drawHeldOutSample(population, {seed: 20260823, size:
48})` over the sorted decision numbers. The probe re-derives it and refuses if pass C's coverage does
not match, so it cannot be quietly reshaped after the labels are known.

**Four of the 48 are declared contaminated.** ADRs 12, 43, 240 and 329 had their titles re-exposed
between the draw and the pass, during the §7 extractor-defect review. Agreement is reported with and
without them; the difference is 0.8 percentage points.

### The class distribution the two mechanical passes produce

| class | pass A (editorial) | pass B (lexical) |
|---|---:|---:|
| existence | **175** (42.1%) | 143 (34.4%) |
| property | **131** (31.5%) | 112 (26.9%) |
| executive | **110** (26.4%) | 161 (38.7%) |

Pass B flagged **22 near-ties** (5.3%) — decisions whose top two class scores sit within 0.15.

---

## 4. AGREEMENT — the finding the increment predicted would be worth more than the join

The increment's brief: *"a classification the two passes disagree on is not one a rollup can be built
over, and that disagreement rate is itself a finding worth more than the join."* It was right.

| comparison | compared | agreed | rate | expected by chance | **kappa** |
|---|---:|---:|---:|---:|---:|
| A vs B, whole log | 416 | 218 | 52.4% | 33.2% | **0.288** |
| A vs C, held-out | 48 | 44 | 91.7% | 34.3% | **0.873** |
| A vs C, contamination excluded | 44 | 40 | 90.9% | 34.7% | **0.861** |
| B vs C, held-out | 48 | 29 | 60.4% | 33.6% | **0.404** |

**Kappa is reported beside every rate, never the rate alone.** This log's altitude distribution is
uneven, so a raw rate rewards two passes for sharing a prior about which class is commonest. Kappa
subtracts each pass's own marginal habits; on the Landis–Koch bands, 0.288 is "fair" and 0.873 is
"almost perfect".

### Where the passes part

| A vs B | count | | A vs C | count |
|---|---:|---|---|---:|
| existence → executive | 47 | | executive → existence | 2 |
| existence → property | 42 | | property → existence | 1 |
| property → existence | 39 | | existence → executive | 1 |
| property → executive | 37 | | | |
| executive → existence | 18 | | | |
| executive → property | 15 | | | |

The lexical classifier's errors are **not concentrated on one boundary** — it disagrees roughly evenly
in all six directions, which is the signature of a classifier that is not tracking the distinction at
all rather than one that draws it slightly differently. Its bias is legible in §3's table: it over-
assigns EXECUTIVE (161 against 110), because this project's decisions are written in the vocabulary of
its own working — sessions, ceremonies, agents, cost — whatever they are actually deciding.

### What this means for anything built on altitude

**Altitude is legible but not automatable.** A human-grade reading reproduces itself at kappa 0.873;
a mechanical proxy over the same text reaches 0.288. So:

- A design that **sorts the decision log by altitude** is buying editorial judgment on 416 rows, and
  again on every row added. That is a real recurring cost, and it must be named in the design rather
  than assumed away as "we'll classify them".
- A design that proposes to **derive** altitude from the decision text is refuted here at the cheapest
  possible price: the classifier exists, it is committed, and it does not work.
- The 5.3% near-tie rate is the *optimistic* reading of the lexical pass's confidence. Its real
  problem is not indecision — it is confident disagreement.

---

## 5. THE JOIN — does reach differ by altitude?

**An unread decision is a 0, not a missing row.** Each class's reach vector covers **every** classified
decision, with 0 entered for the 46 no session read. Restricting the test to decisions that were read
would compare the classes on a subset selected by the very variable under test, and would report a
difference in reach *among the read* while the real difference — whether a class gets read at all —
silently left the denominator.

### Result — pass A (editorial), the primary reading

| class | decisions | share of log | read | never read | total reach | share of reach | mean | median | max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| executive | 110 | 26.4% | 102 | 8 | 421 | 26.8% | 3.83 | 2.0 | 31 |
| property | 131 | 31.5% | 121 | 10 | 538 | 34.3% | 4.11 | 3.0 | 16 |
| existence | 175 | 42.1% | 147 | 28 | 609 | 38.8% | 3.48 | 2.0 | 23 |

- **Kruskal–Wallis H = 4.025** over 3 classes and **416 decisions**
- **permutation p = 0.1322** (20,000 shuffles, seed 20260823)
- median spread **1.0**; mean ratio **1.18x**

**Each class's share of all reach tracks its share of the log to within a few points.** Executive is
26.4% of the log and takes 26.8% of the reach. That is what "no clustering" looks like in plain terms:
a class gets read in proportion to how much of the log it is.

**Why a permutation test and not a chi-square approximation.** The reach distribution is severely
non-normal — median 3, maximum 31, and 46 zeros — and a permutation test needs no special-function
implementation that would itself have to be trusted. The null being permuted is exactly the one in
question: that a decision's altitude tells you nothing about how broadly it is read. The seed is
declared and the generator is deterministic, so the p-value is reproducible **to the digit** rather
than merely in distribution — which also removes the temptation to re-run until it reads well.

### Sensitivity — the same join under pass B's labels

| class | decisions | read | never read | total reach | mean | median |
|---|---:|---:|---:|---:|---:|---:|
| executive | 161 | 139 | 22 | 662 | 4.11 | 3.0 |
| property | 112 | 103 | 9 | 389 | 3.47 | 3.0 |
| existence | 143 | 128 | 15 | 517 | 3.62 | 2.0 |

**H = 0.133, permutation p = 0.9381.**

This is the load-bearing robustness check. Pass B disagrees with pass A about **half** the log — and
reaches the same verdict, more emphatically. The conclusion therefore does not rest on the editorial
classification being right; it survives being handed a substantially different one. **A poor
classifier and a good one agree that altitude does not predict reach**, which is a far stronger
statement than either alone, and it is why §4's low kappa does not undermine §5.

---

## 6. Two post-hoc observations, labelled as such

The pre-registered test is the reach distribution above. These two came out of looking at the table
afterwards and are reported at that weight — a lead for `-inc-04`, never a finding this increment
claims.

**(a) Existence decisions are about twice as likely never to have been read.**

| class | never read | of | rate |
|---|---:|---:|---:|
| executive | 8 | 110 | 7.3% |
| property | 10 | 131 | 7.6% |
| existence | 28 | 175 | **16.0%** |

Run through the same permutation machinery over a binary vector: H = 7.492, **p = 0.0248**. It points
the way the rubric predicted (existence lowest). **It is post-hoc**, it is one of several tables that
could have been looked at, and no correction for that has been applied — so it is a hypothesis for a
later increment to pre-register, not a result.

**(b) The head of the reach distribution has no altitude at all.**

| | executive | property | existence |
|---|---:|---:|---:|
| top 10 by reach | 3 | 3 | 4 |
| top 20 by reach | 5 | 7 | 8 |
| top 40 by reach | 8 | 17 | 15 |
| *(class share of the whole log)* | *26.4%* | *31.5%* | *42.1%* |

The top 20 splits 5 / 7 / 8 against an expected 5.3 / 6.3 / 8.4. **The most-read decisions are not
higher-altitude than the rest.** This closes off the natural rescue of the hypothesis — that the
overall test is diluted by a long tail while the hot end is where altitude shows — and it composes
with `-inc-02`'s finding that there is no small hot core to begin with.

---

## 7. SUPPORT EDGES — chains do not respect altitude either

| population | edges | joined | within class | cross class | top pairs |
|---|---:|---:|---:|---:|---|
| `amends` | 516 | 516 | 295 (57.2%) | **221 (42.8%)** | exis→exis 134, prop→prop 94, exec→exec 67 |
| `dependsOn` | 2 | 2 | 1 | 1 | exis→exec 1, exis→exis 1 |
| *union adjacency* | *518* | *518* | *296* | *222* | *exis→exis 135, prop→prop 94, exec→exec 67* |

Every edge joined — both endpoints classified — so this split rests on no unresolved remainder.

**This is the result with the most direct bearing on the edge-rollup design.** A rollup composed at a
chain frontier composes whatever the chain contains, and **43% of the time the chain crosses an
altitude boundary**. So "sort the log by altitude first" does not partition the graph a rollup would
walk; it cuts across it. Any design that treats altitude as a *partition* rather than as an
*annotation* has to answer for those 221 edges.

The `dependsOn` row is two edges and says nothing on its own. It is printed because a denominator that
is small must be visible as small rather than absent — and because ADR-0419 D1 requires the two
populations to be counted apart. The union row is labelled as the **adjacency** the depth walk
traverses, printed beside the pair rather than instead of it.

---

## 8. Every denominator, and every blind spot

**What could have made this reading vacuous, and did not.** `altitudeVacuity` returns REASONS rather
than a boolean, because the causes have different remedies, and the probe exits non-zero on any of
them. The reading above carries **none**:

- the decision log resolving to 0 decisions
- no label resolving onto a decision the log holds — **the failure this file is shaped around**: a
  label set whose ids all failed to resolve produces three empty classes, H = 0 and p = 1, which reads
  as "altitude does not predict reach" and is in fact "the join was invisible"
- the taxonomy collapsing to fewer than two non-empty classes
- an empty reach record, or a reach record joining nothing
- an all-zero reach vector
- fewer than 10 observations entering the test

**So "no clustering" here is a finding, and it exits 0. "Nothing was classified" exits 1.** They are
different states and the instrument prints them differently; that is the `DepthFromWorkVerdict`
discipline reused rather than re-derived.

**The join key is a number both sides already resolved.** Reach rows arrive from
`decision-read-baseline.ts`, which resolved every observed id through `resolveDecisionId` before
counting it; labels arrive keyed by an id string and go through **the same function**. No string is
compared to a string anywhere. `-inc-01` measured what a raw join costs on this corpus — 0.9% against
32.4%, a ~35x under-count that reports no error — and an altitude join is precisely where that would
hide, because a class whose labels all failed to resolve reads as a class nobody consults. Pass A: 416
labels, **416 resolved, 0 unresolved, 0 duplicates**.

### A defect in this increment's own instrument, found and corrected mid-flight

The first `## Decision` extractor was written as
`/^##\s+Decision[^\n]*\n([\s\S]*?)(?=^##\s|\Z)/mi`. **JavaScript has no `\Z` anchor** — that
alternation branch is a **literal `z`** — so every section was cut at its first one:
`Operationali|ze`, `normali|zed`, `reali|zes`. It truncated **228 of 416** sections, 30 of them to
under 200 characters, while still returning plausible prose, which is why nothing about the output
looked wrong.

Handled, in full:

- The committed extractor is index arithmetic, and `decision-section.test.ts` fails if the lookahead
  returns.
- **34 decisions** — every one where pass A saw less prose than its excerpt cap allowed — were
  re-read against the corrected text and re-judged. **One label changed** (ADR-0007, existence →
  property; its `## Decision` section is a proof-mode table and reads as a rule about what proves
  what, which is only visible past the cut). That is a 2.9% revision rate on the affected rows, and
  it happened before any join was computed.
- Four of those 34 fall inside the held-out sample, which is the contamination declared in §3.

### What this instrument cannot see, named rather than implied

- **The true inter-rater number.** §3's limitation. Pass C is stability, not independence. If altitude
  is to carry a design, a genuinely independent second classification is the measurement that is
  still owed.
- **Everything `-inc-02`'s §5 names**, inherited unchanged: Codex runs, the primary checkout (218
  reads declined by `deriveIdentity()` rule 3), shell reads that do not name a path literally, `Grep`
  over a directory, `adr pull` at the live observer, and the studio, which has no reader-side
  telemetry at all.
- **The direction of the bias, and why it does not rescue the hypothesis.** Every blind spot REMOVES
  reads. For a *clustering* test that is far weaker than it was for `-inc-02`'s chain depth: lost
  capture would have to be **systematically concentrated in one altitude class** to manufacture a null
  result, and there is no mechanism by which a Codex run or an unquoted shell path would prefer
  executive decisions over existence ones. A null here is not obviously an artefact of thin capture —
  but it is a null over the population this instrument can see, and that is the honest scope.
- **A read is not comprehension.** A model given insufficient context answers confidently rather than
  abstaining. Nothing here says agents are reading the decision log and getting on fine.

---

## 9. What this does and does not decide

**Decides, on evidence:**

- The altitude hypothesis is **not supported**. Reads do not cluster by Kruchten class, under either
  of two substantially different classifications of the same 416 decisions.
- Altitude is **not mechanically derivable** from decision text at usable quality (kappa 0.288). Any
  design that needs it must budget for editorial judgment per decision, forever.
- Altitude is **not a partition of the support graph**: 43% of `amends` edges cross a class boundary.

**Does not decide:**

- Whether decisions should carry a composed statement at a chain frontier, nor whether the composed
  unit is the DOCUMENT or the CLAUSE. That fork is `-inc-04`'s, and ADR-0419 D5 gates on it.
- Whether some *other* axis separates the log where altitude does not. Nothing here tests one.
- Whether an altitude field should be stored on live artifacts. That is a separate decision with its
  own cost, and this increment deliberately does not pre-empt it — hence a report and a labels file
  rather than 416 writes.
- Anything about `-inc-02`'s three frozen numbers, which are unchanged and were re-derived exactly.

**The one thing `-inc-04` should carry forward from here.** The arc opened by asking whether the
calibrate-to-these set is unusable because it is altitude-mixed. It is mixed — the three classes are
all substantially populated and an editorial reader separates them reliably — but **the mixing is not
what makes it hard to consult**, because sessions read across the classes in proportion to their size
and walk chains straight through the boundaries. Sorting the log by altitude would be a genuine
editorial expense buying a partition the reading behaviour does not respect. Whatever the remedy is,
this is not it.

**And it is the second partition to fail, which is the more useful shape of the result.** `-inc-04`,
run in parallel with this increment, found the support graph is **one giant component** — 310 of 416
decisions, carrying 85% of observed walks — so there are no separable topic clusters to slice either.
Two independent attempts to find a seam in this log, on two unrelated axes, both came back empty.
Neither increment set out to say that jointly, and it is worth more than either alone: the composable
unit is looking like the **chain frontier** rather than any grouping of whole documents.

## Reproducing and extending

- `pnpm probe:decision-altitude --baseline <path> [--labels <path>] [--seed N] [--iterations N]` —
  the whole reading. Exits non-zero on any VACUITY reason, so a table of nulls can never print under a
  success banner.
- `pnpm probe:decision-baseline --json-out <path>` — `-inc-02`'s frozen baseline; the reach half of
  this join, never recomputed here.
- Labels: `docs/research/decision-altitude-labels-2026-08-23.json` (pass A over 416, pass C over the
  seeded 48). A report input, not a stored classification.
- The arithmetic is `packages/cli/src/decision-altitude.ts` (pure, no world of its own, 56 tests,
  mutation-tested 10 ways — every mutant killed); the gather is
  `packages/cli/src/probe-decision-altitude.ts`.
