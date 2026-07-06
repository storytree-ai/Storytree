# Prior art: recursive / self-improving agent feedback loops — dated, model-tagged survey

**Charter** (owner-directed 2026-07-06, `task_cfcc5788`): survey systems where an agent captures its
own operational friction/failures/learnings and feeds them into a durable knowledge/skill/memory
store so future runs improve — to inform the session-retro → friction → gated-graduation design
([ADR-0168](../decisions/0168-session-retro-friction-every-session-feeds-friction-to-the-l.md)).
Per the owner's requirement, **every source carries its publication date, the model(s) it used, and
a predates-frontier flag** (frontier era here = GPT-4-class and later; Claude Opus 4.x / Fable 5 era
= 2025–2026). The owner's hypothesis under test: *most prior art used weaker pre-frontier models,
which forced heavy mechanical scaffolding that stronger models may not need.*

**Method**: deep-research harness run 2026-07-06 (Claude Fable 5) — 5 search angles (foundational
pre-frontier mechanisms; 2025–26 memory/self-evolution SOTA; failure modes & skeptical evaluations;
curation mechanisms & quality gates; practitioner lesson-loops in coding agents), 25 sources fetched,
125 claims extracted, the top 25 adversarially verified by 3 independent skeptic votes against the
primary sources — **all 25 confirmed 3-0, 0 refuted** (one citation corrected in verification:
Memory-R1's primary source is arXiv 2508.19828, not the survey). Findings below are limited to what
survived that verification; supplementary rows flagged `[extracted]` passed source-extraction but not
the adversarial vote.

## Verdict on the owner's hypothesis

**Substantially confirmed, with two hard counterpoints.**

- **Confirmed**: the 2023 pre-frontier cohort gated its stores with uniformly *mechanical, arithmetic*
  scaffolding (hard caps of 1–3 reflections, exponential recency decay × importance-score retrieval,
  a numeric reflection threshold of 150, upvote/downvote counters) — and ExpeL's authors stated
  directly in 2023 that **model capability determined how much scaffolding the loop required**:
  gpt-3.5-turbo could not reliably operate the insight-curation operators, so they switched insight
  extraction to gpt-4-0613 because it "is better … at following instructions on how to use the
  insight extraction operators and hallucinated less." By 2025 the field had shifted to
  **judgment-based curation** in three escalating forms: Mem0 (the LLM itself decides
  ADD/MERGE-UPDATE/DELETE; embeddings only shortlist), ReasoningBank (LLM-as-judge success labeling
  with no ground truth + self-contrast across parallel rollouts), and Memory-R1 (the curation
  gatekeeper is itself an RL-trained memory-manager agent, explicitly contrasted against "static and
  heuristic-driven" prior pipelines).
- **Counterpoint 1 — context collapse (ACE, Oct 2025, DeepSeek-V3.1)**: letting an LLM *holistically
  rewrite* its accumulated store is destructive — the documented case shrank an 18,282-token store
  (66.7% accuracy) to **122 tokens (57.1%) in one rewrite step, below the 63.7% no-memory baseline**.
  ACE's response, *with* frontier models: LLM judgment generates candidate lessons, but the write
  path is **deterministic non-LLM merge logic + embedding dedup**. Judgment for generation and
  gating; never destructive whole-store rewrite authority.
- **Counterpoint 2 — judgment alone doesn't keep a store clean (Mem0 production audit)**: a
  production audit of Mem0's LLM-judgment write gate (repo issue #4573) found **97.8% of 10,134
  stored entries were junk**. Judgment-based *admission* is adopted and viable; unsupervised
  judgment-based *store hygiene* over production timescales is unproven.

## Per-source table (adversarially verified sources)

| Source | Date | Models used | Predates 2025–26 frontier? | Mechanism | Anti-bloat / curation | Key verified result |
|---|---|---|---|---|---|---|
| **Reflexion** (Shinn et al., arXiv 2303.11366, NeurIPS 2023) | Mar 2023 | GPT-3/3.5/4 (main results GPT-4) | Yes (pre-2025 era; GPT-4-class for main results) | Verbal lessons from sparse feedback into an episodic text buffer; no weight updates | **Hard cap Ω = 1–3 stored reflections** (context-limit motivated) | Founded the field; but its "durable memory" is per-task (1–3 reflections on the SAME task), not a cross-task library — weaker precedent for a shared library than its citation count suggests. Documented: non-optimal local minima; lesson quality capped by the agent's own test-writing ability |
| **Generative Agents** (Park et al., arXiv 2304.03442) | Apr 2023 | gpt-3.5-turbo | **Yes — pre-GPT-4-class** | Ever-growing memory stream + reflection trees | Arithmetic retrieval: recency (0.995 exponential decay) × LLM-scored 1–10 "poignancy" × embedding relevance; reflection triggered at importance-sum threshold **150** | Documented retrieval failures from a grown store, confabulated embellishments on true memories, instruction-tuning persona override |
| **Voyager** (Wang et al., arXiv 2305.16291) | May 2023 | GPT-4 (black-box, no fine-tuning) | Yes (pre-2025 era; GPT-4-class) | Ever-growing **skill library** of executable code, reused across worlds | **Admission-time verification-by-execution** (GPT-4 self-verification critic over environment feedback + execution errors); NO post-admission pruning/decay/dedup | Ablating self-verification dropped discovered items ~73% — an early execution-grounded precedent for storytree's prove-it-gate pattern |
| **ExpeL** (arXiv 2308.10144, AAAI-24) | Aug 2023 | Actor gpt-3.5-turbo; insight extractor **gpt-4-0613** | Yes (mixed) | Cross-task insight pool distilled from experience | Four operators (ADD/UPVOTE/DOWNVOTE/EDIT); importance counter starts at 2; delete only at zero | **Direct capability-determines-scaffolding evidence** (see verdict). Also an early self-slop result: adding self-generated reflections to the pool HURT (HotpotQA 29.0% with vs 39.0% without — hallucinated content) |
| **Mem0** (arXiv 2504.19413) | Apr 2025 | 2025 frontier-era LLMs (system; model-agnostic pipeline) | No | LLM extracts salient facts and decides ADD/MERGE-UPDATE/DELETE/NOOP at ingestion | LLM-as-judge write gate; embedding similarity only shortlists | Judgment-gating adopted at scale — but the production audit (issue #4573) found **97.8% junk in 10,134 entries**: the load-bearing counter-evidence on unsupervised store hygiene |
| **Self-Evolving Agents survey** (arXiv 2507.21046) | Jul 2025 (rev. Jan 2026) | survey | No | Taxonomy of what/when/how agents evolve | Names **generalization** ("from specific episodes to reusable knowledge … one-time experiences into long-term competencies") as the core memory-evolution mechanism, vs raw episode accumulation | Validates storytree's experience → durable-'able'-artifact pattern as the field's consensus framing |
| **Memory-R1** (arXiv 2508.19828) | Aug 2025 | RL-trained (PPO/GRPO) memory-manager over frontier LLMs | No | The curation gatekeeper is itself a trained agent (ADD/UPDATE/DELETE/NOOP) | Learned judgment replacing "static and heuristic-driven" pipelines | +48% F1 on LoCoMo vs heuristic baselines |
| **ReasoningBank** (Google, arXiv 2509.25140, ICLR 2026) | Sep 2025 | Gemini-2.5-Flash/Pro, Claude-3.7-Sonnet | No | Distilled strategy-level memory items from BOTH successes and LLM-self-judged failures | **No store-side curation at all** ("newly generated items are directly added without additional pruning"); quality held at **retrieval**: top-k=1 beat k=2/3/4 (49.7 vs 46.0/45.5/44.4) | **Format finding**: naive failure logging is an anti-pattern (bolting failed trajectories onto AWM DROPPED 44.4→42.2) while distilled lessons — **max 3 items per trajectory**, each title + one-sentence description + distilled content — improved 46.5→49.7 |
| **ACE** (arXiv 2510.04618, ICLR 2026) | Oct 2025 (rev. Mar 2026) | DeepSeek-V3.1 | No | Generator/Reflector/Curator roles; itemized delta "bullets" with IDs + helpful/harmful counters | **Deterministic non-LLM merge + embedding dedup** on the write path (chosen deliberately, with frontier models, to prevent context collapse) | The 18,282→122-token collapse case; also the **"brevity bias" warning**: anti-bloat as an optimization target drops domain insight — contexts should be "comprehensive … playbooks", with prompt caching absorbing the cost (91.8% of ACE input tokens cache-served; caveats: added post-v1, own-workload measurement) |
| **SAGE** (arXiv 2409.00872, Neurocomputing 2025) | Sep 2024 | GPT-3.5/GPT-4 | Borderline (GPT-4-class, pre-2025 era) | Memory retention decided by the **Ebbinghaus forgetting curve** (exponential time decay) | Mechanical decay as a live 2024-era option | Shows arithmetic forgetting persisted as a design choice into 2024–25 |
| **SSGM framework** (arXiv 2603.11768) | Mar 2026 | **none — design-only position paper** | No | Every memory delta passes a **Write Validation Gate**: logical contradiction check against core memory (ΔM ∧ Mcore ⊧ ⊥ → reject), a Truth-Maintenance-System posture | Gated pre-commit writes | The closest published analogue to storytree's gated graduation + alignment check — but NO implementation, NO models, NO empirical results (H1–H3 untested) |

### Supplementary sources `[extracted — passed source extraction, not the 3-vote verification]`

| Source | Date | Models | Predates frontier? | What it adds |
|---|---|---|---|---|
| "Useful Memories Become Faulty When Continuously Updated by LLMs" (arXiv 2605.12978) | May 2026 | frontier-era | No | Continuously LLM-consolidated memory **first rises, then degrades, and can fall below the no-memory baseline** — overgeneralization, wrongly merged episodes, compounding compression errors |
| STALE benchmark (arXiv 2605.06527) | May 2026 | best evaluated: Gemini-3.1-pro | No | Even the best 2026 frontier model hits only **55.2%** at recognizing/acting on invalidated memories — frontier judgment alone does not reliably detect stale lessons |
| Memory-poisoning safety study (arXiv 2604.16968) | Apr 2026 | GPT-4o, Claude-4.5-Sonnet, DeepSeek-V3.2, Qwen3 family | No | Accumulating experience from **purely benign** tasks into external memory (AWM/ReasoningBank-style) systematically *increased* attack success rates (e.g. GPT-4o 37.0→50.0) — a safety wrinkle for any always-injected experience store |
| GRASP (arXiv 2605.29668) | May 2026 | frontier-era | No | A 2026 system that went the OTHER way: arithmetic admission (accept a skill only if held-out probe improvement > regressions, within a hard regression budget) — mechanical gates are not extinct where a runnable probe exists |
| SkillOS (arXiv 2605.06614, Google/UIUC/MIT) | May 2026 | frozen executor + GRPO-trained curator | No | Separates the frozen doer from a **trainable skill curator** managing a Markdown skill repo (insert/update/delete) — the doer/curator split storytree also uses (leaf vs librarian) |
| Experience-cards governance study (arXiv 2601.06789) | Jan 2026 | GPT-4o(-Mini), Claude-4-Sonnet, others | No | Raw stored records (GitHub PR+patch) give unstable model-dependent benefit; **LLM-governed standardized experience cards** consistently help — governance/standardization is what makes experiential memory reliably useful |
| Survey: memory governance (arXiv 2603.07670) | Mar 2026 | survey (single-author preprint) | No | Names **self-reinforcing bad lessons** as a core failure mode of write-back loops: an unverified generalization written to memory permanently biases behavior "because the agent stops collecting counter-evidence" |
| Every.to "Compound Engineering" + Larson's review | Sep 2025–Jan 2026 | Claude Code (Sonnet/Opus 4.x-era) | No | Production practitioner instance of the loop: Plan → Work → Assess → **Compound** (feed lessons back into a wiki-like store consulted by future planning). Practitioner, not benchmarked |
| HumanLayer "Writing a good CLAUDE.md" | Nov 2025 | frontier thinking LLMs | No | Empirical capacity bound: frontier models follow **~150–200 instructions** with reasonable consistency; smaller models degrade faster — a hard budget on always-injected guidance files |
| Claude Code memory tiers (practitioner analysis) | Apr 2026 | Claude Code | No | A frontier coding agent now ships a built-in capture-and-consolidate memory loop (CLAUDE.md + auto-memory + background consolidation) — the substrate ADR-0095 already graduates from |

## Failure-mode synthesis (what actually goes wrong)

1. **Bloat is a correctness problem, not just a cost problem.** Stored errors propagate and
   contaminate future learning; continuously consolidated stores can end below the no-memory
   baseline (2605.12978); even 2025 frontier models degrade as injected context grows (Chroma
   context-rot, 18 models incl. Opus 4 `[extracted]`).
2. **Self-generated lessons can poison the store from day one** — ExpeL 2023 (reflections hurt,
   hallucinated content), the self-reinforcing-bad-lesson loop (2603.07670: the agent stops
   collecting counter-evidence once a wrong rule is written). This is the slop the owner named, and
   it is documented across both eras.
3. **Naive failure logging is an anti-pattern; distillation is load-bearing.** Raw failure
   trajectories bolted onto a store were flat-to-harmful; small structured lessons from both
   successes and failures helped (ReasoningBank ablation).
4. **Whole-store LLM rewrites are destructive** (ACE context collapse) — the one store operation
   never to grant.
5. **Frontier judgment does not reliably notice invalidated memories** (STALE 55.2%) — staleness
   detection must be structural (provenance, counter-evidence paths), not left to model vigilance.
6. **The anti-bloat instinct itself can fail** ("brevity bias", ACE): optimizing for concision drops
   the domain insight that made the store useful. Filter for signal (wrongness, redundancy,
   contradiction) — not length.

## Quality-gates catalogue (what was tried, by era)

**Pre-frontier (2023–24, mechanical/arithmetic):** hard caps (Reflexion Ω=1–3); weighted-sum
retrieval + numeric reflection thresholds (Generative Agents); vote counters (ExpeL); forgetting
curves (SAGE). **Frontier-era (2025–26, judgment-led):** LLM-as-judge admission (Mem0
ADD/MERGE/DELETE); LLM self-labeling + self-contrast (ReasoningBank); RL-trained curator agents
(Memory-R1, SkillOS); hybrid judgment-generates / deterministic-merge (ACE); contradiction-check
write gates (SSGM, design-only); arithmetic probe-based admission where a runnable probe exists
(GRASP); **retrieval-side gating as a complement/substitute for store hygiene** (ReasoningBank
top-k=1). **Absent from ALL verified prior art: human ratification as a graduation gate.** Every
surveyed system automates admission end-to-end — storytree's owner-ratified graduation step has
essentially no direct published precedent.

## What's newly viable with 2025–26 frontier models (and what isn't)

**Newly viable:**
- **Judgment-based curation as the primary worth-gate** — the pre-frontier arithmetic (thresholds,
  counters, decay curves) existed because the judge was weak (ExpeL said so in 2023). ADR-0032's
  2026-06 bet ("graduation is intelligence, not arithmetic") is the field's 2025 consensus direction.
- **Distill-both-successes-and-failures** into small structured lessons — needs a model that can
  reliably judge its own trajectory outcome (LLM-as-judge with no ground truth only became
  dependable in the frontier era).
- **Comprehensive playbooks over forced concision** — prompt caching changed the economics of long,
  detailed guidance (with the caveat that per-consumer JIT pulls cache differently than ACE's
  single evolving context).
- **Doer/curator role splits with the curator holding real judgment authority** (Memory-R1, SkillOS)
  — pre-frontier curators needed operators simple enough for a weak model to follow.

**NOT fixed by frontier models (still needs structure):**
- **Sycophantic/confabulated self-report** — a plausible lesson atop real-looking evidence still gets
  written (Mem0's 97.8% junk shipped THROUGH an LLM judgment gate).
- **Whole-store rewrite discipline** — ACE chose deterministic merges *because* frontier judgment
  collapses stores.
- **Staleness detection** (STALE 55.2%) and **counter-evidence collection** (the self-reinforcing
  loop) — must be structural.
- **Injection budgets** — more retrieved memory monotonically hurt even with frontier models
  (ReasoningBank k-ablation; context-rot).

## Implications carried into ADR-0168 (traceability)

| Verified finding | ADR-0168 design element |
|---|---|
| Distilled max-3 items per trajectory beat raw/verbose capture | Retro cap of 3 items per session (D1) |
| Naive failure logging is an anti-pattern | Friction shelf is pre-consumption raw material — never injected into working agents; only distilled, routed essence renders into guidance (D2/D5) |
| ACE context collapse; deterministic merge paths | Shelf is per-item append-oriented files; tombstone moves are deterministic; no agent ever holistically rewrites the shelf (D2/D4) |
| Mem0 junk audit (judgment admission ≠ clean store) | Worth-judgment is paired with structural fences: evidence-required-at-capture, bounded adjudication, fail-closed drain ceiling (D3/D4) |
| Self-reinforcing bad lessons; STALE 55.2% | Provenance on every friction-born artifact + "contradicting a friction-born artifact is itself first-class friction" + tombstones keeping counter-evidence attachable (D4/D6) |
| Retrieval-side gating (top-k=1) as a proven lever | storytree's existing pull-based JIT context architecture (ADR-0023/0161) already IS the injection-side gate; the loop feeds it rather than adding an always-injected store |
| Brevity bias warning | The justification bar filters for signal/discriminatory power (`signal-and-noise`), never for length |
| No published precedent for human ratification | The owner-held ratification step is storytree's deliberate novelty — kept (ADR-0110), with the board digest batching candidates so the owner gate scales |
| ExpeL capability-determines-scaffolding; 2025 judgment-led shift | The gate is judgment-centred with mechanical enforcement only where frontier models demonstrably still fail (the ADR's whole posture) |

## What prior art does NOT settle (open questions)

1. Does judgment-based curation keep a store clean over **production timescales** (months, thousands
   of entries)? Mem0's audit says no for that system; ReasoningBank sidesteps via append-only + k=1
   and was never run long-horizon.
2. **Store-side curation vs retrieval-side gating head-to-head** — never directly compared;
   storytree's fork (gate at graduation vs rely on JIT pull) has no experimental answer.
3. **Where does human ratification optimally sit?** Unstudied — every surveyed system automates
   admission. Whether owner ratification adds signal beyond LLM-judge + deterministic merge, or just
   latency, is storytree's own experiment to run (the ADR-0168 success measures are designed to
   answer it).
4. Do ACE's anti-brevity findings transfer from one evolving context to a **shared library consumed
   JIT by many heterogeneous agents**? Different caching and relevance dynamics; unknown.

## Source index (dates + models at a glance)

Verified 3-0: arXiv 2303.11366 (Mar 2023, GPT-3/3.5/4) · 2304.03442 (Apr 2023, gpt-3.5-turbo) ·
2305.16291 (May 2023, GPT-4) · 2308.10144 (Aug 2023, gpt-3.5 actor + gpt-4-0613 extractor) ·
2409.00872 (Sep 2024, GPT-3.5/4) · 2504.19413 (Apr 2025, frontier-era) · 2507.21046 (Jul 2025,
survey) · 2508.19828 (Aug 2025, RL-trained manager) · 2509.25140 (Sep 2025, Gemini-2.5 +
Claude-3.7-Sonnet) · 2510.04618 (Oct 2025, DeepSeek-V3.1) · 2603.11768 (Mar 2026, design-only, no
models). Extracted (not 3-vote verified): 2601.06789 (Jan 2026) · 2603.07670 (Mar 2026) ·
2604.16968 (Apr 2026) · 2605.06527 (May 2026) · 2605.06614 (May 2026) · 2605.12978 (May 2026) ·
2605.29668 (May 2026) · practitioner blogs (Sep 2025–Apr 2026: every.to, lethain.com,
humanlayer.dev, morphllm.com, mem0.ai, artemxtech.substack.com, towardsdatascience.com).

*Generated 2026-07-06 by the deep-research harness (Claude Fable 5); 107 agents, 5 angles, 25
sources, 125 extracted claims, 25 adversarially verified (25 confirmed / 0 refuted / 0 unverified).*
