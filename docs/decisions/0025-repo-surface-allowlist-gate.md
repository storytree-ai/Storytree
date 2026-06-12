---
status: accepted
decided: 2026-06-08
---

# ADR-0025: Repo-surface allow-list gate — root + docs/ require a justified manifest entry

## Status

accepted (2026-06-08). Extends the [ADR-0022](0022-ci-green-gate-and-auto-merge.md) dev-repo
green gate with a repo-hygiene check. Operationalises the owner's directive that the **Library**
is the home for durable project knowledge: a new standalone doc must justify why it does *not*
belong there, and new root files must be explicitly allow-listed.

## Date

2026-06-08

## Context

- The **Library** (ADR-0017 / ADR-0018 / ADR-0019) is now the home for durable project
  knowledge — typed artifacts (`definition` / `principle` / `pattern` / `guardrail` /
  `techstack` / `template` / `adr` / `open-question`). A docs cleanup folded the pre-Library
  guideline corpus into it and pruned superseded review docs, leaving `docs/` lean: the ADRs,
  the generated `glossary.md`, the `open-questions.md` backlog, and `research/`.
- Agents reliably accrete two kinds of junk: **temp/ad-hoc files at the repo root**, and
  **one-off prose docs under `docs/`** that duplicate or bypass the Library. Left unchecked this
  re-creates the doc-sprawl the Library replaced and splits authority over durable knowledge.
- V1 used an **allowed-files/folders manifest** an agent had to extend before merging; it blocked
  one-off junk well.
- ADR-0022 established the dev-repo **green gate** (CI `verify` on every PR) + auto-merge-on-green
  — the natural enforcement point for a hygiene check.

## Decision

1. **A repo-surface allow-list — `repo-manifest.json` (root).** It enumerates every permitted
   top-level root entry (files + dirs) and the `docs/` surface (`allowedDirs`: `decisions`,
   `research`; `files`: `glossary.md`, `open-questions.md`), each **with a justification string**.
   A new doc's entry must state **why it does not belong in the Library**.

2. **A deterministic check — `scripts/check-manifest.mjs` (`pnpm check:manifest`).** It reads
   `git ls-files` (so it gates what would actually *merge*, ignoring untracked scratch and
   `node_modules`) and exits non-zero on any unlisted root entry or unlisted/unjustified loose
   doc, with remediation that routes a *durable* doc into the Library and a *config* doc into the
   manifest.

3. **Wired into the gate.** Added to `pnpm gate` (runs first) and CI's `verify` job before
   typecheck. Because `verify` guards merge to `main` (ADR-0022), **unlisted junk cannot merge**.

4. **Directory-level allow for ADRs and research.** `docs/decisions/` and `docs/research/` are
   allow-listed as *directories*, so new ADRs and research notes need no per-file entry; any
   **other** file directly under `docs/` needs a justified manifest entry.

5. **The rule lives in the Library** as the `repo-surface-allowlist` **guardrail** (a
   deterministically-enforced boundary), referencing this ADR.

## Relationship to ADR-0022 and the product gate

This gate guards the **dev repo's git surface** — the meta-layer that *builds* storytree, exactly
the trunk [ADR-0022](0022-ci-green-gate-and-auto-merge.md) governs. It is distinct from the
**product story-trunk** proof gate (`gate` / `never-bypass-the-gate` / `prove-it-gate`,
[ADR-0007](0007-proof-model.md) / [ADR-0008](0008-ui-drives-agents-approvals.md)), which refuses
*unproven units* onto the story DAG. Same invariant family — a gate **refuses**, it does not warn
— on a different surface. The product proof-gate artifacts are intentionally left **unexpanded**
so that precise term stays product-scoped; this dev-repo gate gets its own guardrail instead.

## Done in this PR

- `repo-manifest.json`; `scripts/check-manifest.mjs`.
- Root `package.json` (`check:manifest`, folded into `gate`); `.github/workflows/ci.yml`
  (a "Repo manifest" step in `verify`).
- Library guardrail `repo-surface-allowlist` (`apps/studio/data/knowledge.json`) + regenerated
  corpus (`assets.json`).
- This ADR.

## What this does NOT decide

- **Untracked-file nagging.** The check reads the git index (what merges); flagging untracked
  non-ignored files in a local `pnpm gate` was considered and deferred — it keeps the local gate
  clean for in-progress work, and CI on the merge result is the hard wall.
- **Other surfaces.** Only the root and `docs/` are gated; `packages/` / `apps/` / `stories/`
  have their own schema/test gates. Per-package file-shape allow-lists are out of scope.
- **Stale-entry enforcement.** A manifest entry whose target was deleted is a non-fatal nudge to
  tidy, not a failure.

## References

- [ADR-0022](0022-ci-green-gate-and-auto-merge.md) (the dev-repo green gate this extends);
  [ADR-0017](0017-cross-cutting-knowledge-tier.md) / [ADR-0018](0018-knowledge-tier-phase1-structured-source.md) /
  [ADR-0019](0019-library-tier-name-and-defer-dbos.md) (the Library);
  [ADR-0007](0007-proof-model.md) / [ADR-0008](0008-ui-drives-agents-approvals.md) (the product
  gate, distinguished above).
- `repo-manifest.json`; `scripts/check-manifest.mjs`; `.github/workflows/ci.yml`; the
  `repo-surface-allowlist` Library guardrail.
- Owner direction, 2026-06-08.
