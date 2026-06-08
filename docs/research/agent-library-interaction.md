# Research: How agents interact with the knowledge Library

## Status

Research / options — **not** an implementation. Proposes a *Library interaction
protocol* (read / edit / curate / reference / staleness) and lists the decisions the owner
must make. Informs the Phase-2 migration of the corpus into the GCP Postgres store: each
section calls out the **store operations** the schema must support.

Builds on [ADR-0011](../decisions/0011-own-the-agent-loop-and-context-engineering.md)
(own the agent loop; pull-based just-in-time context),
[ADR-0013](../decisions/0013-structured-corpus-markdown-as-view.md) (structured corpus,
markdown as a generated view),
[ADR-0016](../decisions/0016-knowledge-code-binding-and-staleness.md) (binding + staleness),
and [ADR-0017](../decisions/0017-cross-cutting-knowledge-tier.md) (the cross-cutting tier).
It proposes mechanisms ADR-0017 **consciously deferred**: the citing / reciprocity mechanism
and the comments layer.

§6 reframes the Library as a **self-growing typed DAG / attention map** (ADRs as load-on-demand
justification records; downstream artifacts as the operative pull) and is informed by a verified
deep-research pass over terminology science (ISO 704, SKOS, OBO Foundry) and agentic
knowledge-graph engineering (iText2KG, Graphiti, provenance semirings); frameworks are cited in
§6's Sources block.

> **Decided since (2026-06-08):** the interaction *model* is settled in
> [ADR-0022](../decisions/0022-library-cli-choose-your-own-adventure.md) — agents reach the Library
> through an exploratory **choose-your-own-adventure CLI**, not a `pull` step. §1's pull/doctrine-floor
> read model is **superseded** by that ADR (context is *explored* via tooling, surface #2; the boot
> baseline is map-only). §2–§6 (edit/curation/references/staleness/DAG analysis) still stand as the
> options backing the ADR draws on.

## Date

2026-06-08

---

## 0. What exists today (the substrate this protocol runs on)

The protocol below is grounded in the current shapes, so it can migrate cleanly into Postgres.

- **Source of truth.** `apps/studio/data/knowledge.json` — an array of typed units,
  discriminated by `kind` ∈ {`definition`, `principle`, `pattern`, `guardrail`, `techstack`,
  `open-question`} plus `template`. Each unit carries `id`, `title`, `description` (one-line),
  `references: string[]` (`doc:<relpath>` / `asset:<id>` pointers), kind-specific body fields,
  optional glossary-projection metadata, and `createdAt` / `updatedAt`.
- **Schema + render are one table.** `packages/core/src/knowledge.ts` (`KIND_SPECS`) drives
  the zod union, the body renderer, and the blank-template generator
  ([knowledge-render.ts](../../packages/core/src/knowledge-render.ts)). One table, three
  consumers — they cannot drift.
- **Derived views.** [`build-corpus.mjs`](../../apps/studio/data/build-corpus.mjs) renders
  `assets.json` (the studio store) and `docs/glossary.md` from `knowledge.json`. Markdown is
  output, never input (ADR-0013).
- **Comments (human feedback).** `apps/studio/data/comments.json` — `{ id, topicKind, topicId,
  anchor, body, author, createdAt, resolved, resolvedAt }`. `topicKind` is currently always
  `asset`; `topicId` points at a unit id; `anchor` can pin to the whole topic, a heading, or a
  text span. **Resolution already exists as a boolean + timestamp** — the auto-retire trigger
  this doc designs only needs to *observe* it.
