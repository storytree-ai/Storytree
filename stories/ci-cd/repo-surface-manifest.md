---
id: "repo-surface-manifest"
tier: capability
story: ci-cd
title: "The repo-surface manifest — no tracked root entry or loose doc merges undeclared"
outcome: "pnpm check:manifest refuses any tracked root entry or loose doc not declared in repo-manifest.json, so ad-hoc junk can't merge."
status: proposed
proof_mode: integration-test
depends_on: []
---

# The repo-surface manifest — no tracked root entry or loose doc merges undeclared

**Outcome —** `pnpm check:manifest` ([`scripts/check-manifest.mjs`](../../scripts/check-manifest.mjs)
against [`repo-manifest.json`](../../repo-manifest.json)) refuses any **tracked** top-level root entry,
or any standalone doc under `docs/`, that is not declared in the manifest — so temp/ad-hoc junk can't
ride a PR to `main` (the `repo-surface-allowlist` guardrail, ADR-0025).

## Guidance

- **Proof-walkthrough first (integration test, against the real script + real manifest).** Run
  `check-manifest.mjs` over a working tree that adds an UNLISTED root file (or loose `docs/` file) and
  assert a non-zero exit naming the offender; add the matching manifest entry and assert exit 0. The
  check reads the git INDEX (`git ls-files`), so the integration test must stage the surface to
  exercise the real path — an untracked scratch file is ignored BY DESIGN and proves nothing.
- The friction is the feature: a new root file/dir or a new loose doc requires a deliberate manifest
  entry WITH a justification first. That is what blocks scattered prose docs and keeps durable
  knowledge in the Library rather than at repo root.
- This is the gate that strands a clean local branch on CI: when `main` gains a new root entry the
  manifest must now list, a branch cut before that fails `check:manifest` on the merge-ref (the
  cross-reference into `green-gate`'s `proves-against-merge-ref`).
- Plain Node ESM, no tsx/deps, so it runs anywhere the gate runs (CI and local `pnpm gate` are byte
  identical here — `check:manifest` is in BOTH invariant sets, per `gate-ci-parity`).

## Contracts (3)

1. **`unlisted-root-entry-refused`** — a tracked root file or dir not in the manifest fails the check
   - **asserts —** staging a top-level entry absent from `repo-manifest.json`'s `root.files` /
     `root.dirs` makes `check-manifest.mjs` exit non-zero and name the offender; adding the manifest
     entry restores exit 0.
2. **`loose-docs-gated`** — a standalone `docs/` file outside the allowed set is refused
   - **asserts —** a new loose file under `docs/` that is not in `docs.files` and not under a
     `docs.allowedDirs` directory fails the check; a file inside an allowed dir passes.
3. **`reads-the-git-index-only`** — only what would actually merge is checked
   - **asserts —** an UNTRACKED root file does not trip the check (it isn't in `git ls-files`), while
     the same file once `git add`-ed does — so the gate guards the merge surface, not scratch.
