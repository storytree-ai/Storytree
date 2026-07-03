# Vibe-coding coverage map (2026) — which gripes storytree answers, and where it doesn't

**Companion to** [`vibe-coding-gripes-2026.md`](vibe-coding-gripes-2026.md) (the evidence base) and the
[`website-experience`](../../stories/website-experience/story.md) story it dramatizes. Where the gripes
doc catalogues the *pain*, this doc is the honest **audit**: each pain → the storytree mechanism/ADR
that answers it (cited to code), **or** an explicit **gap**. It is the menu the Act 2 walkthrough
teaches from — every UI element the walk reveals should answer a gripe on the *covered* side of this
map — and the source of the gaps raised to the owner for review.

**Method & honesty rules.** Coverage claims are cited to a mechanism (ADR + a representative
`file:line`, anchors as of 2026-07-03). Every candidate gap was checked against the live decision log
(`storytree adr list --load-bearing` / `--current`, plus a body grep of `docs/decisions/`) **before**
being called a gap — a corpus-settled item mis-raised as a gap is non-adherence, not honesty
([corpus-settled-escalation](../../CLAUDE.md) / the owner-fork-bar). The rule cuts both ways: coverage
is not inflated to look complete, and gaps are not manufactured. Where coverage is *partial* or rests
on a *human* backstop, it says so.

**2026 currency.** The pain evidence is refreshed from the adversarially-verified research folded into
the gripes doc's *"2026 refresh"* section (deep-research pass, 2026-07-03). Two caveats carry into this
map: (a) the **architecture-degradation (C)** and **multi-agent-supervision (D)** clusters received *no
fresh 2026 primary-source re-confirmation* in that pass — they are carried-over-and-plausible, not
reconfirmed-current; storytree's coverage of them is real regardless, but the *pain's* current
magnitude is less certain than A/B. (b) The **verification gap (A)** is now the single most-quantified
pain — which is exactly storytree's center of gravity.

---

## The one-line thesis

storytree is, mechanically, **an answer to the verification gap and to illegibility** — the two
deepest 2026 wounds. It makes "done" mean *a signed, spine-observed proof* instead of the agent's word,
and it makes architecture and in-flight work *legible on one map*. That is most of the list. What it
does **not** yet touch is a coherent, nameable set: the **security/supply-chain** of the code the agent
writes, **within-codebase duplication**, and a few **out-of-domain** human/economic pains. Those are the
gaps.

---

## A — the verification gap ("done" is a lie) · **the dominant 2026 pain · COVERED (core)**

> Refreshed evidence: SO 2025 (n≈49k) — *"almost right, but not quite"* is the **#1 frustration at 66%**;
> distrust of AI accuracy (46%) now **outweighs** trust (33%); trust-in-accuracy fell 40%→29% YoY.
> This is the market storytree is built for.

| Gripe (from the base) | storytree mechanism | Cited |
|---|---|---|
| The agent grades its own homework (writes code *and* the tests that "prove" it) | Red→green is **enforced spine-side**, not by the agent: the spine authors the phase machine and *observes* RED then GREEN | ADR-0020 · `packages/orchestrator/src/prove-it-gate.ts:133` (`proveUnit` walks AUTHOR_TEST→CONFIRM_RED→IMPLEMENT→CONFIRM_GREEN→GATE) |
| Reward hacking (delete assertions, stub returns, swallow exceptions to go green) | **Hollow-test detection** — a contract counts as covered only by a *substantively-asserting* test (static-AST); and a **synthetic/scripted PASS can never derive a green** | ADR-0126 · `packages/orchestrator/src/proof/contract-coverage.ts:271` (`extractVouchingTestNames`) · ADR-0099 · `packages/drive/src/build-worker.ts:200` (smoke omits the verdict store) |
| "47 passed, 0 failed" yet the feature isn't there | **Per-contract coverage** maps every *declared* contract to an *observed* test — an untested contract can't ride a green | ADR-0122 · `packages/cli/src/check-coverage.ts` · `packages/orchestrator/src/proof/contract-coverage.ts:62` |
| It lies about what it did / deleted the prod DB during a freeze | **Write-scoped execution** behind a fail-closed `PreToolUse` hook (per-phase write scope), and the **signed verdict is the record** — not the agent's narration | ADR-0020/0030 · `packages/orchestrator/src/write-scoped-executor.ts:62` · `packages/agent/src/sdk-author.ts` (PreToolUse write hook) · verdict shape `packages/proof-protocol/src/proof.ts:70`, signer `packages/orchestrator/src/proof/signer.ts:38` |
| A halted/timed-out run reported as a pass | **Halt-is-never-a-pass** guard: a halted iteration can never report `passed:true` | ADR-0005 · `packages/orchestrator/src/sequence.ts:100` (`runLoop`) |

