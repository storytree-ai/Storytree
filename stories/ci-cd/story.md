---
id: "ci-cd"
tier: story
title: "CI/CD — the one enforced pipeline every green unit crosses to reach trunk"
outcome: "Every contributor's green unit reaches trunk — and the surfaces that ride on trunk stay fresh — through one enforced pipeline; nothing reaches main unproven."
status: proposed
proof_mode: UAT
# ci-cd depends on the two sibling surfaces its post-merge side-effects WRITE TO (ADR-0058 §1, §3):
# deploy-on-merge needs studio-cloud's Cloud Run + IAP service as a deploy target, and
# merge-presence-retire needs notice-board's presence store as a write target — real OUTBOUND
# dependencies, so they roll up to depends_on. ci-cd is NOT a trunk: the "everything's delivery rides
# on this pipeline" reliance is a PROCESS-axis fact (how any unit reaches main), deliberately NOT
# drawn as inbound edges (it would make ci-cd a dependency of everything — noise, not signal), and
# ci-cd has zero inbound edges. Verified acyclic: studio-cloud (depends_on: [studio, library]) and
# notice-board (depends_on: [library, drive-machinery]) never reach back to ci-cd. (library is the
# genuine trunk — a root every story depends on.)
capabilities: [green-gate, repo-surface-manifest, adr-health-gate, gate-ci-parity, auto-merge-on-green, merge-presence-retire, deploy-on-merge]
depends_on: [studio-cloud, notice-board]
# ADR-0166 artifact edges: the deliberate NON-IMPORT seams among the depends_on above (build-artifact /
# write-target / hosted-seam consumption, narrated per-edge in the comments/body of this spec) — the
# declared-edge honesty gate accepts these without a code import; remove an entry if the seam ever
# becomes a real package import.
artifact_edges: [studio-cloud, notice-board]
# Deciding ADRs (ADR-0037 §2): the green gate + auto-merge (22), repo-surface manifest (25),
# decision binding + adr-health (37), the ADR-number allocator (50), session presence the retire
# backstop serves (33), the display posture it heals (41), studio CD (46), keyless WIF auth (21),
# the dependency-direction / no-cycle model that fixed this story's edges (58), and the fourth
# harness-native generated agent view covered by check:agents — Gemini CLI (234).
decisions: [22, 25, 37, 50, 33, 41, 46, 21, 58, 234]
---

# CI/CD — the one enforced pipeline every green unit crosses to reach trunk

**Outcome —** Every contributor's green unit reaches trunk — and the surfaces that ride on trunk
stay fresh — through one enforced pipeline; nothing reaches `main` unproven.

This is storytree's **delivery process**: the approval-gated path from a contributor's local green to
a landed, deployed `main`. It has no standalone deliverable a user opens, and every other story's
*landing* rides on it — but that universal reliance is a PROCESS-axis fact, not a dependency edge
(ADR-0058 §2): on the story DAG ci-cd is an ordinary consumer (it depends on the two sibling surfaces
its post-merge side-effects write to) with zero inbound edges, **not** a "trunk" root. (`library` is
the genuine trunk — a root every story depends on.) It is the work-tracked home for the
machinery that today lives in `.github/workflows/` (the `verify` + `automerge` jobs in
[`ci.yml`](../../.github/workflows/ci.yml), the deploy in
[`deploy-studio.yml`](../../.github/workflows/deploy-studio.yml)), the root-surface and ADR-number
gates in [`scripts/`](../../scripts), and the keyless CD infra in [`infra/`](../../infra). The
deciding ADRs are [ADR-0022](../../docs/decisions/0022-ci-green-gate-auto-merge.md) (the green gate +
auto-merge-on-green, inside free Actions because GitHub-native auto-merge is paywalled on private
repos) and [ADR-0046](../../docs/decisions/0046-studio-merge-deploy-cd.md) (merge→deploy CD).

> **This story is the first WORK-TRACKED home for two things that currently live only in CLAUDE.md
> prose + session memory:** (1) the **gate↔CI parity** invariant — that `pnpm gate` locally and the
> CI `verify` job enforce the SAME content checks except CI adds `pnpm -r build` and tests the
> *merge-with-main* ref (the recurring "local-green / CI-red" surprise); and (2) the **merge-ceremony
> discipline** (green unit → non-draft PR → CI auto-merges; never a manual `gh pr merge`). The
> `gate-ci-parity` capability below pins (1) into a checkable relationship; the ceremony (2) is the
> `session-orchestrator` operating discipline these caps mechanise. Neither has an ADR of its own —
> `gate-ci-parity` may warrant one (an owner escalation, flagged in its file and below).

