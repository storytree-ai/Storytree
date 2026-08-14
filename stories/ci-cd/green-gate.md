---
id: "green-gate"
tier: capability
story: ci-cd
title: "The green gate — verify proves a PR against the merge of branch and main"
outcome: "A PR's verify job proves it against the merge of branch+main — organism boundaries, cross-surface mirror conformance, the three web checks (grounding, engine, and — since ADR-0336 — the Act 1 static-import-closure wall), typecheck, test, build, and the generated root CLAUDE.md + AGENTS.md guidance plus all four harness-native specialist-agent directories in sync — and a red anything blocks the merge."
status: proposed
proof_mode: integration-test
depends_on: []
---

# The green gate — `verify` proves a PR against the merge of branch and main

**Outcome —** A PR's `verify` job ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml))
proves it against the **merge of branch + main** — `pnpm check:boundaries`,
`pnpm check:mirror-conformance`, `pnpm check:web-grounding`, `pnpm check:web-engine`,
`pnpm check:web-experience-closure` (ADR-0336), `pnpm -r typecheck`, `pnpm -r test`,
`pnpm -r build`, `pnpm check:guidance`, `pnpm check:agents` —
and a red anything blocks the merge (ADR-0022).

**The workflow file is the live list; this paragraph is a reading of it, not a second source.** The
set moves (ADR-0302 D4 deleted the three seed-sync rungs; ADR-0311 D2 retired thirteen more,
`check:manifest` and `check:web-experience` among them — both are declared in `RETIRED_CHECKS` in
[`packages/cli/src/gate-order.ts`](../../packages/cli/src/gate-order.ts), and neither is a root
script any more). What this capability owns is the JOB — that it runs on the merge ref, that every
step it does run is blocking, and that `automerge` cannot outrun it — never a frozen enumeration.

## Guidance

- **Proof-walkthrough first (integration test, against the real workflow file + the real scripts).**
  The unit under test is the assembled `verify` job: drive a clean PR branch and assert every step
  the job runs passes and the job is green; then drive a branch that breaks ONE invariant *only on
  the merge with main* (a clean branch whose merge-ref is red — e.g. `main` removed an export the
  branch's new call site uses, so the merge fails `-r typecheck` while either side alone is clean)
  and assert `verify` goes RED even though the branch in isolation is clean.
  That second leg is the whole point of the capability and can't be proven at the contract tier — it
  needs the merge-ref behaviour of the real job, which is why this is an integration test, not a unit.
- The job has no secrets and needs none: tests are offline (no DB, no API key), so a forked-PR run is
  identical to an owner run. Keep it that way — a secret in `verify` would split the gate.
- The merge-ref is GitHub's, not ours: `actions/checkout@v6` on a `pull_request` event checks out the
  merge commit of branch+main by default. The capability's job is to RELY on that, and to keep the
  step list the canonical content set the parity capability measures against.
- Ordering is deliberate on two axes, and the second one is the newer of the two: cheap branch-local
  `check:*` steps run first (seconds), then the expensive legs (`-r typecheck`, `-r test`, `-r
  build`), and the two checks that read the SHARED live Library — `check:guidance` and
  `check:agents` — run LAST, so a sibling moving the live source can never precede this branch's own
  answer. But ordering is about WHEN a verdict arrives, never about whether it binds: every step is
  required, there is no soft/optional step, a red in any one fails `verify`, and `automerge`
  (`needs: verify`) never runs.

## Contracts (4)

1. **`proves-against-merge-ref`** — `verify` runs on the merge of branch+main, not the branch alone
   - **asserts —** a branch that is green in isolation but whose MERGE with current `main` breaks an
     invariant (e.g. `main` removed an export the branch's new call site imports, so only the merged
     tree fails `-r typecheck`) makes `verify` go RED; the same branch re-based onto current `main`
     goes green. The redness appears on the PR's merge-ref check, never only on a branch-only build.
2. **`every-step-is-required`** — every step the job runs is load-bearing; none is optional
   - **asserts —** breaking exactly one of the content checks `verify` runs makes the whole job go
     RED, and a green job therefore means every one of them passed. No step is advisory,
     `continue-on-error`, or otherwise soft in the `verify` job, and `automerge` (`needs: verify`)
     never runs against a non-green one. **The step list is NOT part of what this contract
     guarantees** — read it from
     [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), which is the live list; ADR-0302
     D4 and ADR-0311 D2 have both changed it, and a contract that froze an enumeration would have
     gone false on each of those days while the invariant it exists to pin stayed true.
3. **`generated-views-in-sync`** — the two generated-view gates catch drift
   - **asserts —** `check:guidance` fails when either root main-session view — CLAUDE.md or Codex
     AGENTS.md — drifts from the canonical
     `session-orchestrator` artifact (ADRs 0051/0291; `check:claude` remains a compatibility alias);
     `check:agents` separately fails when any specialist Claude, Cursor, Codex, Gemini CLI, or
     OpenCode native
     view is stale, missing, orphaned, dangling, or differs from the same delegatable Library agent
     population
     (`.claude/agents/*.md`, `.cursor/agents/*.md`, `.codex/agents/*.toml`, `.gemini/agents/*.md`,
     `.opencode/agent/*.md`; ADRs 0052/0178/0234). Gemini files emit no model or tool grant, so the
     native Gemini CLI subagent inherits its parent session's model/tools; this contract makes no
     claim that Antigravity consumes the Gemini CLI surface. Each sync check is a real `verify`
     step, not advisory.
   - **and each names WHICH SIDE MOVED —** because both check a COMMITTED projection against the
     SHARED live store, a red here is as often another session's landed regeneration this branch has
     not merged as it is this branch's own omission, and the two remedies are opposite. Each failure
     therefore classifies every drifted file against `origin/main` and this branch's merge-base and
     prints the remedy in the order that does not sweep a sibling's in-flight live-store edit into
     this commit: *behind main* → merge and re-check FIRST, regenerate only if it still reds;
     *main equally stale* → merging cannot help, regenerate and commit separately with attribution;
     *this branch touched it* → regenerate, and no merge is offered because git would decline to
     apply one over a local edit. An unreadable `origin/main` fails WIDE to the unconditional
     remedy with the reason named — a side is never guessed (diagnosis-honesty-arc).
4. **`red-blocks-the-merge`** — a red `verify` stops the pipeline
   - **asserts —** `automerge` declares `needs: verify`, so a non-green `verify` means the merge step
     never runs; there is no path to `main` that skips a green `verify`.