**This is the walkthrough's beat 3** ("it branches — limbs green **only on a signed passing proof**"):
the single most important thing the map teaches, because it answers the single most-cited pain.

**Honest limit (partial, by design).** The gate proves *a test goes red→green*; it cannot prove the
**test encodes the right semantic**. The IEEE "silently substituted row-index +1 — runs perfectly,
returns garbage" failure survives if no test catches it. storytree's backstop is **not** another
machine check — it is the **human UAT node + per-test attestation** (ADR-0044) and the two-stage
operator-attest for felt/visual surfaces (ADR-0070): a person witnesses the story's acceptance walk.
So "silent plausible wrongness" is answered *at the unit/UAT altitude, by a human witness* — made
cheap and auditable by the signed proof — not *eliminated per line*. That honesty is the point: green
means "proven against its declared obligations," not "correct in every unstated way."

---

## B — AI slop & the review bottleneck · **MIXED**

> Refreshed evidence: debugging AI code is more time-consuming for **45.2%** (SO 2025, 2nd-most-cited);
> the **productivity-feeling illusion** is robust (METR RCT: devs 19% *slower* while believing ~20%
> *faster* — a ~40pp perception gap), though METR now flags the **−19% magnitude itself as contested**
> (the perception gap survives, the point estimate doesn't).

| Gripe | storytree mechanism / verdict | Cited |
|---|---|---|
| The review bottleneck — a 2000-line plausible PR you're responsible for but don't understand | **Slow growth, minimum-to-green**: one bounded *provable* unit per merge, landed via the ceremony (green unit → non-draft PR → CI auto-merge); the reviewer reads a **signed proof + a legible map**, not a wall of diff | ADR-0022 (green-gate + auto-merge) · the `slow-growth-minimum-to-green` / `merge-ceremony` Library rules · **COVERED** |
| Productivity-feeling illusion (feel faster, measured slower) | storytree substitutes **proof-as-ground-truth for the feeling** — the verdict is auditable evidence of what actually happened — **but it does not measure velocity or close the perception gap** | philosophically aligned (`observability-first`, `audit-the-signed-verdict`) · **PARTIAL / adjacent** — see gaps |
| Debugging AI code costs more than writing it | Indirect: red→green means un-proven code doesn't *land*, but debugging a red gate is still debugging | no direct mechanism · **PARTIAL** |
| Maintainers drowning in AI-generated bug reports | Inbound OSS-contributor triage — **outside storytree's problem domain** (it grows *your* tree; it is not an inbound-report filter) | **out-of-domain** — see gaps |

---

## C — architecture degradation · **COVERED, except duplication**

> Currency caveat: this cluster got **no fresh 2026 primary-source re-confirmation** in the refresh
> round — the GitClear/OX-Security/coupling figures are carried over from mid-2025. storytree's coverage
> is real regardless; the *pain's* current magnitude is the softer claim.

| Gripe | storytree mechanism | Cited |
|---|---|---|
| Comprehension debt / orphaned architecture — nobody holds the mental model | **Intent is a first-class thing on the map**: the work hierarchy (story › capability › contract) with the outcome on a label; the whole forest is legible at a glance | ADR-0002 · `packages/library/src/schema.ts:22` · **the walkthrough's beat 1 + pull-back** |
| Tight coupling / god-modules by default | The **cross-story dependency graph is gated and UI-visible** — every cross-organism code edge needs a *declared* edge; a god-module is the territory every road piles into | ADR-0074 · `packages/cli/src/boundaries.ts:163` (`checkBoundaries`) |
| Layering violations (inline SQL in handlers, repository bypassed) | The **wrong-way road** — a UI→DB edge skipping the service layer — is visible the moment it's drawn | ADR-0074/0115 · **the walkthrough's beat 4** (flagged from data) |
| Hidden coupling / blast radius (a 3-file fix lands as a 14-file PR) | **Declared-edge drift detection** — real edges are derived from `sourceFile` imports and compared to declared edges; undeclared coupling is reported | ADR-0115 · `packages/cli/src/boundaries.ts:503` (`declaredEdgeDriftReport`) |
| **Duplication instead of reuse** (GitClear: clones 8.3%→12.3%; auth logic in 7 places) | **GAP.** storytree's organism model deliberately **duplicates behaviour *across* organisms** (ADR-0010/0068 — DRY is wrong across bounded contexts); *within* a codebase, **nothing detects or gates code clones**. The map shows *coupling*, not *duplication* | **see gaps (in-domain #3)** |

> ⚠ **Site over-claim — RESOLVED (owner 2026-07-03: out of scope; correct the claim).** The Act-2 beat
> table in the gripes doc folded "duplication (10)" into **beat 4** ("stories connect via roads"). But
> roads show *coupling and layer-jumps*, **not code clones** — the mechanism doesn't detect duplication.
> Clone-detection is out of scope (owner's call), so the walkthrough **stops implying it answers
> duplication**: the gripes-doc beat table is corrected, and Phase 2's reveal design inherits the
> corrected beat-4.

---

## D — context loss & multi-agent supervision chaos · **COVERED** (this *is* Act 1 → Act 2)

> Currency caveat: like C, the supervision-chaos half (botsitting hours, terminal sprawl,
> done-vs-in-flight) got **no fresh 2026 re-evidence** in the refresh — carried over from mid-2025. The
> adjacent 2026 findings (METR's context-snowball, Stanford's cost paper) touch it without directly
> measuring supervision burden.

| Gripe | storytree mechanism | Cited |
|---|---|---|
| Babysitting / botsitting (~6.4 hrs/week "the agent types, I check, I'm tired") | **Wisps — presence without obligation**: a soft mark drifts over live work; the visitor/owner *watches*, they don't *approve each step* | ADR-0138 · `packages/notice-board/src/claim.ts` · **the walkthrough's beat 2** |
| Terminal sprawl — 15 sessions, no single overview | **One forest on one screen** — the anti-storm. The notice board is session presence; the map is the overview Act 1's HUD refuses to be | ADR-0033 (notice board) · `packages/notice-board/` · **the walkthrough's beat 5 / pull-back** |
| Done vs in-flight vs abandoned is unknowable | The **status legend**: green = proven, sapling = in-progress, withered = broken — derived from signed verdicts, not self-report; and the **wisp is a forced, CI-cleared story-claim** (one coordination + observability layer) | ADR-0040/0138/0142 · status `packages/forest-world/src/scene.ts:45` · claim `packages/notice-board/src/claim.ts:51` |
| "Agent A doesn't know Agent B changed the API it depends on" | **Per-unit write-claim** refuses a *second concurrent build of one unit* | ADR-0121 · `packages/notice-board/src/claim.ts` (per-unit build-claim, stale-reclaim window) |
| Session amnesia ("every new conversation is his first day") | The **Library is the persistent cross-session memory** (pull-based, just-in-time), and the **graduation loop** turns repeated friction into durable guidance so the *next* session doesn't relearn it | ADR-0023 (pull-based CLI) · ADR-0032/0095 (cite + memory→Library graduation) |
| Going in circles (fix reintroduces the original bug) | **Per-contract coverage** means a covered contract has a test; a regression *in a covered path* reds the gate | ADR-0122 · **COVERED for covered paths** (nuance: only what a test encodes) |
| Context rot mid-session (violates conventions set an hour ago) | **Own the loop + context engineering** and just-in-time pull of the corpus (vs a stuffed context that rots) | ADR-0011 · ADR-0023 · **COVERED-ish** |

---

## NEW 2026 pains (not in the mid-2025 base)

| Pain (verified 2026) | storytree today | Verdict |
|---|---|---|
| **Security of AI-generated code** — ~45% of AI code introduces an OWASP Top-10 flaw; security pass-rate flat ~55% over two years while functional correctness climbed ~50%→95% (Veracode 2025 / Spring 2026; reasoning models reach 70–72%, still sub-production) | The prove-it-gate proves **functional** red→green. A vulnerability that *passes the tests* lands green. There is **no security/SAST/vuln dimension** in the proof machinery (grep of `docs/decisions/` for security = only storytree's *own* op-sec: write-scope, injection-safe arg vectors, IAP, keyless auth) | **GAP (in-domain #1)** |
| **Slopsquatting / hallucinated deps** — LLMs name a non-existent package at **4.62–6.10%** on the 2026 frontier cohort (["The Range Shrinks, the Threat Remains"](https://arxiv.org/abs/2605.17062)), down from Spracklen 2025's 5.2–21.7% but **not retired**: 127 names invented identically across five models (53 still registrable), 43% repeatable → a squattable supply-chain vector (real Jan-2026 npm incident) | A dep add is **spine-driven, never the leaf's** (ADR-0064 amends ADR-0031 §2 — "the leaf can never add a dependency" stands; the *spine* runs a declared `real.addDeps: […]`) with injection-safe arg vectors (`execFile`, no flag injection — ADR-0064 §2 / ADR-0087), but **nothing checks a package name is real / non-malicious** before it's added — write-scope bounds *what file* is written, not *whether a dep exists* | **GAP (in-domain #2)** |
| **Cost / economics** — agentic coding ~1000× the tokens of non-agentic use; up to 30× cost variance on identical repeat runs (Stanford Digital Economy Lab, 2026) | storytree **removed USD ceilings** (subscription-funded) and made the **turn cap the runaway brake** (ADR-0130/0131) — so *per-slice runaway is bounded by design*. But there is **no cost observability/prediction** for the broader token economics | **PARTIAL / by-design** — see gaps #4 |
| **Skill atrophy / deskilling** — directional: Anthropic Feb-2026 RCT, 52 mostly-junior engineers, AI-assisted 50% vs hand-coding 67% on a comprehension/debugging quiz (surfaced in search, *not* in the adversarially-verified core — treat as directional) | A human-development concern; no storytree mechanism, and arguably none belongs | **out-of-domain** — see gaps |

---

## The gaps — raised to the owner · **RESOLVED 2026-07-03**

Each was verified corpus-silent against the live decision log, then **raised to the owner** (owner-fork-bar
— not self-decided). The owner's calls are recorded inline below (2026-07-03). Split by whether it
plausibly *belongs* in storytree's problem domain. **No ADR is drafted here** — an *ADR-worthy* verdict
means a future session reserves + drafts the decision under the owner's direction; this record is that
direction.

### In-domain — plausible extensions of the proof/legibility model (each may warrant an ADR)

1. **Security / vulnerability proof.** The gate proves functional red→green, not the *absence of
   vulnerabilities*; a vuln that passes tests lands green. This is the **most strongly-evidenced new
   2026 pain** and sits squarely on storytree's thesis ("done means proven"). *Question for the owner:*
   should the proof model gain a **security dimension** (a SAST/vuln check as a proof mode or a gate),
   or is this deliberately out of scope — proof covers only what the author's tests encode, security
   included?

   **→ OWNER (2026-07-03): ADR-worthy.** The proof model should gain a **security dimension**; a future
   session reserves + drafts the ADR under the owner's direction (a SAST/vuln check as a proof mode or
   gate is the design space — not drafted here).

2. **Dependency provenance / anti-slopsquatting.** The spine can add declared deps (ADR-0064; the leaf
   still cannot); nothing verifies the package **exists / is non-malicious** before the add. *Question:*
   should a dep-add earn an existence/provenance check (a small, cheap gate), or is that the human's
   review at the merge ceremony?

   **→ OWNER (2026-07-03): fold into gap 1's security ADR.** Checked against the latest evidence first
   (the owner asked whether frontier models retired the threat): the 2026 re-evaluation
   *["The Range Shrinks, the Threat Remains"](https://arxiv.org/abs/2605.17062)* (Claude Sonnet 4.6 /
   Haiku 4.5, GPT-5.4-mini, Gemini 2.5 Pro, DeepSeek V3.2; ~200k prompts) puts hallucination at
   **4.62–6.10%** — down from Spracklen 2025's 5.2–21.7% (the *worst* case collapsed; the floor barely
   moved), with **127 names invented identically across all five models, 53 still registrable** after
   registry defenses, and a real Jan-2026 npm incident (`react-codeshift`, 237 repos). The threat is
   **smaller but live**, and the *effective* defense is a **reputation/provenance** signal
   (Socket.dev-class) — not a cheap existence check (a slopsquatted package *does* exist). Because that
   is one concrete instance of gap 1's security dimension, dep-provenance is **folded into gap 1's future
   security-proof ADR** (existence vs reputation vs the existing spine-only, declared, human-reviewed
   dep-add backstop, weighed as one design question) — not a separate decision.

3. **Code-clone / duplication detection.** Nothing gates *within*-codebase duplication (GitClear's core
   finding). The organism model duplicates *across* organisms by design; *within*, clones are ungated —
   **and the website's Act-2 beat-4 currently over-claims coverage of this**. *Question:* build a
   clone-detection signal (a check, or a Library "reference-don't-restate" enforcement on code), or
   accept it as out of scope and **correct the site's claim**?

   **→ OWNER (2026-07-03): out of scope; correct the claim.** No clone-detection mechanism — the organism
   model deliberately duplicates across bounded contexts, it is the softest-evidenced gripe, and it was
   *not* re-confirmed in the 2026 refresh. The Act-2 walkthrough **stops implying beat-4 answers
   duplication** (beat-4 shows coupling / layer-jumps only). Corrected here — the ⚠ callout above and the
   gripes doc's beat table — and carried into the site by Phase 2 (the walkthrough-expansion chip).

### Scoping-confirmation — likely out of domain, surfaced so the omission is *chosen*, not accidental

4. **Cost observability.** The turn cap bounds per-slice runaway, but there's no measurement/prediction
   of the 1000×-token / 30×-variance economics. Is the subscription-funded + turn-cap model the
   *deliberate* answer (metered cost traded away), or is cost observability worth a future gate?

5. **Productivity-measurement illusion.** storytree answers "trust the proof, not the feeling" but does
   **not measure velocity** or close the perception gap. Confirm this is intentionally out of scope.

6. **Skill atrophy / deskilling** and **7. maintainer inbound-slop triage** — human-development and
   OSS-contributor-triage concerns respectively; no mechanism, and arguably none should exist. Confirm
   these are outside the problem statement.

   **→ OWNER (2026-07-03): all four out of scope — confirmed.** Cost observability (4) is answered
   *by-design* (subscription-funded + turn-cap runaway brake, ADR-0130/0131 — metered cost traded away);
   productivity-measurement (5), skill atrophy (6), and maintainer inbound-slop triage (7) are
   human / economic / OSS-triage concerns outside "grow your tree." Deliberate omissions, not accidents.

> The gaps do **not** block Phase 2 (the walkthrough expansion): the walk teaches the *covered* side of
> this map. The gaps are exactly what we deliberately *don't* show — pending the owner's call on whether
> any becomes a decision.

---

## How the walkthrough uses this map (feeds Phase 2)

The owner's direction is that Act 2 should **open on one loved island and expand slowly to the full
forest map, revealing more real UI vocabulary as it goes**. This map is the menu for that reveal: each
UI element the expansion surfaces should teach a **covered** gripe —

- **beat 1 · plant a story** → *comprehension debt / orphaned intent (C-13)* — intent on a label.
- **beat 2 · watch a wisp** → *babysitting / botsitting (D-17)* — presence without obligation.
- **beat 3 · it branches (green only on signed proof)** → *the verification gap (A-1,3,4)* — **the
  dominant pain**; the map's most load-bearing teach.
- **beat 4 · stories connect (the wrong-way road)** → *layer-jumps, god-modules, hidden coupling
  (C-9,11,12)* — **not** duplication (see the over-claim flag).
- **beat 5 · pull back to one forest (green/sapling/withered)** → *terminal sprawl, done-vs-in-flight
  (D-18,19)* — the anti-storm.

The expansion's *new* reveals (more islands, the real dependency roads between stories, the status
legend, session wisps, the pull-back to one legible forest) each correspond to a covered row above —
so the walk, made watchable, **is** this coverage map. Phase 2 routes the hierarchy/beat-vocabulary
question to `story-author`; this doc is its input.

---

## Sources

Pain evidence and its reliability flags live in [`vibe-coding-gripes-2026.md`](vibe-coding-gripes-2026.md)
(base + 2026 refresh). Primary sources for the 2026 additions: Stack Overflow 2025 Developer Survey
(survey.stackoverflow.co/2025/ai); METR RCT + 2026 uplift update (metr.org); Veracode GenAI Code
Security 2025 / Spring 2026; USENIX Security 2025 (Spracklen et al.) + arXiv:2501.19012 on package
hallucination, and the 2026 frontier-cohort re-evaluation arXiv:2605.17062 ("The Range Shrinks, the
Threat Remains"); Stanford Digital Economy Lab, arXiv:2604.22750 (agentic token cost). storytree mechanism
cites are to the live corpus (`storytree adr list`) and code anchors as of 2026-07-03.
