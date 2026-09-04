# How agents walk a linked corpus — a survey of the field against our own numbers

Surveyed 2026-09-05 for `follow-the-research-arc`. The decision it produced is **ADR-0513**.

**Read this before proposing any retrieval, ranking, edge-weighting or adherence-benchmark work.**
It exists so that a later session does not re-derive a field it can read in ten minutes, and does not
re-propose the two things already declined on evidence.

External work is cited by arXiv id. Our own figures are cited to the frozen write-up that produced
them and are never mixed with the literature's — the two answer different questions on different
corpora, and `arXiv 2605.23950` (below) is the reason they can never be compared directly.

---

## 1. The shape being explained

Three of our own figures frame the whole survey. All are from
`docs/research/decision-read-baseline-2026-08-23.md` (frozen; read half reproducible byte-identical
across runs, from 4,330 transcript files and 2,782 reads over 401 context windows). The regression
reading of 2026-08-25 found all three flat — 51.3% / 89.0% / 4.6% over 433 windows.

- **CHAIN DEPTH.** 203 of 401 windows (**50.6%**) read two or more decisions on a single support
  chain in one sitting; 89 (22.2%) reached three or more; the deepest sitting walked **nine**.
- **REACH IS BROAD AND THIN.** 370 of 414 decisions (**89.4%**) were read by at least one window, but
  the most-read decision reached only **31 of 401** windows (7.7%) and the median reached **3**.
  There is no hot core.
- **OFFERS ARE NOISE.** Only **4.7%** of decision pointers offered to an agent were followed; 111 of
  151 offered decisions were never followed once.

Plus one null, from `docs/research/decision-altitude-2026-08-23.md`: **reads do not cluster by
altitude.** Mean reach 3.83 executive / 4.11 property / 3.48 existence — a 1.18x spread, Kruskal–Wallis
H = 4.025, permutation **p = 0.132**, and **p = 0.938** under a second, independent classifier.

The behavioural reading: **agents search, land on whatever answered the query, and climb the support
chain backwards.** They do not descend a curated path from a foundation, and there is no foundation
they share.

---

## 2. The paradigm this belongs to

Agents "jumping around" is not a defect of our offer surface; it is the retrieval paradigm that
displaced the alternative. Through 2025–26 the field moved from index-first retrieval to **direct
corpus interaction** — search, read, hypothesise, re-query, with reasoning between steps
(`arXiv 2605.05242`, `arXiv 2605.29307`). Claude Code itself moved off vector RAG to grep-style
agentic search, and the reported result is that text search in a good harness matches or beats
embedding retrieval on coding-agent tasks. The advantage most cited is not accuracy but that
**there is no index to keep fresh**.

Our 4.7% offer-follow rate is therefore the predicted behaviour, and it is the same conclusion
ADR-0464 reached independently when it retired the offer surface in favour of search plus the
authored edge.

---

## 3. Four families of intervention

### A. Precompute a level above the walk

**RAPTOR** (ICLR 2024, `arXiv 2401.18059`) recursively embeds, clusters and summarises chunks
bottom-up into a tree and retrieves at whichever abstraction level the question needs.
**GraphRAG** (`arXiv 2404.16130`) extracts an entity graph, runs Leiden community detection
recursively for a hierarchy, pregenerates an LLM summary per community, and answers global questions
by map-reduce over the summaries.

This is ADR-0428's composed statement, arrived at independently. The difference is who chooses:
theirs is **automatic and global**, ours is **authored and local**.

> ⚠ **Our own baseline forbids the automatic global build.** With no hot core, a median decision
> reach of 3, and 89.4% of decisions read by *someone*, a GraphRAG-style hierarchy would pay an LLM
> to summarise, at every level, material almost nobody returns to. Do not propose it.

### B. Collapse the walk into one retrieval

**HippoRAG** (NeurIPS 2024, `arXiv 2405.14831`) uses the hippocampal indexing theory as its design:
a knowledge graph for neocortex, Personalized PageRank seeded from query entities for hippocampal
pattern completion. Probability spreads from the seeds, so material several hops away surfaces in one
retrieval. Reported: single-step matches or beats iterative IRCoT while **10–20× cheaper** and
**6–13× faster**, and improves on prior SOTA by up to 20%.

The method needs exactly one asset — a graph with real edges — which is the thing we have and every
paper has to fabricate. **Parked as `follow-the-research-arc-inc-03`.** At 416 nodes and 516 support
edges this runs in memory in milliseconds; ADR-0513 D7 declines a graph database on scale.

### C. Improve the walk itself

