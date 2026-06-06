# Agentic → Storytree artifact gap analysis

**Date:** 2026-06-06
**Scope:** Identify ADRs and durable *library artifacts* (not code) from the
sibling **Agentic** repo (the Rust v1) and its embedded **legacy
AgenticEngineering** repo (the Python v0) that are worth bringing into
**Storytree** (the TypeScript v2). Concepts Storytree has already improved on
stay as-is and supersede their ancestors.

This document is the record of the review. The artifacts actually carried over
from it live in [`docs/guidelines/`](./guidelines/).

---

## Method

A four-way sweep was run, one pass per corpus:

1. **Agentic ADRs** — all 28 records in `Agentic/docs/decisions/`.
2. **Storytree docs** — the 10 ADRs plus `glossary.md`, `adjudication.md`,
   `open-questions.md`, `v1-conflicts-register.md`.
3. **Agentic library assets** — `Agentic/assets/**` and `Agentic/schemas/**`.
4. **Legacy AgenticEngineering** — the `AgenticGuidance` module's
   `assets/**` and the top-level architecture docs (code, CLI, and completed
   epic churn deliberately excluded).

Each artifact was classified **durable-portable** (tech-agnostic discipline any
agentic project could reuse) vs **stack-specific** (bound to Rust/SurrealDB/
Cloud Run/Windows/git-hooks, or to a deliberately-superseded v1 mechanism).

---

## Headline finding: the decision layer is already complete

Storytree's **ADR-0003 is a full v1→v2 disposition ledger** — it explicitly
routes every Agentic ADR (0001–0028) to a v2 home. Cross-checking each durable
Agentic ADR against Storytree's actual decisions confirms the routing is real,
not aspirational:

| Agentic ADR (durable) | Storytree disposition |
|---|---|
| 0005 red-green is a contract | **carried** → ADR-0007 (red-before-green as forensic evidence) |
| 0026 deterministic orchestration spine | **carried** → ADR-0005 (code sequences, pi judges) |
| 0027 proof-mode tiering | **carried** → ADR-0002 / 0007 / 0010 |
| 0013 branch-per-session isolation | **evolved** → ADR-0009 (DBOS workflows + typed claims) |
| 0022 cross-session coordination | **collapsed** → ADR-0009 (shared Postgres store) |
| 0025 origin-aware ID allocation | **carried** → ADR-0009 (DB-allocated IDs) |
| 0024 UAT-exempt stories | **renamed** → operator-attested proof mode (ADR-0007) |
| 0020 decompose-before-implement | **tracked** → open-questions §4 / adjudication H (explicit `decomposition` phase) |
| 0014 gate signing-walk via git ancestry | **folded** → proof-persistence question (open-q §1); Postgres events replace the git-ancestry mechanism |
| 0007 stories-consume-assets | **deliberately deferred** → open-q §9 (the cross-cutting-knowledge tier; must not reuse the word `asset`) |
| 0004 no-bootstrap-generator | **moot** → Storytree dropped per-agent spec files entirely |

The stack-specific Agentic ADRs (0001 Rust, 0002 SurrealDB, 0012/0016 Windows
credential bridge, 0015/0018/0019/0021 Cloud Run / SWE-bench / OAuth plumbing)
were reversed or made obsolete on purpose and are correctly recorded as such in
ADR-0003.

**Conclusion:** there is **no missing Agentic ADR that needs to be ported as a
new Storytree ADR.** The reversals Storytree made — subscription-auth ban →
API keys, "cascade rounds are not a cost" → per-node budget, autonomous
auto-merge → approval-gated trunk, read-only dashboard → driving studio,
escalation-screener → deleted — are intentional improvements that supersede
their Agentic origins. They stay as they are.

---

## The real gap: the library-artifact layer

Storytree has a rich **decision** layer (`docs/`) but **no asset layer at
all** — no `principles/`, `guidelines/`, `definitions/`, or `patterns/`
content. Agentic carries ~31 durable-portable artifacts and the legacy repo
adds a further set of genuinely novel ones. That is where the portable,
tech-agnostic value sits, and it is the part this review was asked to surface.

### Constraint: the `asset` mechanism stays dead

Storytree deliberately killed the v1 `asset` mechanism (the reciprocity-checked
`assets/` system; `asset` now means *tree art*). The cross-cutting-knowledge /
reciprocity model is explicitly parked (open-q §9). Per the owner's direction,
**killed concepts stay dead unless they can be mutated to fit the new
evolution.** Therefore the valuable *content* was carried over, but the
*container* was not: ported artifacts land as plain durable docs in
`docs/guidelines/`, rewritten in Storytree's vocabulary (story / capability /
contract, pi / spine / studio, event store) — **not** as a re-instated asset
system with reciprocity fields.

