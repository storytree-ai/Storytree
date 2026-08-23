# The frozen decision-read baseline — 2026-08-23

Measured for `decision-read-measurement-arc-inc-02`. Reproduce with:

```
pnpm probe:decision-baseline --from 2026-06-08T00:00:00.000Z --to 2026-08-23T00:00:00.000Z --top 25
```

**This is a PRIOR, frozen before any intervention exists**, so that a later trial of the edge-rollup
design is a comparison against a fixed number rather than a story told afterwards. Nothing here
decides the design fork; ADR-0419 D5 makes that decision explicitly evidence-gated on this
measurement, and the write-up of the fork belongs to `-inc-04`.

**The short answer, in three lines.**

1. **Sessions DO walk decision chains.** 203 of 401 context windows that read a decision (**50.6%**)
   read two or more decisions on a single support chain in one sitting; 89 (22.2%) reached three or
   more; the deepest single sitting walked **nine**. The edge-rollup hypothesis was put at genuine
   risk by this number and it survived.
2. **Reach is BROAD and THIN.** 370 of 414 decisions (89.4%) were read by at least one window, but the
   most-read decision reached only **31 of 401** windows (7.7%) and the median decision reached **3**.
   There is no small hot core to compose first.
3. **Offers are overwhelmingly NOISE.** Only **4.7%** of decision pointers offered to an agent were
   followed, and **112 of 152** offered decisions were never followed once. The single most-offered
   decision is 32.2% of all decision offers and is followed 2.7% of the time.

---

## 1. The declared window, and what "frozen" means here

| | |
|---|---|
| Declared window | `2026-06-08T00:00:00.000Z` .. `2026-08-23T00:00:00.000Z` |
| Observed inside it | `2026-06-08T01:20:23.863Z` .. `2026-08-22T23:59:44.456Z` |
| Reads | 2,782, all resolved to a decision, 0 unresolved |
| Offers | 10,953 recorded, 3,353 resolving to a decision |
| Transcript files swept | 4,330 |
| Trace sessions holding the offer record | 624 |

The window's upper bound is the start of the day the baseline was taken, deliberately: transcripts
are append-only, so a re-run with these same bounds on this machine returns the same numbers. That
was **verified, not assumed** — the probe was run twice and the machine-readable output was
**byte-identical** across the two runs.

One figure in the probe's output is deliberately NOT windowed and moved between those two runs:
`tool calls that NAMED a decision and yielded no read` (7,476 then 7,480). It is the extractor's own
blindness denominator, counted per tool call at scan time, and it grows as this disk does. It is not
one of the three numbers and nothing below rests on it.

**The subject, as of the freeze:** 414 decisions; **513 `amends` edges** and **0 `dependsOn` edges**,
counted apart and never summed (ADR-0419 D1). Zero of 414 decision rows carry the `dependsOn` field
at all — which is the expected state part-way through ADR-0419 D3's deliberately long, reader-first
migration, and is reported as a denominator so a zero cannot be mistaken for a blind reader.

---

## 2. CHAIN DEPTH — the arc's load-bearing number

**What it measures.** For one session in one sitting, take the set of decisions it read, restrict the
support graph to that set, and take the longest directed path. A session that read ADR-0139 and
ADR-0402, where the first amends the second, walked a chain of 2. A session that read two unrelated
decisions walked two chains of 1. **Only edges whose BOTH ends were read count** — an edge the
session never crossed is not a chain it walked, and that is what makes this a measurement of
behaviour rather than of the corpus's shape (which `probe:depth-from-work` already reports).

**Why it is load-bearing.** An edge rollup at a chain frontier removes exactly the cost of walking a
chain. If sessions do not walk chains, the rollup buys nothing and the hypothesis is falsified. This
number was the arc's own falsification test.

### Result — window grain (one host context window, i.e. one sitting)

| depth | windows | share of reading windows |
|---:|---:|---:|
| 1 | 198 | 49.4% |
| 2 | 114 | 28.4% |
| 3 | 55 | 13.7% |
| 4 | 23 | 5.7% |
| 5 | 4 | 1.0% |
| 6 | 5 | 1.2% |
| 7 | 1 | 0.2% |
| 9 | 1 | 0.2% |

- Windows that read at least one decision: **401**
- Windows that walked a chain (depth ≥ 2): **203 of 401 (50.6%)**
- Windows that reached depth ≥ 3: **89 (22.2%)**
- Deepest single sitting: **9**

The deepest chain, verified by hand against the live store edge by edge:

```
ADR-0380 -> ADR-0367 -> ADR-0280 -> ADR-0274 -> ADR-0230 -> ADR-0219 -> ADR-0217 -> ADR-0214 -> ADR-0069
```

**Reported as a distribution and never as a mean.** Half the population sits at depth 1 and one
window sits at 9; a mean over that describes neither.

### The identity axis was worth almost nothing HERE, and that is itself a finding

