---
id: "repo-surface-manifest"
tier: capability
story: ci-cd
title: "The repo-surface manifest — no tracked root entry or loose doc merges undeclared"
outcome: "pnpm check:manifest refuses any tracked root entry or loose doc not declared in the repo manifest's repo-surface allow-list (repo-manifest/repo-surface/_domain.json), so ad-hoc junk can't merge."
status: proposed
proof_mode: integration-test
depends_on: []
---

# The repo-surface manifest — no tracked root entry or loose doc merges undeclared

**Outcome —** `pnpm check:manifest` refuses any **tracked** top-level root entry, or any standalone doc
under `docs/`, that is not declared in the repo manifest's repo-surface allow-list
([`repo-manifest/repo-surface/_domain.json`](../../repo-manifest/repo-surface/_domain.json)) — so
temp/ad-hoc junk can't ride a PR to `main` (the `repo-surface-allowlist` guardrail, ADR-0025).

*(Corrected in place 2026-09-15, ADR-0139: this paragraph and the frontmatter `outcome` pointed at
`scripts/check-manifest.mjs` reading `repo-manifest.json`, and both pointers are stale. The allow-list
moved into `repo-manifest/repo-surface/_domain.json` when ADR-0556 split the repo manifest into
fragment files read through one composer. The script is deleted: nothing had run it since ADR-0311 D2
retired `check:manifest` from the gate and CI, and it read the allow-list straight out of
`repo-manifest.json`. The outcome still names that retired check, and whether to retire, re-scope or
re-wire this capability is still open modeling call 5 in [`story.md`](story.md).)*

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

*(Corrected in place 2026-09-15, ADR-0139: the first and fourth bullets describe
`scripts/check-manifest.mjs`, which is deleted, and the third and fourth describe `check:manifest`
running in CI, which stopped when ADR-0311 D2 retired it from the gate and CI. They are left as
authored, because what a proof here would run is exactly what open modeling call 5 in
[`story.md`](story.md) has not yet decided.)*

## Contracts (3)

*(Corrected in place 2026-09-15, ADR-0139: contract 1 named `repo-manifest.json` as the home of the
`root.files` / `root.dirs` it reads; they now live in the repo-surface allow-list,
`repo-manifest/repo-surface/_domain.json`. The script contract 1 names, `check-manifest.mjs`, is
deleted and is left as authored, because which check these contracts would exercise is what open
modeling call 5 in [`story.md`](story.md) decides. Contract ids and count are unchanged.)*

1. **`unlisted-root-entry-refused`** — a tracked root file or dir not in the manifest fails the check
   - **asserts —** staging a top-level entry absent from the repo-surface allow-list's `root.files` /
     `root.dirs` (`repo-manifest/repo-surface/_domain.json`) makes `check-manifest.mjs` exit non-zero
     and name the offender; adding the manifest entry restores exit 0.
2. **`loose-docs-gated`** — a standalone `docs/` file outside the allowed set is refused
   - **asserts —** a new loose file under `docs/` that is not in `docs.files` and not under a
     `docs.allowedDirs` directory fails the check; a file inside an allowed dir passes.
3. **`reads-the-git-index-only`** — only what would actually merge is checked
   - **asserts —** an UNTRACKED root file does not trip the check (it isn't in `git ls-files`), while
     the same file once `git add`-ed does — so the gate guards the merge surface, not scratch.