---

## What was brought over (Bucket A — carried into `docs/guidelines/`)

Tech-agnostic engineering discipline with no current Storytree home, distilled
and mutated to v2 vocabulary:

**From Agentic (`assets/`):**

- `implementer-shortcut-patterns` — the five shortcuts that pass shape-level
  tests but fail UAT (help-text narrowing, TODO-and-exit stubs, discarded typed
  params, in-production mocks, silent fallbacks).
- `test-fixtures-mirror-production-failure-modes` — fixtures must fail when
  production fails.
- `doc-vs-implementation-precedence` — a doc-vs-code gap is itself load-bearing
  signal, not metadata to paper over.
- `tightening-a-shared-contract-needs-a-full-sweep` — tightening a shared
  contract can break consumers at runtime while compiling clean.
- `assess-tradeoffs-by-naming-both-sides` — every tradeoff names what is being
  traded, both sides, in concrete terms.
- `no-proof-preservation` — never tiptoe around fields to keep a verdict alive;
  surface changed evidence.
- `verify-edit-write-persisted-or-escalate` — confirm an edit actually
  persisted before relying on it.
- `stale-prerequisite-links-are-phantoms` — cross-story declared-interface
  edges are correctable map data, not sacred.
- `edit-first-curation` — editing existing content is the default; new files
  are the justified exception.
- `defects-amend-the-owning-story` — defects amend the owning unit rather than
  fragmenting into new tickets (already named in the glossary; now elaborated).
- `deep-modules` — small interface, rich implementation (already named in the
  glossary; now elaborated).

**From legacy AgenticEngineering (`AgenticGuidance`) — concepts present in
neither current repo:**

- `signal-and-noise` — evaluate guidance by discriminatory power vs attentional
  drift.
- `guidance-quality` — effective authoring patterns (path / signpost / fence)
  vs anti-patterns (caps, repetition, strong language, negative framing).
- `reward-hacking` — detecting tests that validate success flags instead of
  real outcomes.
- `test-creation-principles` — evidence-based validation; verify outcomes, not
  flags.
- `exploration-principles` — discover-first, context-minimal, parallel,
  read-only investigation.
- `recursive-decomposition-patterns` — RLM-style handling of contexts that
  exceed model limits (context-as-environment, recursive decomposition,
  search/execution firewall).
- `pull-based-context-architecture` — JIT/pull context injection over push;
  freshness and minimal initial token load, as a principle (not a code spec).
- `dogfood-fix-the-source` — when your own tooling blocks progress, fix the
  tool rather than working around it.

---

## What was intentionally left behind (Bucket C)

- **The asset / reciprocity mechanism itself** — superseded; parked under
  open-q §9 (and must not reuse the `asset` term).
- **Agentic governance bound to its substrate** — `authority-order`
  (CLAUDE.md-shaped), `git-verb-authority` (git-hook enforced),
  `identifier-forms` (agentic-store row shapes).
- **Stack-specific guidelines** — Windows AppCompat test naming, shell
  path-var escaping, cargo bin-path bootstrap, refactoring-drift-bypass.
- **Schemas** — Agentic's `story` / `pattern` / `agent` / `asset` JSON schemas
  are YAML- and lifecycle-shaped for the Rust corpus (`under_construction`,
  `manual_signings`, per-agent `contract.yml`). Storytree's model and lifecycle
  differ, so these would require re-authoring, not porting; they were not
  carried. (If Storytree later wants schema-validated story/capability files,
  author them fresh against the v2 glossary.)
- **Legacy code-era artifacts** — the 26-agent Python roster, Typer CLI, TinyDB
  epic state, the tmux/SDK zombie-subprocess workaround, and the
  `YYMMDDXX` epic folder convention.

---

## Recommendations / open follow-ups

1. The **learning-loop / "verification-wins" substrate** is flagged in
   Storytree's own open-q §5 as durable-but-homeless. The legacy
   `signal-and-noise`, `guidance-quality`, and `reward-hacking` docs now carried
   into `docs/guidelines/` are the natural raw material for that tier if/when it
   returns — but, per open-q §9, it must not be rebuilt as an `asset` system.
2. If Storytree decides to validate story/capability/contract files
   structurally, author fresh schemas from the v2 glossary rather than porting
   the Agentic ones.
3. The carried guidelines are **advisory authoring guidance, not machine-
   enforced gates.** If any should become enforced (e.g. red-before-green),
   that belongs in an ADR + the gate, not in `docs/guidelines/`.
