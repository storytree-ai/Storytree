---
status: accepted
decided: 2026-06-15
amends: [6, 13]
---

# ADR-0016: Knowledge↔code binding & staleness model

## Status

accepted (2026-06-15) — proposed 2026-06-07, accepted with its open forks pinned 2026-06-15 after
an owner decision on binding grain and three focused best-practice research sweeps (drift driver,
hash model, re-location fallback). Informed by
[`knowledge-code-binding-and-staleness`](../research/knowledge-code-binding-and-staleness.md) (the
original survey) plus the 2026-06-15 fork research summarised below.

**Amends [ADR-0013](0013-structured-corpus-markdown-as-view.md)** (retires the contract `covers =
{file, lines}` field it made validatable, replacing it with the re-anchorable `Anchor`) and
**amends [ADR-0006](0006-event-store-observability-surface.md)** (adds the `change` event to the
event vocabulary, partially answering its §8 open question for change events). Refines neither's
core decision — the event store and the structured-corpus-as-view both stand. Prerequisite for
[ADR-0017](0017-cross-cutting-knowledge-tier.md) (the knowledge tier). The verdict-ageing work
[ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md) §7 deferred lands here,
and the per-test grain it ages is [ADR-0044](0044-per-uat-test-human-attestation.md)'s `#uat-N`.

## Date

proposed 2026-06-07 · accepted 2026-06-15

## North star (the owner's design driver)

**Minimise re-UAT cost.** A UAT/verdict flips to "stale" ONLY when the code it proved
*meaningfully* changed, and ONLY the affected proof unit needs re-proving — never a blanket
"everything is stale" on every commit, never on cosmetic churn. A **human-witnessed** UAT is the
expensive one to redo, so this precision is the whole point. Every fork below is resolved toward:
*do not make the human re-witness unless the thing they witnessed actually changed.*

## Context

storytree has two logical planes with agents between them — a **knowledge library** and the
**story tree** — over one shared event store (ADR-0006/0009; corpus location corrected in
ADR-0017). A work unit's proof, and a knowledge artifact, **bind to specific code**. The
requirement (owner): when the code a binding points at changes, the agent must **see** it changed
(a staleness signal), never silently consume stale context — and the studio must show stale as a
*distinct* state, never a silent revert of a once-green unit to brown (ADR-0040 §7: keep the
"proven once, at commit X" audit trail).

Today the binding was `Covers = {file, lines}` — brittle: line numbers shift on any edit above
them, so the pointer rots. Research surveyed how mature systems solve this (Kythe symbol identity;
GitHub stack-graphs / Sourcegraph SCIP per-commit indexing; Unison/Nix content-addressing;
Hypothes.is/Fiberplane-Drift fuzzy re-anchoring; XTDB bitemporal history; Salsa incremental
revision-compare; g3doc freshness). The findings and their tradeoffs are in the research note.

## Decision

1. **Binding = a versioned, re-anchorable `Anchor`** (replaces `Covers = {file, lines}`). An anchor
   keeps **identity separate from version** (the Kythe lesson — never fused):
   - IDENTITY ("what"): `file` + an optional `symbol` (structural/AST path) + an optional `quote`
     (a W3C `TextQuoteSelector`: `{exact, prefix, suffix}`) — the re-location cascade reads these.
   - VERSION ("when"): `boundHash` (the content-hash of the bound span at bind time — THE drift
     anchor) + an optional `boundCommit` (git SHA — provenance only).

2. **The change unit is a *described change-event*.** Content-hash answers *"did the bytes
   change?"* (mechanical, unskippable); a short human/agent-authored **description** answers *"is
   this meaningful, and why?"* (semantic). A **described** change counts as drift and carries the
   explanatory reason; an **undescribed** change is **demoted** — filtered from consumer-facing
   operations (context assembly, drift propagation, the studio changelog, proof invalidation) but
   **kept in the event log** and recoverable via an explicit "show undescribed divergence" audit.
   *Demoted, not deleted* — nothing meaningful can silently vanish, and nothing cosmetic forces a
   re-UAT.

3. **Staleness = a lazy, explanatory drift flag with three honest states.** Computed
   compare-on-read; surfaced to agents **with the description** of what changed:
   - `fresh` — the bound span's current hash equals the hash the proof was signed against. No re-UAT.
   - `stale` — the span changed AND a described change explains it; carries the latest description
     so a token-budgeted agent can judge relevance without re-deriving. → re-prove this unit only.
   - `drifted-undescribed` — the span changed but no described change explains it; demoted (audit
     only), **never** a re-UAT trigger.
   Lazy now; eager CDC / dirty-bit propagation is a deferred seam (the monorepo-scale optimization).

4. **Two drift signals, matching the provenance model.** **Code-drift** — a binding's covered
   span changed (hash compare). **Source-drift** — an artifact's source ADR or upstream artifact
   changed (the `derives_from` DAG; ADR-0017). Knowledge with **no code anchor** (principles,
   guardrails) falls back to source-drift + g3doc-style **freshness** (owner + reviewed-date).