## Design floor

- **One pipeline, one direction.** A unit reaches `main` exactly one way: a non-draft PR whose
  `verify` job goes green, auto-merged by CI. There is no second door — no manual `gh pr merge`, no
  status-only check that a human can wave through. Every gate below sits ON that one path.
- **Prove against the FUTURE main, not the branch.** `verify` runs on the **merge of branch + main**
  (GitHub's PR merge ref), so a unit is proven against the trunk it will actually land on — a clean
  branch can still fail on something that landed on `main` *after* it was cut. This is the load-bearing
  reason a green local `pnpm gate` does not guarantee a green CI.
- **The gate is content; the build is CI-only.** `pnpm gate` and CI enforce the same content
  invariants (manifest + CLAUDE.md/agents sync + typecheck + test); CI adds exactly `pnpm -r build`
  and the merge-ref. That delta is DECLARED and checkable (`gate-ci-parity`), not tribal knowledge.
- **Auto-merge is a consequence of green, never a decision.** A non-draft, non-`hold` PR merges the
  instant `verify` passes. Draft / `hold` is the only opt-out, and it is temporary — flip to ready on
  green. Humans approve by making the PR ready, not by clicking merge.
- **Landing has side effects, and they fail soft.** A merge retires the merged session's presence row
  (the SessionEnd-miss backstop) and — when the merge touched the studio — redeploys the live site.
  Neither side effect can fail the merge: presence is advisory (ADR-0033) and deploy runs only on
  `push:main`, never as a PR check.
- **Keyless throughout.** Every privileged step (presence-retire, deploy) authenticates via Workload
  Identity Federation (ADR-0021) — GitHub OIDC → the `github-actions` WIF pool → a least-privilege
  service account. No JSON key sits in a secret.

## Capabilities (7)

Listed roots-first (a capability appears after everything it depends on). The first three are
independent roots (the three orthogonal content gates `verify` runs); `gate-ci-parity` and
`auto-merge-on-green` build on `green-gate`; the two leaves add the post-merge side effects and each
reaches forward to a sibling story.

| # | capability | outcome | status | depends on |
|---|---|---|---|---|
| 1 | [`green-gate`](green-gate.md) | A PR's `verify` job proves it against the merge of branch+main — manifest, CLAUDE.md plus all four harness-native agent views in sync, typecheck, test, build — and a red anything blocks the merge. | proposed | — |
| 2 | [`repo-surface-manifest`](repo-surface-manifest.md) | `pnpm check:manifest` refuses any tracked root entry or loose doc not declared in `repo-manifest.json`, so ad-hoc junk can't merge. | proposed | — |
| 3 | [`adr-health-gate`](adr-health-gate.md) | Decision-binding hygiene on the dev-repo path: atomic ADR-number allocation + the full adr-health suite (frontmatter, edges, supersede, story-decisions, green-flip, number-uniqueness) reddens a PR, plus a cross-open-PR collision check. | proposed | — |
| 4 | [`gate-ci-parity`](gate-ci-parity.md) | The local `pnpm gate` and the CI `verify` invariant sets stand in one declared, checkable relationship (gate = CI − build, HEAD vs merge-ref); a stale-behind-main branch is surfaced. | proposed | `green-gate` |
| 5 | [`auto-merge-on-green`](auto-merge-on-green.md) | A non-draft, non-`hold` PR auto-merges the instant `verify` is green — never a manual merge. | proposed | `green-gate` |
| 6 | [`merge-presence-retire`](merge-presence-retire.md) | On merge, the merged session's presence row is authoritatively retired (the SessionEnd-miss backstop), keyless and fail-soft. | proposed | `auto-merge-on-green` |
| 7 | [`deploy-on-merge`](deploy-on-merge.md) | A studio-touching merge to `main` redeploys the live studio to Cloud Run — keyless WIF → Cloud Build image → `gcloud run deploy` with the full IAP posture. | proposed | `auto-merge-on-green` |

## Dependency graph

**Within-story** edges, read off the real pipeline (the `verify` → `automerge` job ordering in
`ci.yml` and the `push:main` trigger of `deploy-studio.yml`):

- `gate-ci-parity` → `green-gate` — parity is defined relative to the `verify` job's invariant set;
  it asserts the local-gate set equals that set minus `pnpm -r build`.
- `auto-merge-on-green` → `green-gate` — the `automerge` job `needs: verify` (`ci.yml:96`); it only
  runs after the gate is green.
- `merge-presence-retire` → `auto-merge-on-green` — the retire steps are part of the SAME `automerge`
  job, after the `gh pr merge` step (`ci.yml:130-183`); the merge IS the "work done" fact it acts on.
- `deploy-on-merge` → `auto-merge-on-green` — `deploy-studio.yml` triggers on the `push:main` the
  auto-merge creates (subject to the GITHUB_TOKEN no-cascade note recorded in that workflow).

**Cross-story boundary (ADR-0010 §4; direction per ADR-0058 §1, §3) — ci-cd's two OUTBOUND dependencies:**
- `merge-presence-retire` depends on the **`presence-store`** capability of
  [`stories/notice-board`](../notice-board/story.md): the retire writer (`ingest-merge.ts`) marks the
  merged session's `events.session` row done through that story's presence store seam — it needs that
  seam delivered to do its job.
- `deploy-on-merge` depends on the **`cloud-run-iap`** capability of
  [`stories/studio-cloud`](../studio-cloud/story.md): the deploy targets the Cloud Run + IAP service
  that capability stands up — it needs that target delivered to do its job.

By the direction rule (ADR-0058 §1) ci-cd needs both siblings' delivered outcomes to pass its own UAT
(steps 5–6), so it **depends on** them, and §3 rolls those capability-level boundary edges up to the
story's `depends_on: [studio-cloud, notice-board]`. This is **acyclic**: studio-cloud
(`depends_on: [studio, library]`) and notice-board (`depends_on: [library, drive-machinery]`) never
reach back to `ci-cd`, which has **zero inbound** edges. The earlier `depends_on: []` was a modelling
error — it conflated the (correctly-omitted) *inbound* "everything lands through here" reliance, a
process-axis fact, with these two real *outbound* dependencies. Note that **freshness is ci-cd's
outcome, not studio-cloud's**; counting it in both is exactly what produced the false "symbiotic
cycle" ADR-0058 §1 dissolves.

## UAT Test Criteria (would-be)

The integrated acceptance walkthrough that proves the whole `ci-cd` organism end-to-end: one
contributor takes one green, **studio-touching** unit from a non-draft PR all the way to a fresh live
site — so the single journey exercises the entire chain, caps 6 and 7 included. (Greenfield: no
scripted UAT exists yet; this is the would-be walkthrough.)

**Goal —** A contributor finishes a green, studio-touching unit, opens a non-draft PR, and walks
away — CI proves it against the future main, lands it, retires their presence, and serves the change
on the live studio, with no manual merge and no terminal step after the push.

1. **Open non-draft:** the contributor's local `pnpm gate` is green; they push a `claude/*` branch
   touching `apps/studio/**` and open a **non-draft** PR (no `hold` label). **Success —** the PR
   exists; `gh pr checks` shows `verify` queued — the only door is this one PR.
2. **Prove against future main:** `verify` runs on the **merge of branch+main** and all three content
   gates hold green — `check:manifest` (no stray root surface), `check:claude` + `check:agents` (no
   generated-view drift), `adr-number-unique` + the cross-PR collision check (no duplicate ADR
   number) — then `typecheck`, `test`, and `build`. **Success —** `verify` is green; had the branch
   been behind `main` such that the merge-ref broke, the gate would be RED here, not on the branch.
3. **Parity holds:** the contributor's local `pnpm gate` (which omits `pnpm -r build` and runs on
   HEAD, not the merge-ref) enforced exactly the CI content set minus build — so local-green
   predicted CI-green for everything except the build/merge-ref delta. **Success —** the declared
   `gate = CI − build` relationship held; no surprise red in a check the local gate also runs.
