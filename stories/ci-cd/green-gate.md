---
id: "green-gate"
tier: capability
story: ci-cd
title: "The green gate — verify proves a PR against the merge of branch and main"
outcome: "A PR's verify job proves it against the merge of branch+main — organism boundaries, cross-surface mirror conformance, the three web checks (grounding, engine, and — since ADR-0336 — the Act 1 static-import-closure wall), typecheck, test, build, and the generated root CLAUDE.md + AGENTS.md guidance plus all four harness-native specialist-agent directories in sync — and a red anything blocks the merge."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [486]
# ⚠ THE PROOF IS DELIBERATELY SPLIT, NOT STRETCHED (ADR-0486). Contracts 2, 3 and 4 are static-YAML
# audits over the real `.github/workflows/ci.yml` and are fully assertable offline. Contract 1 is
# MIXED: its repo-owned half — that the `verify` checkout does not OVERRIDE actions/checkout's
# pull_request merge-ref default — is assertable and is what can actually regress in this repo; its
# platform half — that GitHub genuinely produces a correct merge commit — is PLATFORM TRUST and is
# EXCLUDED from this unit's verdict rather than folded into it. Stretching one proof to cover the
# platform half is how a sliver of unverifiable behaviour ends up inside a signed green.
#
# STAYS IN `ci-cd`, AND ITS SOURCE NEEDS A BUILDING THIS STORY OWNS — SETTLED 2026-08-31
# (story-author). Its sibling `gate-ci-parity` hit the SAME ADR-0192 wall on the same day and got the
# OPPOSITE answer — it moved to `cli` (see `stories/cli/gate-ci-parity.md`). The two were decided
# separately, and the split is the point, not an inconsistency.
#
# WHY THIS ONE DOES NOT MOVE. `green-gate` is `ci-cd`'s ROOT capability — `depends_on: []`, with
# `auto-merge-on-green` and, transitively, `merge-presence-retire` and `deploy-on-merge` resting on it
# — and its outcome IS the story's outcome ("nothing reaches `main` unproven"). Contracts 1, 2 and 4
# are pure PIPELINE facts: the checkout takes the merge ref, no step is soft, `automerge` needs
# `verify`. That is precisely what `ci-cd` owns and what no other story does. Re-homing it would leave
# `ci-cd` a story about the side-effects of a pipeline it did not own, and would fail `cold-rebuild`.
#
# AND ITS JUDGE IS COUPLED TO NO BUILDING. Unlike `gate-ci-parity` — whose judge MUST read the
# `GATE_PLAN` literal out of `packages/cli/src/gate-order.ts`, half its subject being `cli`'s own
# source — this one reads ONLY `.github/workflows/ci.yml`, with no `@storytree/*` import. Nothing
# draws it toward `packages/cli` except the accident of where the first draft was written, and this
# story's body already claims `.github/workflows/` as its work-tracked home.
#
# THE ROOT CAUSE, STATED PRECISELY. `ci-cd` owns no workspace package. `readUnitSourceFiles`
# (`packages/cli/src/check-boundaries.ts`) gathers `buildConfig.real` ONLY — so this story's TWO
# existing Class-B `proof:` blocks (`adr-health-gate`, `merge-presence-retire`) are invisible to rules
# 5/6 today even though between them they point into THREE foreign buildings (`packages/cli`,
# `packages/library`, `packages/notice-board`). The first `real:` arm is what creates hosting
# evidence. ⚠ A Class-B block would therefore "work" here, and must NOT be chosen for that reason:
# the invisibility is a limit of the evidence gatherer, not a licence, and picking it to stay under
# the rule is the route-around the rule exists to stop.
#
# THE OTHER TWO REMEDIES, AND WHY NOT. Re-homing the capability (the answer the sibling got) is
# refused above on the merits. Adding `ci-cd` to the `hostedStories` register would be false to the
# register's own definition — the FROZEN set of stories whose proof-bound sources ALREADY lived in a
# foreign building at the 2026-07-13 adoption, which `ci-cd`'s never did — and reverses the direction
# ADR-0192 D3 exists to drive. A path outside `packages/`/`apps/` (for which `buildingDirOf` returns
# null, tripping neither rule) is unprecedented — all 139 `real.sourceFile` values in the corpus sit
# under one or the other — and would live in no workspace project, so `pnpm -r test` would never run it.
#
# ⚠ NOT BUILDABLE YET, DELIBERATELY. The `proof:` block stays REMOVED until that package exists, so
# `node resolve` reports the unit NOT buildable and `--real` refuses fail-closed — cheaper than a
# repeat of what the sibling paid: driven to a signed PASS for $2.8028, then refused by
# `check:boundaries`, because `storytree node resolve` answers "REAL-buildable: yes" BEFORE any
# boundary rung looks at where the file will land. THIS UNIT HAS NEVER BEEN DRIVEN and no verdict for
# it exists — the block replaced here claimed a parked branch and a persisted signed PASS, and both
# belonged to the sibling, not to this unit.
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
   - **asserts —** the `verify` job's checkout step does NOT override actions/checkout's
     `pull_request` merge-ref default: it declares no `ref:` input pinning the head sha. That
     ABSENCE is what carries the behaviour, so the absence is what is asserted — pinning the head sha
     is the one edit that would silently convert the job from merge-of-branch-and-main to
     branch-alone and reintroduce the whole "local green, CI red" class.
   - **⚠ SPLIT — the platform half is EXCLUDED from this unit's verdict** (ADR-0486). That a branch
     green in isolation but broken when MERGED with current `main` actually goes RED depends on
     GitHub and actions/checkout producing a correct merge commit. That is platform trust, not a unit
     a worktree red→green can drive, and no test here claims it. The behaviour is REAL and is what
     the capability is for; it is simply not something this proof can honestly sign. Recorded as
     trust rather than stretched into the signed green.
2. **`every-step-is-required`** — every step the job runs is load-bearing; none is optional
   - **asserts —** breaking exactly one of the content checks `verify` runs makes the whole job go
     RED, and a green job therefore means every one of them passed. No step is advisory,
     `continue-on-error`, or otherwise soft in the `verify` job, and `automerge` (`needs: verify`)
     never runs against a non-green one.
     ⚠ **SCOPE THE ASSERTION TO THE `verify` JOB — a whole-file read of `ci.yml` FAILS on correct
     code.** Measured 2026-08-31: `continue-on-error: true` appears SEVEN times in the workflow and
     every one is in the `automerge` job, never in `verify`. They are deliberate, documented,
     post-merge fail-soft steps (the claim-release writer, the GCP auth, the hierarchy-mirror
     regeneration, the ADR-0195 full-CI backstop dispatch), each carrying a comment saying why it must
     not block a merge it cannot undo. The file also states its own exception: the studio-deploy
     dispatch is LOUD (no `continue-on-error`) and must stay LAST, so a dispatch failure cannot skip
     the fail-soft claim-release steps above it. **The step list is NOT part of what this contract
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