**IRCoT** alternates a chain-of-thought step with a retrieval step, each steering the other.
**Self-Ask** decomposes into sub-questions with retrieval between them. **Iter-RetGen** folds each
round's generation back into the query. **CoRAG** (`arXiv 2501.14342`) *trains* the chain by rejection
sampling — keeping only trajectories whose intermediate retrievals led to a correct answer — making
retrieval depth a test-time compute dial.

Our agents already do the untrained version at scale and unprompted (the §1 depth figures). We have no
training loop over our own corpus, so the CoRAG half does not transfer.

### D. Tier the memory so the walk is not re-paid

**Generative Agents** introduced observation → LLM-synthesised reflection → importance-weighted
retrieval. **MemGPT** pages between a bounded main context and unbounded archival storage. The 2026
survey (`arXiv 2603.07670`) sorts the field into three patterns: context-only, context-plus-retrieval-
store (the production workhorse), and tiered memory under a learned controller.

We are firmly pattern B, with one thing the others lack: our reflections are written into a **shared,
durable, human-reviewable** store rather than a private per-agent memory stream. That is why our chain
is walkable by a person; it is also why we pay for curation.

---

## 4. How much context to feed the walk

**Inlining the whole chain is ruled out, not merely expensive.** Every one of eighteen frontier models
tested degrades as input length grows; accuracy against position is U-shaped, with mid-context material
retrieved worst — a drop of more than **30%** against the same fact at the edges. With twenty retrieved
documents (~4k tokens) reported accuracy falls from 70–75% to 55–60%. A nine-decision chain pasted into
context is a longer walk with its middle hops made least legible.

**The one ADR-specific experiment.** "Context Matters" (`arXiv 2604.03826`) compared five context
strategies for LLM-*generated* ADRs: none, complete history, first-K, last-K, and retrieval of
semantically similar. Findings: **3–5 records optimal**, complete history negligible over last-K;
retrieval at parity with recency in aggregate; and **recent decisions beat foundational ones**
(BERTScore F1 0.8440 for last-3 vs 0.8401 for first-3, Gemini-2.5-Pro). Conclusion: context
engineering, not model scale, is the dominant factor.

> ⚠ **Read that with its limit attached.** It scores ADR *generation fidelity* against a reference
> text (BLEU/ROUGE/METEOR/BERTScore). Producing text that scores like a reference ADR is a different
> task from honouring a standing decision while changing code. But the *direction* corroborates our
> altitude null from a completely independent angle: **the foundations are not what gets read.** Both
> results should close any remaining plan for a "read these foundations first" surface.

The residue worth keeping: the one place retrieval beat recency was *cross-cutting concerns and
non-sequential dependencies* — which is a chain walk in another vocabulary.

---

## 5. The benchmark we are not building, and why

The closest published analogue to our whole situation is **HANDBOOK.md** (`arXiv 2607.25398`, June
2026): an agent doing realistic containerised work while a long policy document governs it. Its
framing sentence — *"the rules live somewhere other than the request"* — describes `CLAUDE.md` and this
decision log exactly. Handbooks run 20–124 pages (median 37; 8K–79K tokens), delivered in native
formats. Scoring is **strict pass@1** — every rubric criterion or nothing — over 824 deterministic
Python verifiers (71.8% assert a required action happened; 28.2% assert a prohibited one did not,
including exact-count invariants to catch side effects). No LLM judging.

**Results:** best config 36.2% strict pass@1; the June 2026 frontier band clustered at 21–22%; the tail
reached 0.8%. Four recurring failure modes: request overrides policy; check performed and result
ignored; verification skipped; and **false compliance reports** — *"nearly every failed trajectory ends
with confident statements claiming handbook adherence, frequently citing violated sections. The agent's
self-report is the least reliable artifact."* Their root cause: standing documents behave as **degrading
sources rather than persistent authorities**, with influence decaying across turns and under competing
signals; additional reasoning effort sometimes made it worse.

**ADR-0513 D1 declines building our own**, on the owner's judgment (2026-09-04) that a sandbox plus a
hand-authored golden dataset is not a one-session shaping job. Two consequences are recorded there and
are not re-litigated here: we forgo any held-out measure of adherence, and the replacement gold signal
is the owner's own re-steer, captured in the retro (`-inc-01`).

**If you do ever build a scoring query set, it must survive a masking check.** Generating queries from
`depends_on` and scoring retrieval against `depends_on` is a tautology that passes trivially. This is a
studied failure — it is why MuSiQue exists. HotpotQA scores **68.8** on the Disconnected Reasoning
metric (highly cheatable); MuSiQue-Ans scores **37.8**. MuSiQue's fix transfers: compose each multi-hop
query from single-hop ones and apply a connectedness filter that masks the intermediate and confirms
the query becomes unanswerable without it (TACL, `arXiv 2108.00573`).