4. **Auto-merge on green:** because the PR is non-draft and unlabelled, the `automerge` job (`needs:
   verify`) runs `gh pr merge --merge --delete-branch`. **Success —** the unit is on `main`, the
   branch is deleted, and no human ran `gh pr merge`.
5. **Presence retires:** in the same `automerge` job, the fail-soft retire steps run `ingest-merge.ts`
   under keyless WIF and mark the merged session's `events.session` row done (forward edge →
   notice-board `presence-store`). **Success —** the session's wisp leaves the active board; a
   GCP/DB hiccup here would have been swallowed (`continue-on-error`), never failing the merge.
6. **Live site is fresh:** because the merge touched `apps/studio/**`, `deploy-studio.yml` runs on
   `push:main` — keyless WIF → Cloud Build image (short-SHA tag) → `gcloud run deploy` with the full
   IAP + runtime-SA + env-var posture (forward edge → studio-cloud `cloud-run-iap`) — and the smoke
   check confirms the newest revision is the newest Ready one. **Success —** the live studio serves
   the contributor's change; the rollout took (latest-ready == latest-created). *(Honest caveat: an
   auto-merged PR's `push:main` does not cascade from the GITHUB_TOKEN merge — see
   `deploy-on-merge`'s `manual-or-dispatch-trigger` contract; the on-demand `gh workflow run` /
   owner-merge path is what fires it today.)*
