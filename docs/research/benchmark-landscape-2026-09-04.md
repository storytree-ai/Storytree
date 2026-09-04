# Benchmarking storytree — landscape survey

Researched 2026-09-04 (web pass, five parallel research agents + operator spot-verification).
Owner question: *"benchmarking for the harness space is improving — while storytree was never about
its own harness (we're bring-your-own and sit on top), I want to make sure we're competitive
standalone, and if a benchmark exists that works for us, I'd like to survey it."*

> ⚠ **READ THIS FIRST — this document is CONTEXT, not a plan (ADR-0514).** The owner settled the
> question it opened: storytree is benchmarked on a **real codebase engagement**, not a public
> leaderboard, and what gets built now is the *instrument* (`verdict-accuracy-arc`). **Do not build a
> SWE-bench or Terminal-Bench adapter off this survey.** §6 and §7 carry the settled ladder; the
> RigorBench paragraph in §2 carries a correction to figures an earlier revision got wrong.

**Verification convention.** `[OP]` = the operator fetched the primary source directly during this
pass and the claim is quoted from it. `[AG]` = a research agent reported it with a URL but the
operator did not re-fetch. `[REPO]` = established by reading this repository. Treat `[AG]` as a lead
to confirm before it is spent against, not as settled fact. Every 2026 arXiv item below is a
preprint unless noted.

---

## Executive summary

**A benchmark that works for storytree exists, but the obvious one is doubly unavailable, and the
strategy the evidence supports is not "get on a leaderboard".**

Four findings, in descending order of how much they change the plan:

1. **The famous door is shut, and the famous number is dead.** SWE-bench's Lite / Verified /
   Multilingual leaderboards stopped accepting submissions from anyone without academic or
   established-research-lab affiliation on **2025-11-18**, naming commercial tool vendors as newly
   ineligible `[OP]`. Independently, OpenAI's evals team publicly stopped reporting SWE-bench
   Verified in **Feb 2026** on saturation and training-exposure grounds `[AG]`. Chasing it is both
   impossible and pointless.

2. **The best-fit door — Terminal-Bench, which lists AGENT and MODEL as separate columns — is also
   closed right now.** Its `SUBMIT.md` states plainly: *"Community submissions are currently closed
   for Terminal-Bench 4.0. Only submissions run by the maintainers will be added to the leaderboard
   at this time."* `[OP]` (Note also: it is at **4.0**, not 2.0 — 66 tasks, flat 8-hour agent
   timeout.) Princeton's HAL, the one benchmark architected as models × scaffolds, is **paused**
   `[AG]`.

3. **This matters less than it looks, because the credible 2026 claim shape is a self-run controlled
   comparison, not a leaderboard placement.** The template is Augment Code, 14 Aug 2026: model held
   fixed (Opus 4.7), public benchmark (SWE-bench Pro, 731 instances), and the *headline is cost* —
   61.0% at **$1.27/task** against Claude Code's 61.4% at **$2.70/task** `[AG]`. Equal quality, 53%
   cheaper. GitHub published the same claim shape in Jun 2026; Artificial Analysis publishes it
   third-party. **None of this needs anyone's permission.**

4. **The axis storytree would actually win on is unoccupied.** No public instrument measures the
   false-PASS rate of an orchestrator's completion claim. storytree is the only system in this space
   that emits a *checkable* claim — a signed verdict — so it is the only one that can report a
   precision number for it. ⚠ An earlier revision said this "rides for free on any hidden-test
   benchmark"; that was misleading — the *marginal* cost over a run is near zero, but it still needs
   a run. The genuinely free rungs are the two in §6 that measure our own work. See §6 and §7.

**The honest headwind, stated up front:** do not expect to win on resolve rate. Google Research
(28 Jan 2026, 180 configurations, 4 benchmarks) measured centralized orchestration at **+80.9% on
parallelizable work and −39% to −70% on sequential work** `[AG]`. Long-horizon software construction
is largely sequential. A TOSEM study of 35 sequential Qwen Code CLI releases with the model held
fixed found resolve rate moving 23.0–39.0% with **no significant upward trend** (ρ=0.208, p=0.231)
while tokens roughly doubled `[AG]`. The field's own evidence says harness maturity does not buy
pass@1.

---

## 1 · Which doors are open

