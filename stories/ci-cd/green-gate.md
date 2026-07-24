---
id: "green-gate"
tier: capability
story: ci-cd
title: "The green gate — verify proves a PR against the merge of branch and main"
outcome: "A PR's verify job proves it against the merge of branch+main — manifest, CLAUDE.md plus all four harness-native agent views in sync, typecheck, test, build — and a red anything blocks the merge."
status: proposed
proof_mode: integration-test
depends_on: []
---

# The green gate — `verify` proves a PR against the merge of branch and main

**Outcome —** A PR's `verify` job ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml))
proves it against the **merge of branch + main** — `pnpm check:manifest`, `pnpm check:claude`,
`pnpm check:agents`, `pnpm -r typecheck`, `pnpm -r test`, `pnpm -r build` — and a red anything blocks
the merge (ADR-0022).

## Guidance

- **Proof-walkthrough first (integration test, against the real workflow file + the real scripts).**
  The unit under test is the assembled `verify` job: drive a clean PR branch and assert all six steps
  pass and the job is green; then drive a branch that breaks ONE invariant *only on the merge with
  main* (a clean branch whose merge-ref is red — e.g. main added a new root entry the branch's
  manifest doesn't list) and assert `verify` goes RED even though the branch in isolation is clean.
  That second leg is the whole point of the capability and can't be proven at the contract tier — it
  needs the merge-ref behaviour of the real job, which is why this is an integration test, not a unit.
- The job has no secrets and needs none: tests are offline (no DB, no API key), so a forked-PR run is
  identical to an owner run. Keep it that way — a secret in `verify` would split the gate.
- The merge-ref is GitHub's, not ours: `actions/checkout@v4` on a `pull_request` event checks out the
  merge commit of branch+main by default. The capability's job is to RELY on that, and to keep the
  step list the canonical content set the parity capability measures against.
- Ordering is cheap-first by intent (manifest/sync are seconds; build is last) but every step is
  required — there is no soft/optional step. A red in any step fails `verify`, and `automerge`
  (`needs: verify`) never runs.

## Contracts (4)

1. **`proves-against-merge-ref`** — `verify` runs on the merge of branch+main, not the branch alone
   - **asserts —** a branch that is green in isolation but whose MERGE with current `main` breaks an
     invariant (e.g. a root entry `main` newly requires in `repo-manifest.json`) makes `verify` go
     RED; the same branch re-based onto current `main` goes green. The redness appears on the PR's
     merge-ref check, never only on a branch-only build.
2. **`all-six-steps-required`** — every gate step is load-bearing; none is optional
   - **asserts —** breaking exactly one of `check:manifest`, `check:claude`, `check:agents`,
     `-r typecheck`, `-r test`, or `-r build` independently fails `verify`; a green job means all six
     passed (the step list in `ci.yml`'s `verify` job is exactly those six, in that order).
3. **`generated-views-in-sync`** — the three surface/sync gates catch drift
   - **asserts —** `check:manifest` fails on an unlisted root/loose-doc surface; `check:claude` fails
     when CLAUDE.md's operating-discipline region drifts from the `session-orchestrator` artifact
     (ADR-0051); `check:agents` fails when any Claude, Cursor, Codex, or Gemini CLI native view is
     stale, missing, orphaned, dangling, or differs from the same delegatable Library agent
     population (`.claude/agents/*.md`, `.cursor/agents/*.md`, `.codex/agents/*.toml`,
     `.gemini/agents/*.md`; ADRs 0052/0178/0234). Gemini files emit no model or tool grant, so the
     native Gemini CLI subagent inherits its parent session's model/tools; this contract makes no
     claim that Antigravity consumes the Gemini CLI surface. Each sync check is a real `verify`
     step, not advisory.
4. **`red-blocks-the-merge`** — a red `verify` stops the pipeline
   - **asserts —** `automerge` declares `needs: verify`, so a non-green `verify` means the merge step
     never runs; there is no path to `main` that skips a green `verify`.