5. **History = bitemporal** (XTDB model). **Transaction-time** = the event log's natural order
   (audit, immutable). **Valid-time** = the described-change narrative, allowing backdated
   corrections without rewriting history. *"What did we know, bound to which code, when"* is an
   `as-of` query over the projection.

6. **Borrow the ideas, not the monorepo machinery.** Kythe and per-commit SCIP/stack-graph
   indexing are cited for identity/binding ideas only — their per-commit re-index cost does not
   pay off at single-operator scale (ADR-0012 borrow-when-needed; scale asymmetry).

## The four forks, now pinned

These were ADR-0016's "What this does NOT decide" list. The owner settled **binding grain**
directly; the other three were resolved by three best-practice research sweeps (2026-06-15) whose
findings were unanimous and all pointed the same way as the north star.

### Fork A — Binding grain *(owner decision: per proof-unit, the finest)*

A binding lives on the **finest proof unit** — per-`#uat-N` for a UAT test (ADR-0044 already gives
these stable ids + a witness kind), per-contract for a contract, **capability as the coarsest
fallback, NEVER per-story.** You re-prove at the grain you bind at, so a change re-proves only the
affected unit. **Trade-off:** more anchors to author/maintain than a per-story binding — but a
per-story binding *is* the blanket-stale the owner forbids (any covered change would re-witness the
whole story), and the described-change gate keeps maintenance lazy. The payoff — never re-witnessing
an unaffected human UAT — is exactly the priority.

### Fork B — Which revision drives drift *(research: the span content-hash)*

**The content-hash of the bound span drives drift. The git commit SHA and the event-log seq are
provenance, never the trigger.** This is unanimous across Bazel/Buck2 (action-cache keys are
content digests of inputs, not a VCS revision), Salsa/rust-analyzer (backdating: an input edit that
doesn't change a value's content does not dirty its dependents), Nix CA store paths, Git
(blob-content hash vs commit SHA — a commit changes its SHA on any metadata change), and
Datomic/XTDB (transaction-time is the *audit/ordering* axis, not a per-fact "the value changed"
signal). A commit that does not change the bound span's hash produces **no** staleness — directly
killing blanket-stale-on-every-commit. **Reconciliation when an agent commits code AND appends an
event in one logical step:** one event-log transaction stores `{hashAfter, commitSha, description}`;
transaction-time orders the history; the commit SHA is a denormalised pointer to the diff; the
event's mere existence invalidates nothing — only a hash mismatch on the span does. **Trade-off:**
content-hashing is value-blind to *out-of-span* semantic change (an under-approximated dependency
set can MISS staleness) — mitigated by Fork A's proof-unit grain (bind the span the proof actually
exercises) and by normalising before hashing to kill in-span no-op false positives.

### Fork C — Hashing granularity *(research: AST-fingerprint canonical, ship normalized-text)*

**Canonical model = an AST/structural fingerprint with identifiers RETAINED (Fiberplane Drift's
exact choice); shipped behind a `hashSpan()` seam that runs normalized-text first and swaps to AST
per-language later — no caller changes.** The research's headline: a Drift-style AST fingerprint
(node kinds + token text) and a comment-stripping normalized-text hash **catch and miss almost the
same cosmetic edits** — both survive reformatting/blank-lines/comments, both trip on a rename. The
real lever is *"do you abstract identifiers,"* which is orthogonal to parsing — and for a human UAT
identifiers must stay IN the hash (a rename SHOULD re-witness; a false-negative is the dangerous
direction). What AST genuinely buys later: correct comment-stripping (regex comment-stripping is a
per-language minefield) and reliable symbol-scoping. **Trade-off:** the interim normalized-text
hasher false-positives on identifier renames and cross-token reformatting (Drift would too on the
rename) until the AST swap lands; AST then costs a tree-sitter grammar per language with the
normalized-text hasher as the fallback for unparsed languages. (Industry — MS TIA, Ekstazi, STARTS
— independently land on "coarser/cheaper is safe enough"; don't over-invest before measuring the
false-positive rate.)

### Fork D — Re-location fallback grain *(research: store both; symbol-first, fuzzy-fallback, refuse on ambiguity)*

**Store BOTH a structural `symbol` path and a fuzzy text-quote on the anchor; resolve
structure-first, fuzzy-fallback, and REFUSE (mark stale) rather than re-anchor an ambiguous span**
— the layered model W3C Web Annotation and Hypothes.is actually ship (multiple selectors, refined;
quote validates every hit). Full resolve cascade (a later slice): exact-position → **diff-transport**
(Sourcegraph's pattern — shift the stored span by the git diff between the bound commit and now; a
deterministic fit for our event-sourced store that avoids fuzzy search on ordinary merges) →
**unique** structural match (refuse on a name collision — the rename trap) → context-fuzzy →
selector-fuzzy → **REFUSE**. The content-hash stays the primary change-*detector*; this is only the
re-*locator*. **Ship the fuzzy text-quote arm first** (no parser, language-agnostic); the symbol/AST
arm is the precision upgrade alongside Fork C's parser work. **Trade-off:** fuzzy quote is
probabilistic and can mis-anchor — bought down by making refusal the default (every re-located span
must be the *unique*, quote-validated candidate or the binding goes stale), biasing toward
false-stale (recoverable) over false-anchor (a forged green). This is the halt-is-never-a-pass
discipline applied to re-location.

