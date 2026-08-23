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
   followed, and **111 of 151** offered decisions were never followed once. The single most-offered
   decision is 32.3% of all decision offers and is followed 2.7% of the time.

---

## 1. The declared window, and what "frozen" means here

| | |
|---|---|
| Declared window | `2026-06-08T00:00:00.000Z` .. `2026-08-23T00:00:00.000Z` |
| Observed inside it | `2026-06-08T01:20:23.863Z` .. `2026-08-22T23:59:44.456Z` |
| Reads | 2,782, all resolved to a decision, 0 unresolved |
| Offers | 10,951 recorded, 3,351 resolving to a decision |
| Transcript files swept | 4,330 |
| Trace sessions holding the offer record | 624 |

The window's upper bound is the start of the day the baseline was taken, deliberately.

**The READ figures are reproducible; the OFFER figures are reproducible only against a fixed trace
store, and this one is live.** That distinction was verified rather than assumed, and the two halves
were checked separately because they behave differently.

Reads come from host transcripts, which are append-only. Two consecutive runs of the same code
produced **byte-identical** machine-readable output. A third run, taken after the code changed to
reconcile with `-inc-01`, still agreed with them on **every read-side field**: the read counts, the
window-id coverage, `decisionsReachedByWindow` / `BySlot`, `decisionsNeverRead`, the pooling factor,
the observed window bounds, and both chain-depth readings and both reach rankings **element for
element**. So the read half survives both a re-run and a code change.

Offers come from the traversal trace store, which concurrent sessions on this machine write to
continuously. Across those same runs the offer count moved 10,953 → 10,951, because two more trace
sessions acquired a shape with no single slot to join an offer on. The offer figures are therefore a
reading of that store **as of 2026-08-23**, and a later re-run should expect them to drift while the
read figures do not. Nothing in §2 or §3 depends on the offer half.

One further figure is deliberately NOT windowed and moves on every run: `tool calls that NAMED a
decision and yielded no read` (7,476 → 7,489 across three runs). It is the extractor's own blindness
denominator, counted per tool call at scan time, and it grows as this disk does. It is not one of the
three numbers and nothing below rests on it.

**The subject, as of the freeze:** 414 decisions; **513 `amends` edges** and **0 `dependsOn` edges**,
counted apart and never summed (ADR-0419 D1). Zero of 414 decision rows carry the `dependsOn` field
at all — the expected state part-way through ADR-0419 D3's deliberately long, reader-first migration,
and reported as a denominator so a zero cannot be mistaken for a blind reader. `-inc-07`'s drain will
move edges from the first column to the second; **that is neutral for everything below**, because the
chain walk unions both support edges and a rehome changes neither endpoint (pinned by a test).