A trace's `sessionId` is the pooled worktree SLOT for every line written before window identity
existed, and pooling has already published one wrong number on this project — "one document pulled 28
times in one session" was eleven-plus sessions over 15 days (`re-reading-cost-and-mechanism-2026-08-22`
§3(a)), where pooling by slot moved the re-read share ×2.39 and the re-read cost share ×5.7.

So this baseline computes chain depth at **both** grains rather than picking one:

| | windows | slots |
|---|---:|---:|
| sessions that read a decision | 401 | 282 |
| walked a chain (depth ≥ 2) | 203 (50.6%) | 147 (52.1%) |
| deepest sitting | 9 | 9 |

**Pooling factor: 1.422** windows per slot, and the headline moves by 1.5 percentage points. On the
re-read measurement the same axis was worth a factor of several; here it is worth almost nothing,
because a decision-reading sitting is largely a whole slot's decision traffic anyway. **Carrying the
window id was still the right call** — the correction had to be measured to be known to be small, and
the alternative was to publish a number whose bias direction was unknown.

---

## 3. REACH — decisions ranked by DISTINCT SESSIONS

Ranked by distinct sessions, never by raw read count: one session re-reading a decision twenty times
is one session's evidence of heat, and a rank on the raw count lets one grinding session manufacture
the corpus's hottest decision.

| | |
|---|---:|
| decisions read by ≥1 window | 370 of 414 (89.4%) |
| decisions no observed session read | 44 (10.6%) |
| most-read decision | ADR-0252, **31 of 401** windows (7.7%) |
| median decision | **3** windows |
| decisions read by ≥10 windows | 41 |
| decisions read by ≥5 windows | 116 |
| decisions read by exactly 1 window | 89 |
| share of all reach held by the top 20 decisions | 19.6% |

Top ten by distinct windows:

| decision | windows | raw reads |
|---|---:|---:|
| ADR-0252 | 31 | 64 |
| ADR-0200 | 23 | 39 |
| ADR-0235 | 20 | 31 |
| ADR-0311 | 18 | 37 |
| ADR-0168 | 16 | 30 |
| ADR-0139 | 16 | 24 |
| ADR-0241 | 15 | 25 |
| ADR-0248 | 14 | 30 |
| ADR-0275 | 14 | 22 |
| ADR-0257 | 13 | 37 |

**The shape matters more than the ranking.** Reach is broad and flat: nearly nine decisions in ten
have been consulted by someone, no decision is consulted by more than one window in thirteen, and the
top twenty hold under a fifth of all reach. A design that composes "the hot ones first" has no small
hot set to start from — which is a constraint on the intervention, and is exactly the kind of thing a
prior is supposed to surface before anything is built.

---

## 4. OFFER-TO-FOLLOW — separating heat from noise

An offer is one decision pointer inside one rendered candidate set. A FOLLOW is a read of that
decision, in the same worktree slot, at or after the offer.

**The join is deliberately generous and the number is still small.** "At or after, ever, in the same
slot" counts a read three weeks later in a different sitting as a follow of an offer it almost
certainly had nothing to do with. That inflates the follow rate, so the figure below is an upper
bound on any tighter definition.

| | |
|---|---:|
| offers recorded | 10,953 |
| offers resolving to a decision | 3,353 (30.6%) |
| offers followed | **156 of 3,353 (4.7%)** |
| distinct decisions offered | 152 |
| offered and never once followed | **112 of 152 (73.7%)** |

The 30.6% decision share of all offers independently reproduces the previously measured "roughly 29%
of everything offered to an agent is a decision pointer", from a different instrument and a different
population — a useful cross-check that the offer side of the join is not mis-parsing.

**Offer rank and reach rank are close to unrelated**, which is the whole reason this number exists:

| decision | offered | reach rank |
|---|---:|---|
| ADR-0183 | 1,081 | #29 |
| ADR-0034 | 165 | #115 |
| ADR-0168 | 105 | #5 |
| ADR-0032 | 95 | #153 |
| ADR-0024 | 88 | #128 |
| ADR-0154 | 67 | #31 |
| ADR-0161 | 65 | #32 |
| ADR-0095 | 64 | #69 |
| ADR-0023 | 62 | #131 |
| ADR-0031 | 61 | #68 |

ADR-0183 alone is **32.2% of every decision pointer this project has ever offered an agent** and is
followed 2.7% of the time; ADR-0032 is offered 95 times, followed 0. A rank built on offers — or on
any "what does the corpus point at" proxy — would put these at the top of a composition worklist and
be wrong about most of them.

---

## 5. Every denominator, and every blind spot

**Instrument coverage, as measured:**

| | |
|---|---:|
| reads carrying a host window id | 2,782 of 2,782 (100%) |
| reads whose id failed to resolve to a decision | 0 |
| reads onto a decision number the log does not hold | 6 |
| reads reached but attributable to no storytree session | 218 |
| trace sessions with no single slot to join an offer on | 6 of 624 |
| trace sessions of mixed identity grade | 0 |

**The join, censused on both sides.** Both live spellings appear on both sides at once, so a join on
the raw id string would have silently dropped every crossing pair and reported a confident, low
follow rate:

| spelling | reads | offers |
|---|---:|---:|
| `doc:decisions/NNNN-slug.md` | 2,672 | 3,300 |
| bare `adr-NNNN` | 110 | 53 |

Every id on both sides is resolved to a decision NUMBER through the single parser in
`decision-pointer.ts` before anything is joined, and `readsUnresolved: 0` is the evidence that the
resolution is not silently dropping a spelling.

**Which instrument shape saw each read** — kept apart because a scraped shell command and an exact
`Read` are not the same quality of observation:

| surface | reads |
|---|---:|
| `host-transcript-file-read` | 1,645 |
| `host-transcript-shell` | 825 |
| `host-transcript-grep` | 202 |
| `host-transcript-cli-read` | 110 |

**What this instrument cannot see, named rather than implied:** Codex runs (outside the Claude
harness entirely); the primary checkout, which `deriveIdentity()` rule 3 refuses by design — 218
reads were reached and declined on exactly this ground; shell reads that do not name the path
literally (heredocs, `$VAR`, globs, `git show HEAD:…`); `Grep` over a directory rather than a file;
and non-tool reads (auto-loaded guidance, `@file` mentions, Skill-loaded files), which are untested
and therefore declared unknown rather than absent.

**Every figure here is a FLOOR, and the bias is two-sided.** Capture blind spots REMOVE reads, and
removing a decision from a session's read set can only shorten the longest chain that set contains —
so lost capture pushes chain depth DOWN. Slot pooling UNIONS several sittings into one, which can
only lengthen it — so pooling pushes the slot-grained figure UP. That is why both grains are printed
and no blended number is offered.

**And a read is not comprehension.** A model given insufficient context answers confidently rather
than abstaining, so nothing above supports the conclusion that agents are reading the decision log
and getting on fine.

---

## 6. Why this was frozen without `-inc-01` finishing, and what `-inc-01` still owes

`-inc-01` — establish what the traversal instrument can and cannot see for decision reads — is `active`
and parked on the same arc. Freezing a baseline on an instrument with unmeasured blind spots is the
one failure this arc cannot afford, so the question was settled explicitly rather than assumed away.

**Two of `-inc-01`'s three questions are answered by this measurement itself**, by evidence rather
than by reading the source:

- *Does a live `library artifact adr-NNNN` read reach the record, and under an id form that joins to
  the offers?* Yes. 110 reads arrived on the `host-transcript-cli-read` surface, and the id-form
  census above shows both live spellings present on BOTH sides with zero unresolved reads. The join
  is not silently dropping a spelling — which is precisely the failure `-inc-01` names as "the numbers
  would compute and be wrong".
- *Its second half* — does the depth walk traverse a decision's own `dependsOn`? — was overtaken and
  answered by `-inc-05` (PR #1563) and `-inc-08` (PR #1564), which landed before this freeze.

**What `-inc-01` still owes is the SIZE of the unobserved paths**, listed in §5 and unsized. That
bounds one specific reading, and only one:

- The **falsification** reading. Every unobserved path removes reads, and removing reads can only
  shorten chains. So **50.6% is a floor**, and closing the blind spots can only raise it. A POSITIVE
  result is therefore robust without `-inc-01`; had this come back near zero it would NOT have been,
  because an unmeasured blind spot would have been an equally good explanation. The measurement
  decided its own admissibility, in the direction that makes it admissible.
- The **absolute** reading — "half of all sittings walk a chain" — is a floor on a population this
  instrument can see, not a claim about all sessions. `-inc-01` is what would make it the latter.

Nothing else in this document depends on the unsized blind spots.

---

## 7. What this does NOT decide

- It does not decide whether decisions should carry a composed statement at a chain frontier, nor
  whether the composed unit is the decision DOCUMENT or the CLAUSE. That is the fork `-inc-04` writes
  up and leaves open, and ADR-0419 D5 gates on it.
- It does not name a held-out CONTROL set. `-inc-04` owns that, and a later trial without one measures
  the week rather than the change.
- It says nothing about ALTITUDE — whether reads cluster on strategic or operational decisions.
  That is `-inc-03`, and the reach data above is its input.
- It is not a comprehension measure, and it is not evidence that the current arrangement is working.

## Reproducing and extending

- `pnpm probe:decision-baseline [--from <iso>] [--to <iso>] [--top <n>] [--json-out <path>]` —
  the whole computation. Exits non-zero on any VACUITY reason, so a table of zeros can never print
  under a success banner.
- `pnpm probe:decision-reads` — the batch ingest that fills the trace record from host transcripts,
  with its own blindness verdict.
- `pnpm probe:adr-graph` — the decision-graph census and the acyclicity proof.
- `pnpm probe:depth-from-work` — corpus-SHAPE depth, which is a different question from this
  document's behavioural one.

The arithmetic is `packages/cli/src/decision-read-baseline.ts` (pure, no world of its own); the
gather is `packages/cli/src/probe-decision-baseline.ts`; the render is
`packages/cli/src/render-decision-baseline.ts`.
