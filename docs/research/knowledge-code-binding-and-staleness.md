# Research note — binding a knowledge layer to code versions, and detecting staleness

**Date:** 2026-06-07 · **Informs:** ADR-0016 (binding/staleness model), ADR-0017 (knowledge tier).
**Method:** multi-source web research, 6 angles, 26 sources fetched, 25 falsifiable claims extracted and 3-vote adversarially verified (25/25 confirmed, 0 killed).

## Question

How do mature, at-scale systems bind a versioned **knowledge/context layer** to specific versions of a **codebase**, track its history, and detect/propagate **staleness** when the code changes — so a consumer (here, an AI coding agent) can *see* that the code a piece of knowledge was bound to has changed, rather than silently consuming stale context?

## TL;DR

The field uses a small set of recurring primitives. The right combination for a single-operator, event-sourced-Postgres system is: **content-hash binding** (per bound span) + a **symbol/fuzzy fallback** for re-location + a **bitemporal event log** for history + a **Salsa-style "last-changed revision" compare** surfaced to agents as an **explicit drift flag**. The heavyweight monorepo machinery (Kythe, per-commit SCIP/stack-graph indexing) is cited for its *ideas*, not adopted as infrastructure — it doesn't pay off below Google/GitHub scale.

## Findings (verified)

### 1. Binding granularity — four approaches

- **Symbol identity, version excluded (Kythe).** A Kythe `VName` is exactly `signature/corpus/root/path/language` — **no revision/commit/timestamp field**. Version-control info lives in a *separate* `vcs` node (commit hash, type, uri); time is recorded as facts on nodes, never baked into identity. **Lesson:** keep a stable symbol identity separate from the code-version it was observed at; bind the version as a *separate fact*. (kythe.io/docs/kythe-uri-spec, kythe-storage)
- **Per-commit, per-file incremental indexing (GitHub stack-graphs; Sourcegraph SCIP/LSIF).** Each file is analyzed in isolation at index time and merged only at query time for the viewed commit, so editing one file doesn't re-analyze unchanged files. The canonical "bind knowledge to a commit, recompute only the delta" pattern — but engineered for monorepo scale. (github.blog/introducing-stack-graphs, arXiv 2211.01224)
- **Content-addressing — the hash *is* the version (Unison; Nix CA derivations).** Unison identifies each definition by a 512-bit SHA3 of its syntax tree (names excluded); contents at a hash never change, names are mutable metadata pointing at immutable hash addresses. "Did this change?" becomes a trivial hash comparison — a natural fit for an event-sourced store — but it is symbol/definition-granular and **brittle to whitespace/refactor drift**. (unison-lang.org/docs, haskell.nix ca-derivations)
- **Fuzzy text-quote re-anchoring (Hypothes.is; anchor-quote; Fiberplane Drift).** Store the target redundantly (range selector + char-offset selector + exact quote with ~32-char prefix/suffix) and re-anchor via a cost-ordered cascade — *accepting* drift and re-locating rather than relying on one brittle pointer. Fiberplane **Drift** binds docs→code at three granularities (whole-file, AST symbol, inline `@path#Symbol`) and `drift check` flags staleness by comparing a stored **tree-sitter AST fingerprint** — a production, CI-gating drift detector directly analogous to our need. Cheapest and most edit-tolerant. (web.hypothes.is/blog/fuzzy-anchoring, github.com/fiberplane/drift)

### 2. History — bitemporal

Model history on two independent axes (XTDB): **system/transaction-time** (DB-controlled, immutable, audit — the natural fit for an append-only event log) plus **valid-time** (user-editable, supports *backdating* a fact that became true earlier than recorded). `as-of` time-travel reconstructs "what did we know, bound to which code, when." Maps directly onto our event log + projections: transaction-time = event order; valid-time = retroactive corrections without rewriting history. (docs.xtdb.com/about/time-in-xtdb, v1-docs.xtdb.com bitemporality)

### 3. Staleness — compare a stored revision against current