**And no result here is ever comparable to a published one.** `arXiv 2605.23950` argues harness
engineering routinely outweighs model choice and that cross-setup agent scores are incomparable.
ADR-0513 D3 makes that a rule rather than a caveat.

---

## 6. Where we are off the map

Three things I could find no prior art for.

1. **Authored edges, not extracted ones.** GraphRAG, RAPTOR and HippoRAG all *derive* structure from
   text with an LLM, and the research effort goes into extraction quality. Our `depends_on` is written
   by the agent that made the decision, at the time it made it, and reviewed. Nobody studies the
   authored case because almost nobody has an author who is also the reader.
2. **A staleness marker that cannot lie.** This is the field's open wound: the GraphRAG index grows
   super-linearly, most systems run on static snapshots, and small corpus changes force full
   reconstruction — the framing is always *how do we re-index cheaply*. ADR-0428 inverts it: store the
   basis (which records, at what content fingerprint) and **derive** what moved beneath. The precedent
   we borrowed is legislation.gov.uk's "Changes to Legislation" banner, a legal-publishing convention.
   No RAG paper I found has adopted it.
3. **Read traces from real work.** Everything surveyed evaluates on benchmarks — HotpotQA, MuSiQue,
   QuALITY, NarrativeQA. Our figures come from real context windows doing real work. I found no
   published equivalent measuring how agents traverse a knowledge corpus *while working* rather than
   while answering a benchmark question. If any of this is publishable, that is the part.

---

## 7. Mechanisms considered for our own edges, with the failure mode attached

Raised by the owner 2026-09-04 and surveyed here rather than built; ADR-0513 D6 requires them to land
as one unit or none.

- **Frequency-and-recency edge weights with decay** are ACT-R base-level activation, and predate the
  RAG literature by ~30 years: `B_i = ln(Σ_j t_j^−d)` over n prior uses. Crucially ACT-R's total
  activation is base-level **plus spreading activation** — raw usage and current-context relevance are
  separate summands, never one blended score (`arXiv 2505.05083`). Hebbian co-activation edges that
  strengthen on co-retrieval and decay when unused are `arXiv 2604.16839`; forgetting as a governed
  primitive is `arXiv 2604.12007`.
- **The risk the owner predicted — "this might reinforce mechanical behaviour" — is popularity bias /
  the Matthew effect**, the central known failure of learning from implicit feedback
  (`arXiv 2509.00333`, `arXiv 2106.07041`). ⚠ **It would hit us harder than a typical recommender
  because our corpus is almost entirely long tail** (median reach 3; most-read 7.7%): frequency
  weighting would concentrate reads on the already-read and progressively bury the rest. Corrections
  are inverse propensity weighting plus deliberate exploration, and IPS is known to be high-variance on
  sparse data — a design input, not a bolt-on.
- **Agent-allocated relevance scores** are LLM relevance judgment. UMBRELA (`arXiv 2406.06519`)
  correlates well with human judgments across TREC DL 2019–2023, but the calibration error is
  one-directional: humans marked >13% more documents non-relevant, LLMs marked >26% more as *perfectly*
  relevant, and whether they can replace human assessors at all is disputed (`arXiv 2412.17156`). A
  ranking signal, not ground truth.
- **Error attribution** has a validated frame: MAST (`arXiv 2503.13657`) — 1,600+ traces across seven
  frameworks, 14 failure modes in three categories (specification/design 41.8%, inter-agent
  misalignment 36.9%, verification 21.3%), six annotators at Cohen's κ 0.88. Adopt it rather than
  inventing one (`-inc-02`). The metric family for the owner's re-steers is Human Intervention Rate,
  HITL load and TCR@k (`arXiv 2607.04329`).

---

## 8. What this produced

- **ADR-0513** — accepted, owner-directed. Declines the adherence benchmark; charters internal trials.
- **`follow-the-research-arc`** — increments 01–04 parked (re-steer capture, MAST frame, PPR, co-read
  edges). The weighting trio of §7 is deliberately *not* parked: its design depends on what `-inc-04`
  finds, and a noisy co-read graph declines all three without building them.

**One correction recorded here because it was briefly wrong elsewhere:** the 54-pair composition trial
is **not** available as a readout. It was stood down unrun under the closed `decision-read-measurement-arc`
for a *resolution* limit — the frozen before arm resolves one of three altitude classes at the declared
0.5-record effect while the differences it shows are ~0.26, so the design looks for something smaller
than its own resolution. Whether to hold it open at all is an open question with four costed options.
Do not pick it up.
