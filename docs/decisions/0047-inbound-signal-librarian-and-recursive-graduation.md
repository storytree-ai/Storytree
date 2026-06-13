---
status: proposed
decided: 2026-06-14
---

# ADR-0047: Inbound signal is a dedup librarian and recursive graduation — not a persuasion gate

## Status

proposed (2026-06-14). Records the direction from the owner design conversation of 2026-06-14 (and
the prior-research pass captured in `docs/research/anti-slop-inbound-signal-gate.md`). The owner has
approved the *direction* but is explicit that this is **not yet for build** ("maybe soon — let's
see"); this ADR exists so the reasoning is on the record before any work starts (constitution
principles 3 and 8). It **develops** the graduation half of
[ADR-0032](0032-cite-graduation-mechanism.md) (the signal-graph + future synthesis agent) and adds
the *intake front door* that ADR-0032 did not cover, continuing the
[ADR-0014](0014-notice-board-feedback-graduates-into-durable-guidance.md) →
[ADR-0027](0027-supersede-adr-0014-notice-board.md) → ADR-0032 lineage. No frontmatter supersession
edge: it extends, it does not overturn (the relationship is recorded in prose below, the ADR-0032
convention).

## Date

2026-06-14

## Context

storytree will eventually take **inbound signal** from people who are not the founder — concerns,
comments on the library, "we should build this", contributions — and most of those people are not
engineers (constitution principle 5: *you don't have to write code to matter here*). The owner's
starting intuition was a gate: to submit any signal you must first **convince an AI it is legitimate,
not noise** — optionally bringing your own model API key so a spammer bears the per-attempt cost.

A research pass (`docs/research/anti-slop-inbound-signal-gate.md`) examined this and found the
**persuasion gate** to be the wrong shape, and — crucially — **not rescued by newer frontier models**:

- The real problem is an **asymmetry**: with an LLM, *producing* a plausible signal costs a fraction
  of a cent, while *reviewing* it still costs a scarce human their attention. Any scheme that does
  not make producing cost more than ignoring merely relocates the cost.
- It was **already tried and failed**: curl added friction + AI rules + bans against a flood of
  AI-generated reports and **shut its bug-bounty program down in January 2026** anyway (~5% genuine,
  ~20% obvious slop). Friction-as-filter taxes everyone and the honest hardest.
- The industry deliberately uses AI as **assist + human-in-the-loop, never a hard gate** (GitHub's
  `ai-moderator` labels/minimizes, never auto-rejects; Reddit AutoModerator + Perspective the same).
- "Convince the AI" is a known security anti-pattern (Lakera's Gandalf), and **LLM-as-judge is
  measurably unreliable** (position/verbosity/self-preference bias; >50% error on bias tests on
  frontier models in 2026; verdicts flip on rephrasing).
- **BYO-key economics fail**: 2026 cheap models are ~$0.05–0.15 per *million* input tokens, so a pitch
  costs well under a cent; and a key **is not an identity** → zero Sybil resistance.

The owner refined the direction over the 2026-06-14 conversation, and the refinements are what this
ADR records:

1. **The gate is a *novelty* test, not a *persuasion* test.** Online forums recycle the same topics
   in circles. An AI that has ingested the whole corpus turns "is this legitimate?" (an unreliable
   **judgment**) into "is this already in the corpus?" (a tractable **retrieval**). Eloquence does
   not help you score lower on redundancy. This dodges three of the four model-independent objections
   (persuasiveness≠legitimacy, judge-bias, and — via slow scaling — inclusivity).
2. **Prose-backed-by-a-library is more dedup-amenable than code.** The AI-slop literature is mostly
   about *verification* signal (is this claimed bug real?), which dedup cannot adjudicate. storytree's
   signal is mostly concerns/ideas/priorities, where a paraphrase of a settled idea **is** detectable
   even though a paraphrase of working code is not a meaningful "duplicate". storytree's unfair
   advantage is having a **structured decision corpus to dedupe against** — 46 ADRs with validated
   frontmatter, the open-questions, the library, signed verdicts — which a generic repo lacks.
3. **Recurrence is two different signals.** *Informational* recurrence ("the same argument again") is
   noise and should be deduped. *Demand* recurrence ("ten people independently want X") is the
   strongest product signal there is and must be **aggregated, not suppressed**. A me-too lands as
   weight on the existing thread — counted and visible — which is exactly what principle 5 requires.
4. **Threads on everything are the extraction mechanism.** The owner wants to expand the library so a
   discussion thread can hang off **any artifact and even any comment**; you hash a point out in your
   small circle, extract the genuinely novel part, prove it, and it **graduates up the layers**. This
   is where the "5%-novel-in-95%-rehash" problem gets resolved — but it risks chaos, which this ADR's
   decision is mostly about containing.
5. **The gate is socio-technical and slow-scaling.** storytree opens gradually; members scale with
   the system. The filter is **AI dedup + member curation + reputation**, co-evolving — not AI alone —
   and it is tuned on observed behaviour rather than guessed up front (the same evidence-first stance
   ADR-0032 took on anti-gaming).

## Decision

These are the directional commitments. None is scoped for build yet; each names the storytree system
it would extend.

1. **The front door is a librarian, not a bouncer.** Inbound signal is **admitted cheaply**; the AI
   *assists* — interviews to sharpen a vague concern, extracts the structured fields a downstream
   artifact needs, and surfaces near-duplicates live. There is **no "argue past the AI to be heard"**
   step. A turn limit (≈3–6) bounds the interview; its purpose is to help and to cap grind, never to
   adjudicate legitimacy. BYO-key, if used at all, is **cost-attribution for the conversational
   "ask the project anything" feature** (principle 4), never the anti-spam judge.

2. **The filter is dedup/novelty against the corpus, not legitimacy-judgment.** Search **ADRs + open
   questions + library units + verdicts** for overlap and report it ("this overlaps ADR-00xx, decided
   <date>; is your point new, or a challenge to it?"). This is a **retrieval** problem, far more
   consistent than LLM pairwise judging. **Build keystone:** corpus similarity / `library search`,
   which extends [ADR-0023](0023-library-cli-choose-your-own-adventure.md)'s surfaces and **does not
   exist today** (the current surface is exact-kind `artifact list <category>`). The whole design rests
   on it.

3. **Dedup the information; aggregate the demand.** Redundant *information* is routed to the existing
   thread (a comment + a cite, per ADR-0032), never bounced. Redundant *demand* is counted as **weight
   on that thread** and feeds ranking. The same submission can be informationally-redundant and
   demand-additive at once; the system must distinguish the two. Thread/post volume on a node is a
   **demand heatmap** over the corpus, a ranking input even before anything graduates.

4. **Graduation is recursive across discussion layers** (the concrete form of ADR-0032's "future
   synthesis" vision). A discussion thread may anchor to any node — an artifact or a comment — and the
   distilled, proven, novel part **graduates up the layers**:
   `comment-thread → artifact-thread → signal/cite → open-question → ADR/story`.
   The anti-chaos rules — the load-bearing part — are:
   - **Threads are cheap, local, and disposable; only the distilled output is durable.** A thread is a
     workshop, not a record. It may be messy, go nowhere, and collapse. The corpus stays clean because
     the mess is transient. (Mechanically: comments gain a `parentId` and `topicKind` grows to include
     `comment`, reusing the proven `events.comment` event+projection substrate.)
   - **All friction lives at the graduation boundary, with an escalating bar by altitude** — starting a
     thread costs nothing; each step up demands more (a distilled point → novelty + demand → the
     structured OQ fields → a decision + proof). The firehose narrows as it climbs. **Most threads
     never graduate — by design.**
   - **Dedup recurses:** threads are deduped *at creation* ("there is already a live thread on exactly
     this — join it?"), the same move as signal intake, one layer down.
   - **Depth converts to graduation, not nesting:** a hot sub-thread distills upward rather than
     burrowing. **Comment-threads are leaves** that can only graduate to their parent artifact, never
     straight to the corpus — quarantining the highest-chaos surface.

5. **"Prove it" for an idea is a discussion-layer proof mode** (extends
   [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) /
   [ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md)). For prose, proof is not
   red-green; a distilled claim is "proven" when it is (a) **novel** vs the corpus (dedup), (b) has
   **survived a refutation attempt** in its circle (an adversarial check), and (c) is **cite-backed**.
   That can be recorded as a **signed verdict** under a new `proofMode` in `packages/core/src/proof.ts`,
   so a graduated *idea* carries proof the same way graduated *code* does — making principle 6 mean
   something for non-code contributions.

6. **Friction sits on identity/reputation, and the gate co-evolves with membership.** Reputation is
   **one input among several** to ranking, not a wall: account age (`createdAt`), progressive trust
   (`invited → active → trusted`, on `status`), and the existing invite-graph (`invitedBy`) — all
   already in `events."user"` ([ADR-0043](0043-app-owned-users-roles-and-ui-invitations.md)) — are
   real, hard-to-fake Sybil defenses an API key is not. The slow-scale rollout means the filter need
   not be perfect on day one: it starts loose, members curate, and their dupe/novel/up-down judgments
   generate the **labeled data** to tune (and later partly automate) it — evidence-first, exactly as
   ADR-0032 deferred anti-gaming machinery until observed.

7. **Admission is not shipping.** This whole mechanism lives on the *admission* side — cheap and
   assisted, so anyone can be *heard*. Principle 6's prove-it-gate (`events.verdict`, red-green)
   continues to gate *shipping code* and is **not** weakened or bypassed by it. Two gates, two jobs.

## What this builds on / extends

- **[ADR-0032](0032-cite-graduation-mechanism.md)** (cite = typed link; the signal-graph; graduation
  = a future synthesis agent; comment = a signal; "don't pre-solve anti-gaming"; identity = provenance
  not a gate) → this ADR gives the **graduation** half a concrete recursive structure and a proof
  mode, and adds the **intake front door** (the librarian/dedup) that ADR-0032 did not cover. It keeps
  ADR-0032's evidence-first, slow-scale stance rather than reversing it.
- **[ADR-0014](0014-notice-board-feedback-graduates-into-durable-guidance.md)** (superseded by
  [ADR-0027](0027-supersede-adr-0014-notice-board.md)) — the origin of "feedback graduates into
  durable guidance"; this is its continued development.
- **[ADR-0017](0017-cross-cutting-knowledge-tier.md)** / **[ADR-0023](0023-library-cli-choose-your-own-adventure.md)**
  — the library tier and its CLI; `library search` / corpus similarity (Decision 2) is the new surface.
- **[ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md)** / **[ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md)**
  — the proof model + signed verdicts the discussion proof mode (Decision 5) extends.
- **[ADR-0042](0042-hosted-studio-demo-cloud-run-iap.md)** / **[ADR-0043](0043-app-owned-users-roles-and-ui-invitations.md)**
  — members/roles/IAP identity, the reputation rails and member-curation substrate (Decision 6).
- **[ADR-0037](0037-decision-binding-and-hygiene-gates.md)** — the OQ→ADR lifecycle and OQ-build gate
  the top of the graduation ladder feeds into.

## Consequences

- **A future story** (e.g. `stories/inbound-signal`) becomes the build vehicle when picked up, with
  capabilities roughly: `corpus-search` (the `library search` keystone), `signal-intake` (the
  librarian interview + a draft-signal state), `discussion-threads` (threads on artifacts then
  comments, with dedup-at-creation), `graduation` (recursive distill-up + the discussion proof mode),
  and `reputation-rails`. **Not authored yet** — the owner is explicit this is pre-build.
- **Likely additive schema:** `parentId` + a `comment` `topicKind` on the comment substrate (and
  possibly an `events.signal` table), plus a new `proofMode` in `proof.ts`. All additive.
- **Build sequencing** when it starts: `corpus-search` first (everything depends on it); threads on
  **artifacts** before threads on **comments** (the latter is the highest-chaos, lowest-value surface
  and depends on the graduation boundary already being tuned).
- **Paid:** threads-on-everything is itself a slop-amplifier *if the graduation boundary is weak* —
  cheap-to-start threads are the trivial-submission asymmetry recursed one layer down. The design is
  safe **only** because cheap threads stay local/ephemeral and the cost lives entirely at graduation.
  Get that boundary wrong and you have rebuilt the recycling forum one level up.
- **Gained:** the corpus *becomes* the gate; the cost asymmetry flips onto the spammer (ignoring a
  low-ranked deduped item is free); and principle 5 is honoured — ideas are *heard and visible and
  weighed in the open* without an AI bouncer deciding, and a non-dev's me-too counts as demand.

## Open questions

These are the genuinely unresolved bits. They are written here in stakes / statement / options shape
so they can be promoted to first-class `open-question` library artifacts (the ADR-0018/0037 lifecycle)
when the work is picked up — that promotion needs the live DB and is deliberately not done here.

1. **The graduation boundary — what does it take to move up a layer?**
   *Stakes:* this is the single load-bearing mechanism; too cheap → slop firehose, too dependent on
   incumbents → gatekeeping by the in-group (a principle-5 failure as the system scales).
   *Statement:* define what gates each upward step (`comment-thread → artifact-thread → signal → OQ →
   ADR`). *Options:* (A) AI dedup-pass + a single member endorsement; (B) dedup + a reputation-weighted
   member vote threshold; (C) dedup + a refutation-survival check + member endorsement. Where does
   reputation enter, and how is incumbent capture avoided as membership grows?

2. **The discussion proof mode — what concretely is "proof of an idea"?**
   *Stakes:* principle 6 for non-code; a weak proof mode lets eloquent-but-empty claims graduate.
   *Statement:* define the new `proofMode`, what evidence its verdict carries, and who/what signs it.
   *Options:* (A) a real `events.verdict` row {novel ✓, survived-refutation ✓, cites[]} signed by a
   member; (B) a lighter discussion-local attestation that only becomes a verdict at the OQ/ADR layer;
   (C) AI-proposed, human-signed (mirroring ADR-0040's human-witness signpost).

3. **Thread topology and anti-chaos guarantees.**
   *Stakes:* the owner's stated worry — threads-on-everything creating chaos.
   *Statement:* fix the rules for anchoring (artifact and/or comment), thread-vs-thread dedup at
   creation, nesting bounds, ephemerality/collapse, and dead-thread handling. *Options:* (A) artifacts
   only first; (B) artifacts + comment-leaves that can only feed the parent; (C) full recursive
   threading with a depth cap. How long do non-graduated threads live, and who can collapse them?

4. **Information vs demand — the mechanics of "dedup the info, aggregate the demand."**
   *Stakes:* getting this wrong throws away the most valuable non-dev signal (recurrence = demand) or
   lets recycled information through as if novel. *Statement:* how does one submission get split into a
   (possibly-redundant) informational part and a (possibly-additive) demand part, and how is demand
   surfaced and fed to ranking? *Options:* (A) every me-too is an explicit cite/vote on the existing
   thread; (B) the librarian classifies info-vs-demand at intake; (C) a demand heatmap derived purely
   from thread/post volume per node.

5. **Novelty threshold and corpus ossification.**
   *Stakes:* a filter tuned to "we discussed this" can entrench past decisions and suppress legitimate
   reopening when context changes. *Statement:* how is "too similar = duplicate" calibrated, and how is
   *temporal/context* novelty admitted? *Options:* (A) a fixed similarity threshold; (B) a
   threshold tuned on member dupe/novel labels (the slow-scale data); (C) novelty that explicitly
   counts "a well-grounded challenge to a decided ADR" as novel, tied to the ADR `supersedes`/`amends`
   model so settled topics can be reopened on new grounds.

## References

- `docs/research/anti-slop-inbound-signal-gate.md` (the prior-research breakdown + the model-recency,
  additive-mechanisms, and dedup/librarian analyses this ADR distills; carries the external sources —
  curl, GitHub `ai-moderator`, Lakera Gandalf, LLM-as-judge bias studies, Constitutional Classifiers,
  the Opus 4.6 / Gemini 3 Pro fast-jailbreak findings, 2026 LLM pricing).
- [ADR-0014](0014-notice-board-feedback-graduates-into-durable-guidance.md),
  [ADR-0027](0027-supersede-adr-0014-notice-board.md),
  [ADR-0032](0032-cite-graduation-mechanism.md) (the cite/graduation lineage this develops),
  [ADR-0017](0017-cross-cutting-knowledge-tier.md),
  [ADR-0023](0023-library-cli-choose-your-own-adventure.md) (the library tier + CLI `library search`
  extends), [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md),
  [ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md) (the proof model the
  discussion proof mode extends), [ADR-0042](0042-hosted-studio-demo-cloud-run-iap.md),
  [ADR-0043](0043-app-owned-users-roles-and-ui-invitations.md) (members/roles/identity rails),
  [ADR-0037](0037-decision-binding-and-hygiene-gates.md) (the OQ→ADR lifecycle the ladder feeds).
- `packages/core/src/knowledge.ts` (the `open-question` artifact shape these OQs would take),
  `packages/store/src/pg-comment-store.ts` (the event+projection substrate threads would extend),
  `packages/core/src/proof.ts` (where a discussion `proofMode` would land),
  `packages/core/src/users.ts` (the identity/reputation fields Decision 6 leans on).
- Design conversation, 2026-06-14 (owner: novelty-not-persuasion; prose-vs-code dedup; recurrence as
  demand; threads-on-everything as the extraction mechanism; socio-technical slow-scaling gate).