| Venue | Third-party harness may enter? | Status as of 2026-09-04 |
|---|---|---|
| SWE-bench Lite / Verified / Multilingual | **No** | Academic / established-research-lab only since 2025-11-18; arXiv preprint or tech report required; Augment Code, Solver AI, Honeycomb.sh named ineligible `[OP]` |
| SWE-bench **Multimodal** | **Yes** | *"Anybody is still welcome to submit"* `[OP]` — the one SWE-bench board still open |
| Terminal-Bench 4.0 | **No (for now)** | Community submissions closed; maintainer-run only `[OP]` |
| HAL (Princeton, models × scaffolds) | Was yes | Submissions paused `[AG]` |
| Aider polyglot | No | Maintainer-run; leaderboard stale since 2025-11-20 `[AG]` |
| **SWE-bench Pro** (Scale) | **Self-run** | MIT, prebuilt Docker (`jefzda/sweap-images`), 731 public instances; results submitted to Scale's board `[AG]` |
| **SWE-bench Live** | **Yes** | PR your *"model-agent combination"* + trajectories; contamination-free by construction `[AG]` |
| **Harbor Hub** | **Yes** | Self-published public jobs, even while the official board is closed `[AG]` |
| SWE-Marathon | Self-run | Apache-2.0, runs under Harbor; no third-party submission mechanism described in the paper `[OP]` |
| RigorBench | Self-run | Benchmark, rubrics and trajectory tools released open-source `[OP]` |

**Reading:** leaderboard *placement* is largely gated shut to a commercial harness in Sept 2026.
Self-run *comparison* is wide open, and is what the credible players actually publish.

---

## 2 · What the field measures now

SWE-bench Verified's replacement is not a single benchmark — SWE-bench co-author John Yang calls the
current state a *"Cambrian explosion"* `[AG]`. The de facto table-stakes triple is **SWE-bench Pro**
+ **Terminal-Bench 2.x/4.0** + **a cost-per-task figure** `[AG]`.

Benchmarks worth knowing, grouped by what they'd tell us:

**Single-issue patching (poor fit — wrong granularity).** SWE-bench and family. Verified is
saturated (~93.9% per its own co-creator `[AG]`) and quality-challenged: UTBoost's test augmentation
revised **>24% of leaderboard entries** `[AG]`; an audit found 7.8% of "solved" instances failing
developer tests `[AG]`. storytree's unit is a proven increment, not a patch.

**Terminal/agentic (best structural fit for a harness claim).** Terminal-Bench 4.0 via Harbor —
leaderboard columns are literally `RANK, MODEL, AGENT, RESOLUTION RATE, COST, TOKENS` `[OP]`, i.e.
the harness is a first-class subject. Custom-harness precedent exists: Stanford's Meta-Harness and
LemonHarness both posted TB 2.0 numbers `[AG]`.

**Long-horizon (closest to storytree's actual shape).** **SWE-Marathon** — 20 tasks (library
reproductions, product clones, ML engineering, algorithmic optimization), runs under Harbor in Modal
sandboxes, median trial **7.6M tokens**, largest **877.4M**, frontier agents solve **<30%**, and
*"individual trials can cost hundreds of dollars; full sweeps cost tens of thousands"* `[OP]`.
Also **Long-Horizon-Terminal-Bench** (dense graded subtasks, partial credit — its paper notes stock
Harbor ignores the continue-until-timeout flag, so long-horizon tasks run single-shot there `[AG]`),
**SWE-EVO** (release-sized evolution; best frontier model 25.0% vs 72.8% on Verified `[AG]`),
**DeepSWE**, **RoadmapBench**, **StaminaBench** (100 sequential feature requests, scored by *average
turns passed* before correctness breaks `[AG]`), and **Agents' Last Exam** (deterministic checkers,
no LLM judge, rotating public/private split `[OP]` via search).