- **`open-question` is a live unit kind.** Five exist today (`oq-library-body-durability`,
  `oq-anti-pattern-lessons`, `oq-redundant-library-pairs`, `oq-thin-glossary-terms`,
  `oq-soft-recategorizations`), each with operator comments carrying the decision (e.g. "B,
  merge and retire"). They are owner decisions parked **in** the Library so they are decided in
  the studio, not over chat.

Three curation-discipline units are binding on everything below:
[`edit-first-curation`](../../apps/studio/data/knowledge.json) (edit is the default; authoring
a new unit is the justified exception; **search before you write**), `glossary-wins` (the
glossary is authoritative for terminology), and `verification-wins` (tests + on-disk evidence
override model recollection).

### The two roles an agent plays

Throughout, distinguish:

- **Reader agent** — a leaf/owned-loop node (ADR-0011) doing work. It *pulls* a slice of the
  Library into context. It should almost never write to the Library directly.
- **Curator agent** — an agent (or an agent-assisted owner) maintaining the Library itself:
  creating units, merging, retiring, fixing references. This is where writes concentrate, and
  where `edit-first-curation` + the approval gate bite.

Conflating the two is the main failure mode; keeping them separate is the spine of the
recommendation.

---

## 1. READ / PULL — assembling the relevant slice into context

ADR-0011 mandates *pull-based, just-in-time* context: the agent assembles the minimal relevant
slice per step, not a whole-corpus dump. The question is **how the slice is selected**.

### Option R1 — Pull by `kind`

Load all units of a kind (e.g. every `guardrail` + `principle`) as a fixed doctrine preamble.

- **+** Trivial; guardrails/principles are few and broadly relevant ("always-on" doctrine).
- **−** Ignores relevance; does not scale as the corpus grows; wastes budget on units that
  don't bear on this node. No connection to *what the node is doing*.

### Option R2 — Pull by the reference graph (`derives_from` / `consumes`)

Start from the work unit's `consumes` edges (ADR-0017: work units *consume* knowledge units),
then walk `derives_from` to pull upstream context transitively to a bounded depth.

- **+** Precise and explainable — every unit in the window is there because the work unit (or a
  unit it consumes) pointed at it. Matches ADR-0017's "derivation DAG." Naturally token-bounded
  by depth/fan-out.
- **−** Only as good as the edges. A node working in an area with no `consumes` edges yet gets
  nothing. Cold-start problem: edges have to exist first.

### Option R3 — Pull by query (semantic / keyword retrieval)

Embed or index unit bodies; retrieve top-k by similarity to the node's task/code context.

- **+** No edges required; handles cold-start and "I didn't know that unit existed." Good
  discovery.
- **−** Non-deterministic, hard to explain, can pull plausibly-related-but-wrong units. Needs an
  embedding/index pipeline (extra infra). Risk of context pollution.

### Option R4 — Layered: doctrine floor + graph walk + query top-up (recommended)

Assemble in three bands, each budget-capped, highest-precedence first:

1. **Doctrine floor (always-on).** A small, curated set of `guardrail` + high-level `principle`
   units that apply to *all* agent work (e.g. `edit-first-curation`, `verification-wins`,
   `fail-closed-on-dirty-tree`). Marked with an explicit `scope: global` flag so the floor is
   data-driven, not hard-coded. Cheap, bounded, and the doctrine that must never be missed.
2. **Graph band (relevance).** Walk `consumes` from the work unit, then `derives_from` upstream
   to a bounded depth. This is the primary relevance signal (R2).
3. **Query top-up (discovery).** If budget remains and the graph band is thin, retrieve top-k by
   query to surface units the edges missed (R3) — clearly labelled as "discovered, unverified"
   so the agent weights them below graph-linked units.

- **+** Combines determinism (bands 1–2) with discovery (band 3); degrades gracefully when edges
  are sparse; every unit carries *why it was pulled* (floor / linked / discovered), which the
  agent can use to weight it. Honors ADR-0011's budget discipline via per-band caps.
- **−** Most moving parts; band 3 needs an index. Mitigated by shipping bands 1–2 first and
  adding band 3 only when cold-start pain shows.

> **Recommendation: R4**, shipped incrementally — **bands 1–2 first** (no index dependency),
> band 3 (query) deferred until the graph proves too sparse. This lets Phase-2 land without an
> embedding pipeline on the critical path.

**Store operations this requires:**

- `get_unit(id)`, `get_units_by_kind(kind)`, `get_units_where(scope='global')` — cheap indexed
  reads (index on `kind` and on a `scope` field).
- `get_edges_from(id, type)` / `get_edges_to(id, type)` — traverse `consumes` / `derives_from`
  in both directions (see §4 for how edges are stored). Bounded-depth traversal happens in app
  code, not SQL recursion, to keep the budget cap in the agent layer.
- (Band 3, later) a similarity index over unit bodies — a separate concern, not a blocker.
- Every read must return the unit's **drift/freshness signal** alongside the body (§5), so the
  agent never consumes a stale unit without seeing it is stale.

---

## 2. EDIT — propose vs. directly make changes

`edit-first-curation` (edit over create; search before write) plus the owner-in-the-loop
discipline frame this: the question is **what an agent may write unattended vs. what must be
owner-approved**, and **how a proposal is represented** so it is reviewable in the studio.

### The auto vs. approval boundary (the core call)

Classify writes by reversibility and authority:

| Operation | Proposed gate | Why |
|---|---|---|
| Append a **comment** (agent feedback/question on a unit) | **Auto** | Additive, non-destructive, already the human-input plane. |
| Record a **described `change` event** for a binding (ADR-0016) | **Auto** | It is the *evidence trail*; suppressing it is the harm. Demotion handles noise. |
| Add a **reference edge** (`consumes` / `derives_from`) | **Auto, reciprocity auto-mirrored** | Additive; strengthens the graph; reversible (§4). |
| **Edit a unit body field** | **Proposal → owner approval** | Changes shared doctrine other agents read. |
| **Create a new unit** | **Proposal → owner approval** (must cite the `edit-first-curation` justification) | New authority; the exception, not the default. |
| **Retire / merge a unit** | **Proposal → owner approval** | Destructive to authority; needs review. *Exception:* open-question auto-retire (§3), which is itself owner-driven via the resolved comment. |
| **Edit a `guardrail`** | **Proposal → owner approval, always** | Guardrails are the hard boundaries; never auto. |

The principle: **agents propose changes to shared knowledge; the owner admits them** — the same
"human owns the outer loop" / approval-gated-trunk posture the work hierarchy already uses. Reads
and additive/audit writes flow freely; mutations to shared authority gate.

### Option E1 — Branch/PR-style proposals (git mental model)

An agent writes a proposed new version to a side location; the owner diffs and merges.

- **+** Familiar; clean diffs.
- **−** Re-imports the git-as-shared-state problem ADR-0017 explicitly rejected (git can't be the
  live shared layer across parallel sessions). Heavyweight for a one-field edit.

### Option E2 — Proposal as a first-class event/draft in the store (recommended)

An edit is a **`proposed-change` event** in the store: `{ unit_id, field, before, after, author,
rationale, status: pending|approved|rejected }`. The current projection keeps showing the live
unit; the studio renders pending proposals as an inline diff the owner approves/rejects. On
approval, the proposal applies (a normal versioned write); on rejection it is tombstoned with the
reason.

- **+** Fits ADR-0016/0017's event-sourced model exactly (history = events, current = projection).
  Works across parallel sessions. Reviewable in the studio where comments already live. The
  rationale field operationalizes `edit-first-curation`'s "state what you searched and why a new
  unit was needed."
- **−** Needs a proposal event type + an approval UI. (But the comments layer already proves the
  pattern: anchored items the owner acts on.)

### Option E3 — Direct write with post-hoc review

Agents write live; the owner reviews the changelog after.

- **+** Lowest friction.
- **−** Violates owner-in-the-loop for shared doctrine; a wrong edit pollutes every reader's
  context until caught. Acceptable only for the **auto** rows above, never for body/guardrail
  edits.

> **Recommendation: E2** for all gated mutations; **E3 (direct)** only for the **auto** rows.
> The dividing line is the table above, encoded as data (per-kind / per-operation policy), not
> scattered through code.

**Store operations this requires:**

- A **proposal/change event type** with `status` and `rationale`, queryable as "pending proposals
  for unit X" and "all pending proposals" (the owner's review queue).
- `approve_proposal(id)` / `reject_proposal(id, reason)` — apply or tombstone; both append events
  (nothing is silently dropped, per ADR-0016).
- Append-comment is already a write the schema must carry (the comments layer, §3).
- A **policy lookup** ("is operation O on kind K auto or gated?") — store as data so the gate is
  auditable and changeable without a deploy.

---

## 3. CURATION LIFECYCLE — create, the open-question auto-retire, merge/retire

### 3a. Creating units

Per `edit-first-curation`: creation is the **justified exception**. The flow:

1. Curator agent **searches** the Library (R4 read path) for the closest existing unit.
2. If an edit fits → propose an edit (§2, E2), done.
3. If genuinely new → file a **create proposal** that *must* carry the justification fields:
   `search_terms_run`, `closest_existing_unit`, `why_not_edit`. The owner approves.
4. On approval the unit is written with `createdAt`/`updatedAt`, validated against the zod schema
   at the write boundary (ADR-0017: zod-validated JSONB).

The justification fields make the discipline **enforced, not hoped-for** — a create proposal
without them is rejected by validation.

### 3b. The open-question create → comment → resolve → **auto-retire** flow

This is the owner's explicit ask: when an open-question's comment(s) are resolved, the
open-question unit retires **automatically** — no manual step.

**Lifecycle:**

```
create oq-unit (kind: open-question)
   → owner/agent comments accumulate (the decision discussion)
   → owner marks the decision comment(s) resolved   ← the trigger
   → [auto] oq-unit transitions to retired (tombstoned)
   → [auto] the decision is captured forward (see "capture-forward" below)
```

**Designing the resolve → retire trigger** — three options:

- **T1 — Eager trigger on comment resolve.** When a comment's `resolved` flips to `true`, a
  handler checks: is the topic an `open-question` unit, and are **all** its open-question-bearing
  comments now resolved? If yes, retire the unit. *In the event-sourced store this is a
  projection/handler on the `comment-resolved` event* — clean and immediate.
- **T2 — Lazy/derived status.** Never store the open-question's retired state; *compute* it:
  an open-question is "retired" iff all its comments are resolved. Simplest data model, but the
  retirement isn't an event (no clean audit point, no place to attach capture-forward), and it
  fights the tombstone model in §3c.
- **T3 — Explicit owner confirm.** Resolving the comment surfaces a "retire this question?"
  prompt. Safest, but it is the manual step the owner explicitly wants gone.

> **Recommendation: T1** (eager, event-driven). It is the only one that is both automatic (the
> owner's requirement) **and** produces a clean retire event to hang history + capture-forward on.

**Two sub-decisions T1 forces (for the owner, §6):**

- **"All comments" vs "the decision comment."** An open-question may collect chatter plus one
  decisive comment ("B, merge and retire"). Require **all** comments resolved (simple, but a
  stray unresolved aside blocks retirement), or let a comment be flagged `decision: true` so
  resolving *that one* retires the unit. **Recommend: all-resolved by default**, with an optional
  `decision` flag as the override — matches how the current five OQs actually read (one operator
  comment each).
- **Capture-forward (don't lose the answer).** A retired open-question's *answer* is valuable —
  it should not vanish into a tombstone. On retire, the resolved decision should be **captured
  forward**: minimally, the retire event records the resolving comment(s) as the decision; better,
  the trigger *prompts/drafts* a successor artifact (a new `principle`/`guardrail`, an ADR stub,
  or an edit to an existing unit) as a **proposal** (§2). The open-question's `references` and any
  `consumes` edges pointing at it are repointed to the successor. **Recommend:** retire event
  always records the decision; **drafting the successor is a proposal, not automatic** (it is a
  knowledge edit → gated). This keeps "auto-retire" truly automatic while keeping new doctrine
  owner-approved.

### 3c. Merge / retire of redundant units

(`oq-redundant-library-pairs` → operator already said "B, merge and retire" — so this path is
needed imminently.)

- **Merge** = pick the surviving unit, fold the other's unique content in (as a proposed edit),
  then **retire** the redundant one with a `merged_into: <survivor-id>` pointer. All inbound
  edges (`consumes`/`derives_from`) and `references` to the retired unit are **repointed** to the
  survivor (an automatic, additive rewrite — see §4 reciprocity).
- **Retire** = tombstone, never hard-delete (next).

### 3d. How retirement works — tombstone vs delete

ADR-0016/0017 are explicit: **current state is a projection; history is events; nothing
meaningful silently vanishes** ("demoted, not deleted").

- **Tombstone (recommended).** Retiring writes a `retired` event; the projection marks the unit
  `status: retired` (with `retired_reason`, optional `merged_into`/`superseded_by`). It drops out
  of read assembly (§1) and the glossary view, but the unit + its full history remain queryable
  (`as-of` / audit). Inbound edges are repointed or marked dangling-to-tombstone, never left
  pointing at nothing.
- **Hard delete** is rejected — it severs the evidence chain `verification-wins` and ADR-0016
  depend on, and `build-corpus.mjs` already treats "absent from source ⇒ dropped from derived
  views," which gives the *view* removal for free without destroying *history*.

**Store operations this requires:**

- `retire_unit(id, {reason, merged_into?, superseded_by?})` → appends a `retired` event, updates
  the projection's `status`. Idempotent.
- A `comment-resolved` event handler that evaluates the open-question retire predicate (T1).
- The projection's read path **filters `status: retired`** by default but supports
  `include_retired` for audit / `as-of` queries (ADR-0016 bitemporal).
- Edge-repoint operation used by merge and by capture-forward.
- A unit `status` field (`active` | `retired`) on the projection — the membership predicate the
  derived views (assets/glossary) already implicitly want.

---

## 4. REFERENCES / RECIPROCITY — recording and keeping edges mutual

ADR-0017 defers *how* `derives_from` / `consumes` are recorded and kept mutual. Two structural
choices, then the reciprocity mechanism.

### Where edges live

- **E-graph A — Edges embedded in the document** (today's `references: string[]`, extended).
  ADR-0017 says relationships are "ID references inside the documents... never relational FK
  constraints." Embedding `derives_from`/`consumes` as typed arrays on the unit matches that.
  - **+** One read gets the unit and its outbound edges; matches stated ADR direction; no join.
  - **−** Inbound edges ("who consumes me?") require scanning all units unless an index/projection
    is maintained; mutual consistency is the app's job.
- **E-graph B — Edges as first-class event-sourced records** `{ from, to, type, created_at,
  status }`, projected into a graph.
  - **+** Inbound and outbound are symmetric queries; edges get their own history (added/removed
    is an event — matches the audit posture); reciprocity is a projection invariant.
  - **−** A second entity to model; the unit doc no longer self-describes its edges in one blob.

> **Recommendation:** **store edges as embedded typed references on the unit (E-graph A) as the
> source of truth** (honoring ADR-0017 literally), **and maintain a derived edge/back-edge
> projection (E-graph B's read side)** for "who points at me." Source = embedded; the inverse
> index = derived. This is the same source-vs-derived split ADR-0013 uses everywhere.

Concretely, replace the flat `references: string[]` with typed edges (keeping `references` for
external `doc:`/`asset:` pointers): `derives_from: id[]`, `consumes: id[]` (on work units),
`supersedes` / `merged_into` (lifecycle, §3).

### Keeping edges mutual (the reciprocity mechanism ADR-0017 deferred)

The relationships are directional but a reader needs both directions ("what does this derive
from?" *and* "what derives from this?"). Options for keeping them coherent:

- **C1 — Auto-mirror on write.** Writing `A derives_from B` automatically maintains the inverse
  `B derived_by A` in the back-edge projection. The author records one direction; the system
  guarantees the other. **Reciprocity is a projection invariant, not a second manual edit.**
- **C2 — Validate-only (no mirror).** Store one direction; a CI/typecheck pass *asserts* every
  edge resolves to an existing, non-retired unit and flags dangling edges (the way
  `assertGlossaryMembership` already guards the glossary). Cheaper but read-time "who points at
  me" still needs a scan.
- **C3 — Require both ends authored.** Reject an edge unless both units name each other. Strong
  consistency, high friction — and impossible for `consumes` where the consumed unit shouldn't
  have to know its consumers.

> **Recommendation: C1 (auto-mirror) + C2's validation as a guard.** The forward edge is the
> single source authored by the curator; the inverse is a maintained projection (C1); a
> validation pass (C2) fails closed on dangling/retired targets. `consumes` is inherently
> one-authored (the work unit declares it; the knowledge unit gains a derived `consumed_by`), so
> C3 is wrong for it. Adding/removing an edge is one of the **auto** writes (§2) since it is
> additive and reversible.

**Store operations this requires:**

- Embedded typed edge arrays on the unit (write boundary validates targets exist + are active).
- A **back-edge projection** (`inverse_edges(to_id, type)`) rebuilt on edge events — answers
  "who derives_from / consumes me" without a scan.
- A **referential-integrity guard** (run in CI / on write): every edge target resolves to a
  non-retired unit, or is explicitly a tombstone pointer. Mirrors today's glossary-membership
  assertion.
- Edge add/remove as events (so the graph has history, per ADR-0016).

---

## 5. STALENESS — how agents see and act on drift / freshness

ADR-0016 defines two signals; this section is about **surfacing** them to agents and **what the
agent does** with them. No new model is invented here — it operationalizes ADR-0016.

**The two signals (ADR-0016):**

- **Code-drift** — a unit bound to a code span (via the versioned, re-anchorable anchor) where
  `current_hash != last_described_hash`. Computed compare-on-read.
- **Source-drift + freshness** — a unit with no code anchor (most `principle`/`guardrail`) whose
  source ADR or upstream `derives_from` unit changed, plus a g3doc-style freshness age
  (owner + reviewed-date).

### How agents see it (recommended)

**Every Library read returns the drift signal inline with the body** — never as a separate
lookup an agent might skip. A pulled unit arrives as `{ unit, drift: { state: fresh | code-drift
| source-drift | stale-by-age, description?, changed_at?, source? } }`. Crucially (ADR-0016 §3)
drift is **explanatory**: it carries the human/agent *description of what changed*, so a
token-budgeted reader decides relevance **without re-deriving**.

This makes staleness a first-class field of the read protocol (§1), closing the loop: the read
path and the staleness signal are the same call.

### What agents do with it

- **Reader agent.** Treats a drifted unit as **lower-confidence context**: it may still use it,
  but it sees the drift description and weights accordingly, and (auto write, §2) may append a
  `change` event or a comment noting the unit needs review. It does **not** silently trust a
  drifted unit (`verification-wins`: evidence over stale recollection).
- **Curator agent / owner.** Drift surfaces in the studio as a review queue ("units whose source
  ADR changed"); resolving it is a **described change** (ADR-0016) that advances
  `last_described_hash` — i.e. a normal gated edit (§2) that clears the flag.

**Drift is lazy/compare-on-read** (ADR-0016 §3) — no eager propagation pipeline in Phase 2; the
read path computes it. Eager CDC is a deferred seam.

**Store operations this requires:**

- Units carry the ADR-0016 **anchor** (`file`, optional `symbol`/AST path, `content_hash`,
  text-quote fallback, `bound_commit` + `bound_hash`) where code-bound; freshness fields
  (`reviewed_at`, `owner`) where not.
- A **`change` event type** `{ hash_before, hash_after, description, author }` (ADR-0016) —
  described changes advance the binding; undescribed ones are **demoted** (filtered from reads
  but kept + auditable).
- Compare-on-read drift computation: the read API joins the unit's `bound_hash` against the
  current span hash and returns the diff + latest description.
- `derives_from` traversal (§4) to compute **source-drift** downstream when an ADR/unit changes.
- Bitemporal `as-of` query support (ADR-0016 §5) so "what did we know, bound to which code, when"
  is answerable.

---

## 6. The self-growing knowledge DAG (the attention-map model)

The four sections above treat the Library as a set of typed units an agent reads and edits.
This section reframes it as the owner asked: a **self-growing, typed DAG** that mirrors the story
tree's role. The story tree is a map that tells an agent *which slice of the codebase* to load;
the knowledge DAG is **a map of the inputs** — which slice of the *doctrine* to load — and, like
the story tree, its whole purpose is to keep an agent's context window focused on only what is
needed.

This section incorporates a verified deep-research pass over terminology science (ISO 704, SKOS,
OBO Foundry / Relations Ontology) and agentic knowledge-graph engineering (iText2KG, Graphiti,
provenance-semiring / HUKA). Frameworks are cited inline; sources are listed at the end of the
section. The headline finding: **the well-formedness rules already exist as mature standards** —
storytree's job is to pick which become hard guardrails and which stay agent judgment.

### 6.1 Two planes, asymmetric attention (ADRs are justification records, not context)

The decisive reframe (owner): **the operative layer is the downstream artifacts** — definitions,
principles, patterns, guardrails. Those are what an agent pulls by default to do work. **ADRs are
not in the default window at all.** They are *justification records* — the "why we landed here" —
held in cold storage and loaded **on demand**, only when an agent must trace provenance (a
conflict, or confusion about how a rule came to be).

The compiled-code analogy is exact: the principles/patterns are the **running program**; the ADRs
are the **source map** you load only when debugging. This makes the vertical `derives_from` edges
a *debug path*, not a normal pull path (refines §1: ADRs are a separate, conflict-triggered read
band, never the doctrine floor).

This separation has direct standards backing. ISO 704:2022 grounds a terminology system in a
**four-part ontology — objects, concepts, definitions, designations** — connected by *concept
relations* into a *concept system* [ISO 704 §5.6]. storytree's mapping: ADRs are the recorded
*reasoning* (the objects/events that gave rise to concepts); the knowledge units are the
*concepts + definitions + designations*; the edges are the *concept relations*. ADRs root the
concept system without being part of the operative vocabulary.

### 6.2 The edge taxonomy (grounded, not invented)

Three edge families, each with a standards analog and a distinct legality rule:

| Edge | Direction | Meaning | Standards analog |
|---|---|---|---|
| **`derives_from`** | artifact → ADR (or → upstream artifact) | provenance / justification ("rests on this reasoning") | ISO 704 *concept relation*; the derivation/lineage DAG (Graphiti, provenance semirings) |
| **`consumes`** | higher-order artifact → more-atomic artifact (principle → definition) | abstraction / DRY composition ("is built out of") | SKOS **hierarchical** `broader`; OBO **reusable relational pattern** |
| **`supersedes` / `merged_into`** | new → retired | lifecycle (§3) | Graphiti **bi-temporal invalidation** (invalidate, not delete) |

The research confirms your instinct that **`derives_from` and `consumes` are genuinely different
edge types and must not collapse**. SKOS formalizes exactly this split — hierarchical
(`broader`/`narrower`) vs. associative (`related`) — and imposes integrity condition **S27: the
same pair cannot carry both** [W3C SKOS Reference]. That is the cleanest possible justification
for keeping provenance edges and abstraction edges disjoint, and it is a deterministic check (a
build-time/zod guardrail — §6.4).

**The abstraction edge is the DRY mechanism you described.** Modeling "a principle consumes
definitions" as a *reusable relational pattern* — define the edge type's meaning once, instantiate
it per pair — is precisely the OBO/OWL "relations as patterns" approach [Hoehndorf et al., BMC
Bioinformatics 2010]. It warns against a naive shortcut (mapping every typed edge to an
existential restriction misrepresents semantics), which matters if storytree ever reasons over the
graph rather than just traversing it. For now the lesson is: **each edge type is a first-class,
named, reused relation — not an ad-hoc per-unit field.**

### 6.3 The growth loop (how the DAG grows, and when it stops)

The cycle you drew — `human/agent input → ADR → open-question → human input → ADR → artifacts` —
is the **growth engine**, with `open-question` (§3b) as the in-loop staging node:

```
input ─▶ ADR (root, justification)
            │ derives_from
            ▼
   open-question?  ──comment/resolve──▶  ADR amend / new artifact   (the §3b auto-retire loop)
            │
            ▼  derives_from
   definition / principle / pattern / guardrail        ◀── operative layer (default pull)
            │ consumes (abstraction / DRY)
            ▼
   more-atomic definition                              ◀── a definition is a consumes-SINK
```

**Anchoring a new node — the ISO 704 rule.** When the loop spawns a downstream artifact, ISO 704
prescribes the **intensional (genus-differentia) definition** as the preferred form: state the
*immediate superordinate concept* + the *delimiting characteristic(s)* — and it is explicitly a
**"should … whenever possible," not a "must"** [ISO 704 §3.3]. This is the concrete rule for
*how* a node attaches to the DAG: **every new artifact names its genus (a `derives_from`/`consumes`
parent) plus what distinguishes it.** A node that cannot name a parent is a smell — either it is a
new root (an ADR), or the agent hasn't searched hard enough (`edit-first-curation`). Because ISO
itself frames this as a "should," it lands as **guidance with a checkable test**, not a hard gate.

**When does growth stop?** A branch terminates when it bottoms out in atomic definitions (a
`consumes`-sink) and roots in ADRs (a `derives_from`-source). The loop halts when no
open-question remains and every operative artifact traces to ≥1 ADR.

### 6.4 Growth rules: the guardrail vs. guidance line

The research gives a sharp dividing principle: **if a closed algorithm can decide it, make it a
hard guardrail; if it needs meaning-judgment, make it agent guidance with a checkable test
attached.** Applied:

**HARD guardrails (deterministic; enforced in zod / at the write boundary / in CI):**

- **Acyclicity.** Neither SKOS nor OWL gives this for free — SKOS *deliberately* permits cyclic
  `broader` and tells the application to compute the transitive closure and reject reflexive
  statements itself [W3C SKOS Reference, Example 37]. So storytree **must** own a
  transitive-closure cycle check. Cheap form: an **abstraction-rank per kind** (definition = 0;
  principle/pattern/guardrail = 1; techstack = 0–1) where `consumes` may only point from higher
  rank to **strictly lower** rank — making a definition a structural `consumes`-sink and killing
  abstraction cycles by construction, no closure needed. Backstop: a global transitive-closure
  check across `consumes` + `derives_from` for the rarer cross-cut case (this answers the
  research's open question on the acyclicity boundary — **check per-edge-type with kind-rank as
  the fast guard, plus a global closure backstop**).
- **Edge-type disjointness** (SKOS S27): a given pair may not carry both `derives_from` and
  `consumes`. Deterministic.
- **Edge-type reuse / subsumption** (OBO Foundry Principle 7): the edge **vocabulary is a fixed,
  small registry** — an agent reuses an existing edge type, never mints a synonym; a genuinely new
  edge must be declared a sub-type of an existing one. OBO enforces this deterministically on exact
  label match. storytree's registry is tiny (§6.6), so this is fully enforceable.
- **ADR-rootedness:** every non-ADR artifact must have ≥1 `derives_from` path to an ADR (no
  orphaned doctrine).
- **Exact-match reuse:** an extracted concept that exactly matches an existing unit reuses it — the
  deterministic spine of dedup [iText2KG]. *(Note: non-redundancy beyond exact-match is **not** a
  guaranteed invariant — see the refuted claim below — so the graph is "non-redundant by procedure,"
  never "non-redundant by construction.")*

**SOFT guidance (meaning-judgment; agent decides, with a checkable test):**

- **Genus-differentia anchoring** (ISO 704 "should," §6.3): name a parent + differentia; agent
  judges what the right genus is.
- **The substitution principle** (ISO 704 §6.4.4): a valid definition can replace its term in
  running text without changing meaning — this *reveals* circularity and redundancy [ISO 704
  §6.5.2]. It is a **test the agent runs**, not a complete decision procedure — so it is the
  checkable companion to the hard cycle check, catching *semantic* circularity the structural
  check can't see.
- **Create-vs-reuse for meaning** (the dedup judgment): the deterministic exact-match/embedding
  step [iText2KG, default cosine 0.7] handles surface duplicates; **semantic** identity ("are
  these two principles the same rule?") needs LLM reasoning [KGGEN clustering, EntGPT
  candidate-then-reason, LLM-Align]. This is `edit-first-curation` operationalized: deterministic
  filter first, agent judgment second, owner approval to commit a merge (§3c).
- **When a new term is warranted at all** — the irreducible judgment ISO 704 leaves to the
  terminologist; here, gated by the create-proposal justification fields (§3a).

The schema-based vs. schema-free framing in the agentic-KG literature is a **continuum, not a
binary** (verified at medium confidence) — so this is not "lock everything down." It is: lock the
*structural* invariants, leave the *semantic* ones to judgment with tests attached.

### 6.5 The conflict-resolution / adjudication loop (the killer use of the structure)

This is the owner's sharpest use of the DAG, and it is *why* the `derives_from` edges earn their
keep even though they're off the default pull path:

1. An agent hits two operative artifacts that **conflict** (e.g. two principles pulling opposite
   ways).
2. It **traces `derives_from` upward** to the ADR roots of each — the one time ADRs enter the
   window. The provenance literature says capture the **full trajectory**, not just the final
   citations [trajectory-level provenance, arXiv 2605.15109]: the adjudication payload is the
   **minimal sub-DAG between the two artifacts and their roots**, not two isolated ADRs.
3. It **diagnoses**, and the primary self-resolution lever is **staleness (ADR-0016 source-drift)**:
   if one principle is downstream of a **superseded** ADR, the conflict half-dissolves — "this
   principle rests on reasoning we've since reversed." Graphiti's **invalidate-not-delete**
   bi-temporal model is exactly right here: a superseded ADR is *invalidated with a validity
   window*, never deleted, so the trace can still show *what we used to think and when it stopped
   being true*.
4. If it can **self-resolve** → it proceeds, and *proposes* (gated, §2) retiring or repointing the
   stale principle.
5. If it **cannot** → it does not guess. It assembles the full traced sub-DAG (both artifacts,
   their root ADRs, the supersession/drift state, the path between them) and **hands that complete
   provenance story to the human to adjudicate.** The human gets a decision with full context, not
   a context-free question.

This is the **human-owns-the-outer-loop** principle expressed through the graph, and it is the
mechanism behind ADR-0016's "agents-in-between." (Formally this is *defeasible / non-monotonic
reasoning* — conclusions retractable when their grounds are withdrawn; storytree implements a
lightweight, provenance-traced version rather than a full argumentation engine.) The DAG's job is
to make the **minimal complete case for adjudication assemblable on demand.**

### 6.6 What this asks of the store (Phase-2 inputs, additive to §1–5)

- A **typed-edge registry** — a small fixed vocabulary (`derives_from`, `consumes`, `supersedes`,
  `merged_into`, plus external `references`) with an **abstraction-rank per kind**, so the disjointness,
  rank-ordering, and reuse-or-subsume guardrails are data-driven (storytree's miniature Relations
  Ontology — answering the research's "how to bootstrap a canonical edge registry" open question).
- A **cycle-check** (kind-rank fast path + global transitive-closure backstop) run at the write
  boundary / in CI — the guardrail SKOS proves you must own yourself.
- **Bi-temporal lineage** on every edge (valid-from / valid-to), so supersession invalidates
  rather than deletes (Graphiti model; already aligned with ADR-0016 §5 bitemporal history).
- **Incremental derivation propagation:** when an ADR or upstream artifact changes, recompute
  downstream drift *incrementally*, not by full rebuild — the provenance-semiring / HUKA result
  shows derivation lineage can be maintained under inserts/deletes ~50× faster than recompute.
  This is the engine behind ADR-0016 source-drift at graph scale. **Open sub-decision:** which
  downstream artifacts **auto-invalidate** vs. **flag-for-review** on an upstream change (the
  research flags this as unresolved; recommend *flag-for-review by default*, auto-invalidate only
  on an explicit supersede).
- A **provenance-trace read op** — `trace(unitA, unitB) → minimal sub-DAG` — that powers the §6.5
  adjudication payload. This is a distinct, conflict-triggered access path from the §1 default pull.

### 6.7 What the research refuted / cautioned

- **Refuted (1–2):** that an agentic KG enforces non-redundancy as a *hard graph invariant*.
  iText2KG dedups by **procedure** (exact-match + threshold), not by guaranteed invariant. So
  storytree must treat "no redundant units" as something the curator loop *works toward*, not
  something the schema guarantees — which is exactly why merge/retire (§3c) is an ongoing curation
  operation, not a one-time constraint.
- **Caution:** Graphiti's lineage is **single-hop** (fact → source episode) and HUKA's is
  query-level — neither ships the **multi-level** `ADR → principle → consumes-definition` chain
  storytree wants. The pieces (bi-temporal invalidation, incremental provenance maintenance) are
  proven; **the multi-level typed-derivation chain itself is the thing storytree must build.**
- **Caution:** SKOS/ISO integrity conditions are **validator-time, not self-enforcing** — for a
  zod-validated single-operator store they become **guardrails the operator implements**, which is
  precisely the layer this protocol specifies.

### Sources (this section)

- **ISO 704:2022** *Terminology work — Principles and methods* (concept system §5.6; intensional
  definition §3.3; substitution principle §6.4.4; circular definitions §6.5.2) —
  iso.org/standard/79077, en.wikipedia.org/wiki/ISO_704.
- **W3C SKOS** Reference + Primer (hierarchical vs associative; S27 disjointness; non-enforced
  acyclicity, Example 37) — w3.org/TR/skos-reference, w3.org/TR/skos-primer.
- **OBO Foundry Principle 7 / Relations Ontology** (reuse-or-subsume edge types) —
  obofoundry.org/principles/fp-007-relations.
- **Hoehndorf et al.**, "Relations as patterns: bridging OBO and OWL," *BMC Bioinformatics* 2010
  (PMC2942855) — reusable relational-pattern definitions.
- **iText2KG** (arXiv 2409.03284) — deterministic exact-match + cosine-threshold (0.7) entity reuse.
- **Survey of LLM-driven KG construction** (arXiv 2510.20345) — schema-based vs schema-free
  continuum; reasoning-based entity resolution (KGGEN, EntGPT, LLM-Align).
- **Graphiti / Zep** (github.com/getzep/graphiti; arXiv 2501.13956) — incremental, bi-temporal
  invalidate-not-delete, fact-to-source provenance.
- **HUKA / provenance semirings** (arXiv 2007.14864; Green et al., PODS 2007) — incremental
  derivation-DAG maintenance under insert/delete.
- **Trajectory-level provenance** (arXiv 2605.15109) — capture the full dependency path, not just
  citations.

---

## 7. Recommendation summary

A single coherent protocol:

1. **READ (R4):** layered pull — always-on doctrine floor + `consumes`/`derives_from` graph walk
   + (later) query top-up — each band budget-capped; every pulled unit carries *why it was
   pulled* and its drift signal. Ship bands 1–2 first (no index dependency).
2. **EDIT (E2):** agents **propose** mutations to shared knowledge as `proposed-change` events the
   owner approves in the studio; only additive/audit writes (comments, change-events, edges) are
   **auto**. The auto-vs-gated line is **data**, not code.
3. **CURATION (T1):** creation requires `edit-first-curation` justification fields enforced by
   validation; the open-question **auto-retires on comment-resolve** via an event-driven trigger
   that records the decision forward and *drafts* (but does not auto-apply) any successor doctrine;
   retirement is **tombstone + events**, never hard delete; merge repoints inbound edges to the
   survivor.
4. **REFERENCES (C1):** typed edges (`derives_from`/`consumes`) embedded on the unit as source of
   truth (per ADR-0017), with an **auto-mirrored back-edge projection** for the inverse direction
   and a referential-integrity guard that fails closed on dangling/retired targets.
5. **STALENESS:** ADR-0016's code-drift / source-drift signals are returned **inline on every
   read**, explanatory (carry the change description), computed lazily compare-on-read; readers
   down-weight drifted units, curators clear them via described changes.
6. **DAG MODEL (§6):** the Library is a self-growing typed DAG and an **attention map** — operative
   artifacts (definition/principle/pattern/guardrail) are the default pull; **ADRs are
   justification records loaded on demand**, only to trace provenance. Two disjoint edge families
   (`derives_from` = provenance/up; `consumes` = abstraction/DRY/down), grown under
   standards-backed rules: **hard guardrails** for what an algorithm can decide (acyclicity via
   kind-rank + closure, edge-type disjointness [SKOS S27], edge-vocabulary reuse [OBO P7],
   ADR-rootedness, exact-match dedup); **soft guidance** for meaning-judgment (genus-differentia
   anchoring [ISO 704], substitution-principle circularity test, semantic create-vs-reuse). The
   **conflict→trace-up→self-resolve-or-escalate** loop is the payoff: source-drift dissolves most
   conflicts; the rest escalate to the human as a minimal traced sub-DAG.

### What this means for the Postgres schema (Phase-2 inputs)

The store must support, at minimum:

- **Units** as zod-validated JSONB with a `status` (`active`/`retired`) projection field, `kind`,
  a `scope` flag (for the doctrine floor), the ADR-0016 anchor/freshness fields, and timestamps.
  Indexes on `kind`, `scope`, `status`.
- **Edges** — embedded typed arrays on the unit (source) **plus** a derived back-edge projection;
  add/remove as events; an integrity guard.
- **Events** — `proposed-change` (with `status` + `rationale`), `approved`/`rejected`, `retired`
  (with `reason`/`merged_into`/`superseded_by`), `change` (ADR-0016 described-change, with
  demotion), `comment-added`, `comment-resolved`. History is the event log; current state is the
  projection (ADR-0016/0017).
- **Comments** as first-class rows (`topicKind`, `topicId`, `anchor`, `resolved`, `resolvedAt`,
  optional `decision` flag) — promoted from the deferred git file into the store (ADR-0017's
  unification), with the **`comment-resolved` → open-question-retire** handler.
- **Bitemporal `as-of`** read support (ADR-0016 §5).
- A **policy table** for the auto-vs-gated edit matrix (§2) so the approval gate is data-driven.
- A **typed-edge registry** with abstraction-rank per kind (§6.6), a **cycle-check** (kind-rank +
  closure) at the write boundary, **bi-temporal edge lineage**, an **incremental
  derivation-propagation** pass for source-drift, and a **`trace(a,b) → sub-DAG`** read op for the
  conflict/adjudication loop (§6.5).

---

## 8. Open decisions for the owner

These are the calls this research surfaces but does not make. Recommend parking each as an
`open-question` unit in the Library (dogfooding §3b).

1. **Read assembly — ship band 3 (query/embedding) now or defer?** Recommendation defers it until
   graph sparsity proves painful. Confirm, or commit to an index pipeline in Phase 2.
2. **Doctrine floor membership.** Which exact units are `scope: global` always-on? (Proposed seed:
   `edit-first-curation`, `verification-wins`, `glossary-wins`, `fail-closed-on-dirty-tree`.) And
   is `scope` the right mechanism vs. a tag?
3. **Auto-vs-gated matrix (§2).** Confirm the table — especially: are **reference-edge adds** truly
   auto, and is **any** body edit ever auto (e.g. typo fixes), or always gated?
4. **Open-question retire trigger (§3b): "all comments resolved" vs a `decision`-flagged comment.**
   Recommendation: all-resolved default + optional `decision` override. Confirm.
5. **Capture-forward on retire.** Should auto-retire *draft a successor* doctrine unit/ADR as a
   proposal, or only record the resolved decision on the retire event and leave authoring fully
   manual? Recommendation: record always, draft-as-proposal optional.
6. **Edge source of truth (§4): embedded-on-unit (per ADR-0017 literal) vs first-class edge
   records.** Recommendation: embedded source + derived back-edge projection. Confirm the literal
   ADR-0017 reading still holds, or promote edges to first-class.
7. **Reciprocity enforcement (§4): auto-mirror (C1) vs validate-only (C2).** Recommendation: C1 +
   C2 guard. Confirm.
8. **Retirement = tombstone (no hard delete) — confirm** the audit/history cost is acceptable for
   *every* knowledge unit, including trivially-wrong created units.
9. **Tier name & comments layer (ADR-0017 deferred).** This protocol assumes the working name
   "knowledge" and promotes comments into the store. Both are still ADR-0017-open; settling them
   is a prerequisite to writing the migration.
10. **Reader vs curator as separate agent roles/permissions** — should the store enforce that a
    leaf reader agent *cannot* issue gated writes at all (capability separation), or is the
    proposal gate sufficient?
11. **Edge vocabulary (§6.2/6.6).** Confirm the minimal registry — `derives_from`, `consumes`,
    `supersedes`, `merged_into`, external `references` — and whether any further edge type is
    warranted now (e.g. `contradicts` to make conflicts first-class rather than agent-detected).
12. **Acyclicity boundary (§6.4).** Confirm: `consumes` constrained by **abstraction-rank per kind**
    (definition = consumes-sink), plus a global transitive-closure backstop — vs. a single global
    closure check across both edge types. Recommendation: kind-rank fast path + closure backstop.
13. **Guardrail vs guidance split (§6.4).** Confirm which rules are **hard** (acyclicity, S27
    disjointness, OBO-style edge reuse, ADR-rootedness, exact-match dedup) vs **soft**
    (genus-differentia anchoring, substitution-circularity test, semantic create-vs-reuse). This is
    the central call of the DAG model.
14. **Propagation policy (§6.6).** On an upstream ADR/artifact change, which downstream artifacts
    **auto-invalidate** vs **flag-for-review**? Recommendation: flag-for-review by default,
    auto-invalidate only on explicit supersede.
15. **Conflict handling (§6.5).** Are conflicts **agent-detected at pull time** (no stored edge), or
    should a `contradicts` edge be recorded when found so the next agent inherits the flag?
    Recommendation: detect-at-pull first; promote to a stored edge only if detection proves costly.

---

## References

- [ADR-0011](../decisions/0011-own-the-agent-loop-and-context-engineering.md) (own the loop;
  pull-based context), [ADR-0013](../decisions/0013-structured-corpus-markdown-as-view.md)
  (structured corpus / markdown as view),
  [ADR-0016](../decisions/0016-knowledge-code-binding-and-staleness.md) (binding + staleness),
  [ADR-0017](../decisions/0017-cross-cutting-knowledge-tier.md) (the tier; defers citing/reciprocity
  + comments).
- [`pull-based-context-architecture`](../guidelines/pull-based-context-architecture.md).
- Source shapes: [`knowledge.ts`](../../packages/core/src/knowledge.ts),
  [`knowledge-render.ts`](../../packages/core/src/knowledge-render.ts),
  [`build-corpus.mjs`](../../apps/studio/data/build-corpus.mjs),
  `apps/studio/data/{knowledge,comments}.json`.
- Curation units: `edit-first-curation`, `glossary-wins`, `verification-wins` (in `knowledge.json`).
- Live open-questions: `oq-library-body-durability`, `oq-redundant-library-pairs`,
  `oq-thin-glossary-terms`, `oq-anti-pattern-lessons`, `oq-soft-recategorizations`.