## Consequences

- **`packages/core` schema change (landed):** `Covers = {file, lines}` is retired; `Anchor`
  (`packages/core/src/anchor.ts` *(now `packages/proof-protocol/src/anchor.ts` for the shape,
  `packages/orchestrator/src/proof/anchor-compute.ts` for the `hashSpan`/`normalizeSpan` compute —
  `packages/core` dissolved by ADR-0068)*) replaces it; `Contract` and `ContractUnit` carry it as `anchor`.
  No live data or runtime code consumed the old `covers` (work units are frontmatter-markdown loaded
  by the light node-spec loader; contracts' covers were prose), so the rename rippled to the schema
  only.
- **Event vocabulary gains a `change` event** carrying `{unitId, hashBefore, hashAfter, description,
  author, at, commitSha}` — the described-change unit. This partially answers ADR-0006's §8 open
  event-vocabulary question for change events specifically.
- **First slice landed (this PR):** the binding/staleness *engine* in `packages/core`
  *(now split across `packages/proof-protocol` and `packages/orchestrator/src/proof/` — ADR-0068)* — the
  `Anchor`/`TextQuote` schema, the `hashSpan`/`normalizeSpan` content-hash seam (normalized-text
  first per Fork C), the `ChangeEvent`/`isDescribed` vocabulary, and the pure, lazy `classifyDrift`
  returning the three-state `DriftFlag` with its explanatory description (Fork B + the §3 model).
  Fully unit-tested, no store/clock/git.
- **The binding+drift layer *is* the "agents-in-between" interface** the owner described: the two
  planes stay logically separate, linked by versioned anchors; agents read drift as a real-time
  input.
- **Stale is a distinct state, never a silent green→brown** (ADR-0040 §7): `drifted-undescribed` and
  `stale` are their own values, additive to the green/brown ladder — the surfacing slices render
  them distinctly and keep the "proven once, at commit X" record.

## Deferred (the remaining slices — recorded, not yet built)

- **Surface the drift flag** where an agent/operator sees it: a CLI read (the next slice) and the
  studio "stale" hue (ADR-0040 §7's distinct visual, never a silent brown reversion).
- **Source-drift** propagation down the `derives_from` DAG (ADR-0017) + g3doc freshness for
  anchorless doctrine.
- **The AST-fingerprint swap** behind `hashSpan()` (Fork C) and the **full re-location cascade**
  (Fork D), including diff-transport and the symbol-path arm.
- **Writing the `change` event to the store** + the bitemporal projection / `as-of` query (§5), and
  the eager CDC/dirty-bit propagation seam (§3).
- **The human-witness signing ceremony** itself (ADR-0040 §7) — there is no recorded human-UAT
  verdict to age yet; the model above is designed to extend to it, but the first landable staleness
  is capability/machine-witness, where verdicts already exist (e.g. the `library` story).

## What this does NOT decide

- The **citing / reciprocity** mechanism and the **comments** layer — deferred (ADR-0017; the cite
  mechanism is since decided by ADR-0032).
- The exact tree-sitter grammar set and span boundaries for the AST swap (Fork C), and the precise
  fuzzy `Match_Threshold`/`Match_Distance` knobs and minimum-content floor for the re-location
  cascade (Fork D) — implementation tuning for the slices that build them.

## References

- [`knowledge-code-binding-and-staleness`](../research/knowledge-code-binding-and-staleness.md)
  (the research note), [ADR-0006](0006-event-store-observability-surface.md) (event store, amended),
  [ADR-0013](0013-structured-corpus-markdown-as-view.md) (`covers` retired here, amended),
  [ADR-0012](0012-tool-execution-pluggable-sandbox.md) (borrow-when-needed),
  [ADR-0017](0017-cross-cutting-knowledge-tier.md) (consumes this),
  [ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md) §7 (verdict ageing /
  stale≠brown, lands here), [ADR-0044](0044-per-uat-test-human-attestation.md) (the `#uat-N` grain).
- Fork research (2026-06-15): Bazel/Buck2 action digests, Salsa backdating, Nix CA paths, Git
  blob-vs-commit, Datomic/XTDB transaction-time (Fork B); Fiberplane Drift AST fingerprint, MS TIA /
  Ekstazi / STARTS granularity, clone-detection taxonomy, difftastic (Fork C); W3C Web Annotation
  selectors, Hypothes.is fuzzy-anchoring cascade, SCIP monikers, Sourcegraph diff-transport,
  diff-match-patch (Fork D).
- Design conversations 2026-06-07 and 2026-06-15.