**Verification and trust (the differentiator's neighbourhood — see §6).** **RigorBench**
(2026-06-21, [repo](https://github.com/MeherBhaskar/RigorBench)) is the nearest instrument whose
subject is *the harness* on a fixed model — four harnesses (Agent-Rigor, Agent-Skills, Superpowers,
baseline ReAct) all driven by Gemini 3.5 Flash. It scores **seven** weighted pillars: Planning
Fidelity, Verification Coverage, Recovery Efficiency, Abstention Quality, Atomic Transition
Integrity, Test Assertion Density and Exploration Efficiency, over **100** tasks in categories
including *Verify-Or-Die*, *Know When to Fold* and *Don't Break the Build* `[OP]`.

⚠ **CORRECTION, and it changes the recommendation.** An earlier revision of this document reported
five pillars, 30 tasks, "+41% process / +17% outcome", "0% of baseline agents abstained" and a judge
agreement of κ=0.74. All five came from a research-agent digest of an earlier preprint revision and
**none survive a reading of the paper** `[OP]`. What it actually says: RigorScore 0.40±0.09 (ReAct)
→ 0.53±0.08 (Agent-Rigor), outcome 0.64±0.05 → 0.83±0.05; **no inter-rater agreement is reported at
all**, and the authors flag LLM-judge length and self-preference bias as a limitation. Note the
error bars — the *process* intervals overlap, so their headline rests on the outcome column, not on
the process metric the benchmark exists to supply.

**The disqualifying detail: Verification Coverage is test-PRESENCE, not red-then-green.** It scores
"the proportion of implemented functions for which the agent creates at least one test" and does not
validate test-first ordering `[OP]`. So RigorBench would score storytree on *did you write tests* —
which any agent satisfies — and never on the thing the spine enforces. **Read the paper for its task
design, which is well-shaped; do not spend on running it.** Alongside it:
**ImpossibleBench** (headline metric is a *cheating rate* — pass rate on tasks made impossible by
conflicting spec vs tests; MIT, Inspect-based `[AG]`), **EvilGenie** (reward-hacking detection that
already drives Codex, Claude Code and Gemini CLI as subjects `[AG]`), **SWT-bench** / **TDD-Bench
Verified** (does an agent-written test actually fail-before/pass-after `[AG]`), and **SWE-Mutation**
(mutation testing of LLM-written suites `[AG]`).

**Orchestration specifically.** **OrchBench** (Jul 2026) evaluates orchestration *plans* over DAGs
with controlled dependency depth, scoring **quality × makespan × token cost**, and correlates
r=0.816 with real Claude Code runs at 1.3% of the tokens `[AG]`. Its headline finding — *preserving
task-critical information beats adding agents* — is worth reading before any fan-out claim.

---

## 3 · The tailwind: "the harness effect" is now a named, measured phenomenon

This is the single best piece of news in the survey. The premise that a harness is a legitimate
subject of measurement, separable from the model, is now established in the literature and in
practice `[AG]`:

- **Epoch AI**: scaffold swap alone moves SWE-bench Verified by up to **11pp (GPT-5)** and **15pp
  (Kimi K2 Thinking)**.
- **SWE-bench Pro, Claude Opus 4.5 held fixed**: Scale standardized 45.9% · Claude Code 49.8% ·
  Cursor 50.2% · Auggie 51.8%.
- **Scaffold Effects on GAIA** (pre-registered, Jun 2026): scaffold choice alone moves accuracy by
  up to **28 points** within one model.
- **SWE-Marathon**: with the model fixed, median tokens per trial vary by up to **12×** — gpt-5.5
  uses 0.40M under Terminus-2 vs 4.8M under Codex; claude-opus-4-7 uses 4.4M under Terminus-2 vs
  21.9M under Claude Code `[OP]`.
- **Harness-Bench** (arXiv 2605.27922) and the position paper *"Stop Comparing LLM Agents Without
  Disclosing the Harness"* argue capability must be reported at the **model-harness pair** level.

Consequence for us: entering as a harness is legible and expected. Any claim that reads as a *model*
win will be dismissed.

---

## 4 · The headwind, stated honestly

- **Orchestration degrades sequential work.** Google Research, 180 configurations: **+80.9%** on
  parallelizable tasks, **−39% to −70%** on sequential ones `[AG]`. Software construction along a
  dependency DAG is mostly sequential.
- **Harness evolution has not bought resolve rate.** 35 sequential releases of one CLI, model fixed:
  no significant trend, tokens doubled `[AG]`.
- **Nobody has published an orchestration layer beating a bare agent at repo-scale construction on
  the same model.** Cognition — the definitional company here — shipped "Devin can now manage
  Devins" with **zero numbers**, and never retracted its own earlier "Don't Build Multi-Agents"
  `[AG]`.
- **Anthropic's multi-agent +90.2% result is research, not coding**, on an internal eval, at ~15×
  tokens `[AG]`.
- **Terminal-Bench's submission rules cap our advantage even if reopened:** `timeout_multiplier`
  must be unset/1.0 with no resource overrides `[OP]` — a long-horizon orchestrator gets the task's
  budget, not more.

**Read together with §3:** the harness matters a great deal, but what it moves is *cost, tokens and
process quality* far more reliably than pass@1. That is where the claim should be aimed.

---

## 5 · Feasibility from our side `[REPO]`

Three things are already true, and one is a decision that has to be made.

- **The spine can observe a foreign repo.** `ShellCommand` in
  `packages/orchestrator/src/shell-test-executor.ts` carries an optional `cwd`, so the spine's
  red/green observation can be pointed at a benchmark checkout rather than this one.
- **A benchmark task need not be authored as files.** `driveNode(spec: NodeSpec, args)` in
  `packages/drive/src/node-build.ts` takes a `NodeSpec` — a plain interface
  (`packages/orchestrator/src/node-spec.ts`) already constructed programmatically elsewhere
  (`codexMultifileRuntimeSeamSpec()`). An adapter can synthesize one spec per benchmark instance
  without writing `stories/**`.
- **The verdict is the artifact worth measuring.** `Verdict` (`packages/proof-protocol/src/proof.ts`)
  carries `unitId`, status, `boundHash`, evidence and signing — a per-unit signed claim.
- **⚠ The blocker: a real proof must persist to Cloud SQL.** `--real` requires `--store pg`;
  `--store memory` was removed at CLI dispatch (ADR-0081, `refuseMemoryStore`), and `--store pg` is
  refused for synthetic walks. So a containerized benchmark run needs either a Postgres reachable
  from the container or **an explicit decision to admit a benchmark-scoped ephemeral verdict store**.
  That is an ADR, not an obstacle — but it is load-bearing and should be decided before any spend.

Also worth noting: this repository contains **no existing SWE-bench or Terminal-Bench references**
outside `legacy/`. V1 carried an ADR-0015 "SWE-bench container", disposed in the v1→v2 ledger as
*obsolete — "benchmark the system" note* (ADR-0003). The idea has been parked since the rebuild, not
decided against.

---

## 6 · The recommendation: measure the verdict, not the score

**The structural insight.** Every hidden-test benchmark hands us a free, independent oracle. Run an
instance through storytree: the leaf authors its own test, the spine observes a genuine RED, then a
GREEN under write scope, and signs a verdict — or the unit halts. The benchmark's held-out test then
says whether that verdict was *true*.

That yields two numbers nobody else in this space can report:

- **Verdict precision** — `P(held-out tests pass | storytree signed GREEN)`.
- **Halt rate and halt honesty** — how often the system declines to claim done, and whether those
  declines were correct.

A bare agent has no verdict to score. It stops, and its stop carries no claim. So its "precision" is
just its resolve rate, and the comparison is not a like-for-like race we might lose — it is an axis
that only exists because we built the spine.

**This is exactly where the published evidence points.** The False Success study (Jun 2026) measured
false-completion rates of **3% to 75.8%** by domain and found that **LLM judges cannot detect it**
(AUROC ≤0.65) while programmatic state checks can `[AG]`. That is the deterministic-spine argument,
published, by someone else. And it aligns with the framing already established in
`docs/research/industry-framing-2026.md`: the grounded claim is a *relocation* of verification, and
"verification debt" (Vogels, Dec 2025) / the "verification gap" (Sonar, Jan 2026) is the
best-evidenced pain in the field.

### The ladder, cheapest first — settled as ADR-0514

⚠ An earlier revision of this section proposed three tiers led by a SWE-bench Pro comparison, and
put RigorBench second. Both are superseded. The owner's steer (2026-09-04) is that **the benchmark
event is a real codebase engagement — mapping an existing codebase, or building something known from
scratch — not a public leaderboard**, and that what we build now is the *instrument* that makes such
an engagement measurable rather than anecdotal. Recorded as **ADR-0514**; the work is
**`verdict-accuracy-arc`**.

The two cheap rungs need nothing we do not already have, which is what makes this instrument-building
rather than a spend proposal.

| Rung | What it answers | Instrument | Cost |
|---|---|---|---|
| **1 — test strength** | Are the tests the leaf writes and the spine accepts actually strong, or do they merely execute the code? | Mutation-score the tests authored during real red→green builds. **Stryker is already a dependency and `check:mutation-diff` is already a gate step**; ADR-0447 already ruled test strength a legitimate second axis. | **Free** — machinery exists |
| **2 — false-pass smoke test** | Has a signed GREEN ever been contradicted by later history? | Verdicts carry `boundHash`, the hash of the span they proved. Where a later fix lands inside that span, that is a false-pass signal. Read with git alone. | **Free** — data exists |
| **3 — verdict precision** | When storytree signs GREEN, does an oracle we do not control agree? | Held-out tests, ~50–100 instances through storytree alone, no baseline arms. **PROPOSAL — gated on owner spend AND the ephemeral-store decision.** | Real spend |
| **4 — competitive number** | Are we competitive standalone? | Same model, three arms on SWE-bench Pro, cost and tokens per task — the Augment template. | Expensive |

**Start at rung 1.** If leaf-authored tests mutation-score badly, that is an important finding about
the gate for the price of a gate run, and no external benchmark was needed to reach it. Rungs 1 and
2 are independent and can run in either order or in parallel.

**Rung 3's arithmetic, since it is the one worth stating precisely.** A bare agent attempts N,
submits N patches, M pass → resolve rate `M/N`. storytree attempts N, **signs GREEN on G and halts on
N−G**; K of the G pass → precision `K/G`. The claim under test is `K/G` ≫ `M/N`, and the honest cost
is that `K/N` is probably *lower* than `M/N` because we halt on the hard ones. **We do not solve
more; we claim less falsely.** A bare agent has no verdict to score — it stops, and its stopping
carries no claim — so this axis exists only because the spine does. And we do not own the oracle:
held-out tests are written by the original maintainers and withheld, so there is nothing to tune
toward, and a bad number is a real finding.

**Venue, if placement ever matters:** a self-published **Harbor Hub** job plus a written methodology,
in the shape Augment and GitHub used. Not a leaderboard PR — that door is shut. **SWE-bench
Multimodal** and **SWE-bench Live** are the two boards still open to us. ⚠ Per ADR-0514, **nobody
builds an adapter for these off this document** — it is banked as context, not as a plan.

### What a credible claim looks like

Four properties, all precedented in 2026 `[AG]`:

1. Model held fixed, scaffold varied — otherwise it reads as a model claim.
2. On SWE-bench Pro and/or Terminal-Bench, never Verified alone.
3. Cost per task reported alongside the score. *Equal quality at lower cost is now a fully
   legitimate headline* — it is Augment's.
4. A second axis where an orchestration layer can genuinely win: makespan, token cost, error
   containment, mergeability — or, in our case, verdict precision.

⚠ **One complication to design around:** our leaf is subscription-funded, so a naive $/task figure
is not comparable to an API-metered competitor's. Report tokens as the primary cost unit and price
them at published API rates for the comparison arm, stating the convention.

---

## 7 · The fork, and how the owner settled it

The survey originally left the spend open. **It is now settled — ADR-0514, owner-directed
2026-09-04.**

- **Where benchmarking happens:** a real codebase engagement — mapping an existing codebase, or
  building something known from scratch. Not a public leaderboard.
- **What gets built now:** the instrument, on the two free rungs above, so that engagement produces
  a number rather than an anecdote. The ordering is the substance: the evidence an instrument needs
  — which test the leaf wrote, which span a verdict bound, what later changed under it — is only
  capturable while the work runs, so it cannot be retrofitted.
- **What this document is:** context, not a plan. No SWE-bench or Terminal-Bench adapter is
  chartered off it.
- **Still owner-gated:** rung 3 (held-out oracle), which needs a spend call *and* the
  benchmark-scoped ephemeral verdict store decision (§5). If the engagement lands first, the same
  measurement is taken there and rung 3 closes unbuilt — a legitimate ending.

Work lives on **`verdict-accuracy-arc`**. Posture is `spine-wall-measurement-arc`'s: measure first,
decide never. No gate rung and no threshold is added on the strength of any reading this produces.

---

## 8 · Caveats

- Every 2026 arXiv item here is a **preprint**; only SWE-Mutation (ACL 2026 Findings) is noted as
  peer-reviewed `[AG]`.
- `[AG]` claims carry a URL but were not re-fetched by the operator. The four that most affect the
  plan — SWE-bench eligibility, Terminal-Bench closure, RigorBench's design, SWE-Marathon's cost and
  harness effect — were all spot-verified `[OP]` precisely because they are load-bearing.
- Model names and scores above the operator's knowledge cutoff are reproduced as found.
- Benchmark versions move fast: Terminal-Bench went 2.0 → 4.0 inside this year, and the initial
  research brief for this pass was already stale on it. Re-check versions before any run.
- The **Verification Horizon** thesis (arXiv 2606.26300) argues verification must co-evolve with the
  generator, so a fixed benchmark of our own would decay `[AG]`. That is an argument for evidencing
  the *mechanism* with existing instruments rather than publishing a storytree-owned benchmark.
