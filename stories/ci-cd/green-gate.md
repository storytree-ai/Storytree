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
# ⚠⚠ BLOCKED BY ADR-0192 — DO NOT SPEND A `--real` RUN ON THIS UNIT UNTIL ITS SOURCE HAS A HOME.
# Measured 2026-08-31, the expensive way: this unit WAS driven `--real` — its SIBLING `gate-ci-parity` was, and this unit's arm named the
# same foreign building, so it would hit the identical refusal. `check:boundaries`
# then REFUSED the result on two rules at once:
#   - the hosted-story landlord rule (ADR-0074 §4) — story "ci-cd" claimed a unit source file inside
#     "cli"'s building (`packages/cli`) with no declared edge; and
#   - the ADR-0192 PACKAGES-FORWARD REFUSAL — "ci-cd" is NOT in the frozen `hostedStories` register,
#     and a NEW story cannot host in a foreign building AT ALL, regardless of any declared edge.
# The register holds 15 entries, DOWN from the frozen 18, because its whole purpose is to SHRINK as
# stories migrate out (ADR-0192 D3). Adding "ci-cd" to it would reverse the decision's direction and
# is described by the refusal itself as a deliberate owner-reviewed grandfathering — not a session's
# call to make on the way past.
#
# THE ROOT CAUSE IS THAT "ci-cd" OWNS NO WORKSPACE PACKAGE. Verified against `repo-manifest.json`:
# `sourceOwnership` gives it ZERO subtrees. Its capabilities were all Class C (no `proof:` block at
# all), so none had ever declared a `real.sourceFile` — which is why no hosting evidence existed and
# why the register never listed it. Authoring the first one CREATED the first hosting relationship,
# and ADR-0192 refused it on sight. That is the rule working, not a defect.
#
# ⚠ THE PRE-FLIGHT DOES NOT CATCH THIS, AND THAT IS THE COSTLY PART. `storytree node resolve`
# reported "REAL-buildable: yes" and the build ran to a signed PASS before any boundary rung looked
# at where the file landed. So the money is spent BEFORE the refusal is discoverable. Anyone adding a
# `real.sourceFile` to a story that owns no package will pay the same ~$2.80 for an unlandable verdict.
#
# ⚠ THE WORK IS NOT LOST — DO NOT RE-DRIVE IT FROM SCRATCH. The leaf's authored pair is parked on
# `origin/claude/real/<none — never driven>`: `packages/cli/src/green-gate-audit.ts` and `packages/cli/src/green-gate-audit.test.ts`. It is good work — pure functions, the CI
# job scoped correctly, both real definitions read at runtime — and the signed PASS persists in
# `events.verdict`. Re-home those two files into a package "ci-cd" legitimately owns, repoint the
# arm, and re-prove; do not re-author.
#
# THE FORK, for story-author / an architecture decision — NOT an owner fork (ADR-0192 already
# settled the rule; what is open is only WHICH remedy):
#   (a) give "ci-cd" its own workspace package and re-home the unit's source there; or
#   (b) re-home the CAPABILITY to the "cli" story, whose building already hosts the repo's checking
#       apparatus (`verification-decay-instruments` owns check sources there today) — the subject is
#       the gate/CI relationship, but the ARTEFACT is one more `check:*` rung; or
#   (c) an owner-reviewed grandfathering of "ci-cd" onto the shrinking register — the direction
#       ADR-0192 exists to reverse, and the weakest of the three.
# Until one is chosen, the `proof:` block is REMOVED so `node resolve` reports the unit
# NOT buildable and `--real` refuses fail-closed. That refusal is the point: it is cheaper than
# another unlandable verdict.
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