7. **Nothing unproven landed:** at rest, `main` contains exactly the proven unit; no draft, no
   `hold`, no red check was ever waved through. **Success —** every commit on `main` traces to a
   green `verify` run.

## Open modeling calls (for the owner)

Surfaced rather than guessed — plain files, cheap to revise.

1. **`gate-ci-parity` has no deciding ADR (escalation).** It is the only genuinely NEW capability
   here — the recurring "local-green / CI-red" friction lives today only in CLAUDE.md prose and
   session memory. I authored it regardless (the friction is real and stranded three PRs at once per
   CLAUDE.md), but the parity invariant — *what the local gate is contractually allowed to differ
   from CI by* — is arguably an architectural decision that deserves its own ADR. **Call:** record
   gate↔CI parity as an ADR (and add it to this story's `decisions:`), or leave it as a
   capability-level contract. I did not pick a number (no `storytree adr new` from this authoring
   role); flagging for the owner / orchestrator.
2. **RESOLVED (owner, 2026-06-15 — [ADR-0058](../../docs/decisions/0058-cross-story-dependency-direction-the-no-cycle-rule-and-the-b.md)).**
   The earlier "trunk with two forward leaf edges" framing was a modelling error. By the
   dependency-direction rule (ADR-0058 §1) ci-cd needs both sibling surfaces delivered to pass its own
   UAT, so it **depends on** them — `depends_on` is now `[studio-cloud, notice-board]`, and ci-cd is
   the delivery *process*, not a trunk (its "everything rides on it" universality is a process axis
   the DAG does not encode, §2). The owner kept deploy + retire IN ci-cd (Model A — one cohesive
   pipeline) rather than re-homing them to the targets; the apparent ci-cd↔studio-cloud cycle was an
   artifact of double-counting "stay fresh," which is ci-cd's outcome alone (§1). Verified acyclic
   globally.
3. **`green-gate`'s invariant set is broader than the original spec named.** The live `verify` job
   runs `check:manifest` + `check:claude` + **`check:agents`** (ADRs 0052/0178/0234: the same
   delegatable Library population rendered to `.claude/agents`, `.cursor/agents`, `.codex/agents`,
   and Gemini CLI's native `.gemini/agents`) + `typecheck` + `test` + `build` — i.e. there are now
   THREE generated-view/surface gates, not the two (`manifest` + `claude`) the scope brief named. I
   grounded `green-gate` and `gate-ci-parity` in what the file actually runs (including
   `check:agents`). The Gemini view inherits its parent Gemini CLI session's model/tools; this
   projection makes no Antigravity compatibility claim.
4. **Status stays `proposed` (greenfield, like notice-board).** This machinery is live and working,
   but it has never been driven through storytree's own prove-it-gate red→green, and per ADR-0031
   authored status is a projection of signed verdicts, not of "it works in prod." Confirm `proposed`
   for the whole story (the honest call) rather than `mapped` — the CI workflows have no offline
   `node:test` suite the way the library tier does, so even `mapped` would over-claim.