**Corrected 2026-08-23 (`-inc-03`): expect that split to move very little.** The neutrality claim
above is unaffected and stands. What the sentence over-implies is the SIZE: measured by the `-inc-07`
session (PR #1576) across all 451 accepted `amends` edges, exactly **one** has a source whose body
never names its target, so the backlog is ANNOTATION debt rather than a mislabelled-support
population waiting to be rehomed — batch 1 rehomed nothing, and ADR-0419 D2 is therefore best read as
FORWARD-LOOKING (stopping new support edges from being written as `amends`, which increment 06 built).
Corroborated by a different instrument: `pnpm probe:depth-from-work` read 414 / 513 / 0 / 0 at this
freeze and 415 / 514 / **2** / **1** hours later — one new decision and two new support edges, zero
rehomed, i.e. the first plain-support edges came from increment 06's `adr new --depends-on` authoring
surface and not from the backlog.

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
hot set to start from — a constraint on the intervention, and exactly the kind of thing a prior is
supposed to surface before anything is built.

---

## 4. OFFER-TO-FOLLOW — separating heat from noise

An offer is one decision pointer inside one rendered candidate set. A FOLLOW here is a **read** of
that decision, in the same worktree slot, at or after the offer.

### The follow definition, and why two rates are reported

`-inc-01` (PR #1570) established that a decision offer-to-follow rate must be taken over the
**OBSERVABLE** branches rather than the offered ones, because a `followed_edge` is recorded only when
the answering invocation carries `--from-offer`, and `renderOfferFollowUps` never prints a followable
line for a `doc:`-spelled offer. ADR-0312 settled on 2026-08-05 that this gap is **measured, never
closed** — making those offers followable would render every unanswered one `not-followed`, a declined
branch nobody declined, and ADR-0260's body records its own "closing it is a candidate increment"
expectation as WITHDRAWN.

That rule is honoured below and it is also why this baseline does not use `followed_edge` at all.
**A follow here is recovered from the READ RECORD**, a route that exists for every spelling now that
decision reads are captured, so it can see a follow of an offer the CLI follow machinery calls
unobservable. The difference in what that makes measurable is the point:

| | |
|---|---:|
| offers resolving to a decision | 3,351 |
| of those, OBSERVABLE by the CLI follow machinery | **51 (1.5%)** |
| followed, over the observable branches alone | 2 of 51 (3.9%) |
| followed, over the read record | **156 of 3,351 (4.7%)** |

The observable-branch rate is computed over **1.5%** of the population — 51 offers. The read-record
route makes the other 98.5% measurable and finds 156 follows rather than 2. Both are reported: the
first because ADR-0312's rule is right about what `followed_edge` can support, the second because
discarding 98.5% of the evidence would be the larger error. **They agree on the shape** — 3.9% and
4.7% — which is the useful part.

**The read-record join is deliberately generous, and the number is still small.** "At or after, ever,
in the same slot" counts a read three weeks later in a different sitting as a follow of an offer it
almost certainly had nothing to do with. That inflates the rate, so 4.7% is an upper bound on any
tighter definition.

### Result

| | |
|---|---:|
| offers recorded | 10,951 |
| offers resolving to a decision | 3,351 (30.6%) |
| offers followed | **156 of 3,351 (4.7%)** |
| distinct decisions offered | 151 |
| offered and never once followed | **111 of 151 (73.5%)** |

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

ADR-0183 alone is **32.3% of every decision pointer this project has ever offered an agent** and is
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
| trace sessions with no single slot to join an offer on | 8 of 624 |
| trace sessions of mixed identity grade | 0 |

**The join, censused on both sides.** More than one live spelling appears on each side, so a join on
the raw id string would silently drop every crossing pair. `-inc-01` measured what that costs against
the live reads: **31 of 3,391 (0.9%) on the raw string against 1,098 of 3,391 (32.4%)** once both
sides resolve to a decision number — a ~35× under-count that reports no error.

| spelling | reads | offers |
|---|---:|---:|
| `doc:decisions/NNNN-slug.md` | 2,672 | 3,300 |
| bare `adr-NNNN` (the row id) | 110 | 51 |

Every id on both sides resolves through `resolveDecisionId`
(`packages/context-traversal-transcript/src/decision-read-coverage.ts`), which is itself built on the
corpus's own `parseDecisionPointer` / `adrNumberOfArtifactId` — one resolution point, per ADR-0403
dec 7, so this baseline invents no rule of its own and cannot drift from what the rest of the corpus
considers a decision. `readsUnresolved: 0` is the evidence that no spelling is being dropped.

**Which instrument shape saw each read** — kept apart because a scraped shell command and an exact
`Read` are not the same quality of observation:

| surface | reads |
|---|---:|
| `host-transcript-file-read` | 1,645 |
| `host-transcript-shell` | 825 |
| `host-transcript-grep` | 202 |
| `host-transcript-cli-read` | 110 |

Reads are taken from the transcripts alone, never unioned with the trace store's own copies: the live
CLI observer and the transcript sweep record the SAME underlying read as two separate events by
construction, so summing them would double every read both routes reached.

**What this instrument cannot see, named rather than implied:** Codex runs (outside the Claude
harness entirely); the primary checkout, which `deriveIdentity()` rule 3 refuses by design — 218
reads were reached and declined on exactly this ground; shell reads that do not name the path
literally (heredocs, `$VAR`, globs, `git show HEAD:…`); `Grep` over a directory rather than a file;
`adr pull`, which is invisible to the live observer though the transcript sweep does recover it; the
studio, which has no reader-side telemetry at all and is unsized; and non-tool reads (auto-loaded
guidance, `@file` mentions, Skill-loaded files), untested and therefore declared unknown rather than
absent.

**Every figure here is a FLOOR, and the bias is two-sided.** Capture blind spots REMOVE reads, and
removing a decision from a session's read set can only shorten the longest chain that set contains —
so lost capture pushes chain depth DOWN. Slot pooling UNIONS several sittings into one, which can
only lengthen it — so pooling pushes the slot-grained figure UP. That is why both grains are printed
and no blended number is offered.

**And a read is not comprehension.** A model given insufficient context answers confidently rather
than abstaining, so nothing above supports the conclusion that agents are reading the decision log
and getting on fine.

---

## 6. The relationship to `-inc-01`, which landed the same day

`-inc-01` — establish what the traversal instrument can and cannot see for decision reads — landed as
PR #1570 while this baseline was being built. Freezing a prior on an instrument with unmeasured blind
spots is the one failure this arc cannot afford, so the two were reconciled rather than left to agree
by luck. What that changed here:

- **The id resolver is `-inc-01`'s**, not a second copy. Its raw-vs-resolved measurement (§5) is the
  evidence that the join key had to be the decision number.
- **The observable-branch denominator is reported** (§4), which is `-inc-01`'s stated requirement, and
  the read-record rate is reported beside it with the 1.5%/98.5% split that makes the pair legible.
- `-inc-01`'s second half — does the depth walk traverse a decision's own `dependsOn`? — was already
  answered by `-inc-05` (PR #1563) and `-inc-08` (PR #1564), both of which landed before this freeze,
  which is what ADR-0419's Consequences require: a chain-depth figure taken before the walk read both
  fields is not the same series as one taken after.

**What remains unsized is the SIZE of the blind spots listed in §5**, and it bounds one specific
reading and only one:

- The **falsification** reading. Every unobserved path removes reads, and removing reads can only
  shorten chains. So **50.6% is a floor**, and closing the blind spots can only raise it. A POSITIVE
  result is therefore robust; had this come back near zero it would NOT have been, because an
  unmeasured blind spot would have been an equally good explanation. The measurement decided its own
  admissibility, in the direction that makes it admissible.
- The **absolute** reading — "half of all sittings walk a chain" — is a floor over a population this
  instrument can see, not a claim about all sessions.

Nothing else in this document depends on the unsized blind spots.

---

## 7. What this does NOT decide

- It does not decide whether decisions should carry a composed statement at a chain frontier, nor
  whether the composed unit is the decision DOCUMENT or the CLAUSE. That is the fork `-inc-04` writes
  up and leaves open, and ADR-0419 D5 gates on it.
- It does not name a held-out CONTROL set. `-inc-04` owns that, and a later trial without one measures
  the week rather than the change.
- It says nothing about ALTITUDE — whether reads cluster on strategic or operational decisions. That
  is `-inc-03`, and the reach data above is its input.
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