Incremental-compute frameworks (Salsa / rust-analyzer red-green) keep a **monotonic revision counter**; each derived result records its dependencies plus the revision each last changed; on a new revision a result returns cached unless an input changed — an explicit *"your inputs changed"* signal. For us: store, per binding, the code hash it was bound to; **drift = `bound_hash != current_hash`** — cheap, deterministic, no infrastructure. Build systems add **"early cutoff"** (Nix/Bazel): stop propagating when *output content* is unchanged even if an upstream source changed — the key trick for avoiding **false-positive drift alarms**. (salsa-rs.github.io algorithm, buck2.build incremental_actions)

For knowledge with **no code anchor** (principles, guardrails), Google **g3doc** uses lightweight **freshness metadata** — an embedded `freshness: {owner, reviewed}` block — and emails owners when a doc is untouched beyond an interval. A time/review-based signal, complementing code-derived drift. (abseil.io swe-book ch10)

## The genuine conflict (a conscious choice, not a default)

**Content-hash binding** (Unison/Nix — exact, trivial change-detection, but *any* edit including whitespace trips it; symbol-granular) **vs fuzzy text-quote anchoring** (Hypothes.is/Drift — survives edits/refactors, but probabilistic, can mis-anchor). Opposite philosophies: *prevent* drift via exact identity vs *tolerate* drift via re-location. The reconciling pattern both Drift and Hypothes.is actually ship: **layer them** — content-hash/AST-fingerprint for the fast "unchanged?" check, fuzzy quote for "changed → re-locate or flag."

## Scale asymmetry (what NOT to adopt)

Kythe and per-commit SCIP/stack-graph indexing are built for Google/GitHub monorepo scale; their cost (full semantic re-index per commit, large index storage) does **not** pay off for a single-operator event-sourced Postgres system. Cited for binding/identity *ideas*, not as adoptable infrastructure.

## Recommendation for storytree (→ ADR-0016)

- **Bind** at content-hash of the bound span (drift localizes per binding) + a symbol/fuzzy anchor as the re-location fallback.
- **History** = the bitemporal event log we already chose (transaction-time = log; add valid-time for corrections).
- **Staleness** = lazy `current_hash != last_described_hash` compare, surfaced to agents as an explicit flag; eager CDC/dirty-bit deferred as a seam.
- **Owner refinement (the early-cutoff solution, authoring-side):** a change carries a short **description**; only *described* changes advance the bound hash and propagate drift; undescribed changes are **demoted** (filtered from consumer operations, kept in the log, recoverable by audit). This both suppresses false-positive drift *and* makes the drift flag **explanatory** ("changed: <why>") rather than binary.
- **Two drift signals:** code-drift (bound span changed) and source-drift (an artifact's source ADR / upstream artifact changed — the provenance DAG); anchorless doctrine falls back to source-drift + g3doc-style freshness.

## Open questions carried into the ADRs

- Binding granularity for re-location: symbol/AST path vs fuzzy text-quote as the *fallback* layer (content-hash is settled as the primary detector).
- Which revision drives drift — event-log transaction-time, git commit SHA, or content hash of the bound region — and how they reconcile when an agent commits code and appends an event in one logical step.
- For anchorless doctrine, how agents weight a time-based freshness signal against a code-derived drift signal.

## Sources (primary, verified)

Kythe URI/storage specs · GitHub stack-graphs (github.blog) + arXiv 2211.01224 · Unison docs (the-big-idea, hashes) · haskell.nix CA derivations · XTDB time/bitemporality docs · Salsa algorithm reference · Fiberplane Drift (repo + blog) · rust-analyzer durable-incrementality · Buck2 incremental actions · abseil.io SWE-book ch.10 (g3doc freshness) · Sourcegraph SCIP announcement.

**Honesty note:** the *systems* findings above are from strong primary sources and verified 3-0. The *AI-agent-specific* "version-aware context" angle returned thin results from weak/unverifiable sources (several dubious arXiv IDs); the recommendation deliberately rests on the well-grounded systems patterns, not those.
