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
# Deciding ADRs (ADR-0037 §2): the green gate + auto-merge (22), the repo-surface manifest gate's retirement (311),
# decision binding + adr-health (37), the ADR-number allocator (50), session presence the retire
# backstop serves (33), the display posture it heals (41), studio CD (46), keyless WIF auth (21),
# the dependency-direction / no-cycle model that fixed this story's edges (58), and the fourth
# harness-native generated agent view covered by check:agents — Gemini CLI (234).
decisions: [22, 311, 37, 50, 33, 41, 46, 21, 58, 234]
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
deciding ADRs are ADR-0022 (the green gate +
auto-merge-on-green, inside free Actions because GitHub-native auto-merge is paywalled on private
repos) and ADR-0046 (merge→deploy CD).

> **This story is the first WORK-TRACKED home for two things that currently live only in CLAUDE.md
> prose + session memory:** (1) the **gate↔CI parity** invariant — that `pnpm gate` locally and the
> CI `verify` job share a content floor of eight checks, while CI adds `pnpm -r build`, the PR-only
> merged-branch guard, the web-submodule checkout, affected-scope selection and the *merge-with-main*
> ref, and the local plan adds `check:verification-decay` (the recurring "local-green / CI-red" surprise
> lives in that two-way delta); and (2) the **merge-ceremony
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
- **The gate and CI share a content floor; each keeps steps the other does not.** They overlap on
  EIGHT checks — `check:boundaries`, `check:mirror-conformance`, `check:web-grounding`,
  `check:web-engine`, typecheck, test, `check:guidance`, `check:agents`. CI additionally runs
  `pnpm -r build`, the PR-only merged-branch guard, the pinned web submodule checkout, affected-scope
  selection, and the merge-ref; the local plan additionally runs
  `check:verification-decay`. So it is a two-way delta, **not** "gate = CI − build" — that older
  equality was true once and is not now. The relationship is DECLARED and checkable
  (`gate-ci-parity`), not tribal knowledge, and the two lists are read from their own sources: CI's
  from [`ci.yml`](../../.github/workflows/ci.yml), the local plan's from `GATE_PLAN` in
  [`packages/cli/src/gate-order.ts`](../../packages/cli/src/gate-order.ts) — never from the root
  `gate` script's text, which is now just the runner invocation and names zero steps, so any
  substring test against it is vacuous.
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
| 1 | [`green-gate`](green-gate.md) | A PR's `verify` job proves it against the merge of branch+main — organism boundaries, cross-surface mirror conformance, the two web checks, typecheck, test, build, and root CLAUDE.md + AGENTS.md plus all four harness-native specialist agent views in sync — and a red anything blocks the merge. | proposed | — |
| 2 | [`repo-surface-manifest`](repo-surface-manifest.md) | `pnpm check:manifest` refuses any tracked root entry or loose doc not declared in `repo-manifest.json`, so ad-hoc junk can't merge. | proposed | — |
| 3 | [`adr-health-gate`](adr-health-gate.md) | Decision-binding hygiene on the dev-repo path: atomic ADR-number allocation + the full adr-health suite (frontmatter, edges, supersede, story-decisions, green-flip, number-uniqueness) reddens a PR, plus a cross-open-PR collision check. | proposed | — |
| 4 | [`gate-ci-parity`](gate-ci-parity.md) | The local `pnpm gate` and the CI `verify` invariant sets stand in one declared, checkable relationship — a shared content floor of eight checks, a two-way content delta (CI keeps steps the local plan does not, and the local plan keeps one CI does not), and HEAD vs merge-ref; a stale-behind-main branch is surfaced. | proposed | `green-gate` |
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

## UAT Test Criteria

The adopted acceptance walkthrough keeps the surviving original positions and their semantic roles, but
binds each one to the exact standing seam that exists today. All are machine-observable:
none asks for an aesthetic or owner-value judgment, so none is labelled `human` merely because the
faithful live run would be expensive or external (ADR-0106 / ADR-0184). The commands below prove the
repository-owned mechanics and workflow posture. They do not pretend to audit GitHub branch-protection
settings or to perform a fresh Cloud Run rollout. *(This paragraph read "the original seven positions"
and "All seven" until 2026-08-21; leg 1 was deleted that day, so six remain and the list below starts
at 2 — a burned ordinal is never reused and no survivor is ever renumbered.)*

> **ADR-0294 D2 pass — 2026-08-21.** Two legs were examined against the discriminator D2 actually
> requires — *read the suite; the binding is not the proof* — and what the reading found was not
> duplication but a DEAD SUBJECT. Both `ci-cd#gate-1` and `ci-cd#gate-7` invoke
> `pnpm --filter @storytree/drive exec node --import tsx --test src/landing-deps.test.ts`, and **that
> file does not exist.** Measured on this tree: the command exits non-zero with
> `Could not find 'src/landing-deps.test.ts'`. It is not missing by accident —
> `apps/desktop/src/backend/landing-surface-retired.test.ts`, test `lsr-modules-deleted`, ASSERTS that
> `packages/drive/src/landing-deps.ts` and `packages/drive/src/landing-deps.test.ts` stay deleted,
> because ADR-0175
> retired the landing surface along with the interactive in-app orchestrator (ADR-0174). The census
> that scoped this pass reported `bound-but-gate-missing: 0`, and that stays true — every binding
> resolves to a DECLARED gate. What it did not check, and what this pass did, is whether the declared
> gate's COMMAND can run.
>
> - **Leg 1 ("Open non-draft") was DELETED, and its claim is WITHDRAWN rather than relocated.** It
>   exercised `runGate` / `openLandingPr` / `pollPrChecks` — the contributor-side landing dependency
>   composition — which ADR-0175 retired and which no longer exists in any package. There is no
>   lower-tier node to name because there is no subject left to prove: a criterion asserting the
>   behaviour of deleted code is satisfied by nothing and falsified by nothing. Its ordinal
>   `ci-cd#uat-1` is BURNED and recorded `superseded` in
>   [`stories/uat-legacy-dispositions.json`](../uat-legacy-dispositions.json). It carried `proven=–`
>   (no signed verdict) and no `(detail:)` pointer, so nothing was destroyed or orphaned. **Reliability
>   gate 1 STAYS** — gate ids are positional and deleting one silently re-points signed verdicts and
>   surviving bindings — and is now both unclaimed AND un-runnable; its entry below says so in place of
>   pretending otherwise.
> - **Leg 7 was NOT deleted — it was NARROWED to the half that is still true.** Its first clause
>   ("contributor-side landing code opens and observes a PR but cannot merge it") died with the same
>   retirement and was vacuous, not merely unproven. Its second clause — that the repository-owned
>   `gh pr merge` occurs EXACTLY ONCE and that occurrence is in `automerge`, downstream of `verify` —
>   is live, is asserted by gate 7's own inline audit, and is proven NOWHERE else: gate 4 checks that
>   the automerge seam CONTAINS `gh pr merge`, never that no SECOND merge door exists. Deleting the leg
>   would have deleted a live claim to reach a number, which ADR-0294 D5 forbids. Gate 7's dead first
>   half (the `landing-deps.test.ts` invocation) was removed from its command so the binding can
>   actually run; its ordinal, its criterion identity and the gate itself are untouched. **Making it
>   runnable immediately exposed a SECOND red the first was hiding** — the live half counted raw
>   substring occurrences of `gh pr merge` in `ci.yml` and found FOUR, three of them in comments
>   ABOUT the command. That is a defect in the assertion, not a finding about the workflow, and it
>   was fixed in the same change by stripping whole-line YAML comments before counting. Recorded
>   here because a short-circuiting `&&` is how a live assertion goes years without ever executing.
>
> **The other five legs were not D2 candidates and were not touched.** Legs 2, 3, 4 and 6 are bespoke
> inline `node --input-type=module -e` audits of `.github/workflows/ci.yml`,
> `.github/workflows/deploy-studio.yml` and the `GATE_PLAN` literal — repository-owned evidence no
> capability test asserts. Leg 5 is a compound command: a focused notice-board suite AND an inline
> workflow-wiring audit, so the capability rung proves only half of it.

**Goal —** A contributor finishes a green, studio-affecting unit and hands it to the repository-owned
landing path; that path proves the merge candidate, lands only after green, clears
the branch's coordination claim, and dispatches the keyless Studio deployment. *(The goal read "…
that path opens a ready PR, proves the merge candidate …" until 2026-08-21. The repository no longer
owns any PR-OPENING code — ADR-0175 retired it — so that clause named a step this story cannot
witness. Opening the PR is now the session's own ceremony, not a repository seam.)*


2. **Prove the merge candidate.** _(witness: machine)_ _(proof-gate: ci-cd#gate-2)_ Audit the real _(criterion-id: uatc_012819fb72fb3003e1873509)_ _(revision-id: uatr1:102ad02d7c173346)_
   `verify` job definition. **Success —** PRs into `main` use checkout's merge candidate and the job
   retains the collision/merged-branch guards, manifest/boundary/generated-view/web checks, conservative
   affected-or-full typecheck and test selection, and the unconditional Studio build; `automerge`
   still declares `needs: verify`.
3. **The local/CI delta is explicit.** _(witness: machine)_ _(proof-gate: ci-cd#gate-3)_ Compare the _(criterion-id: uatc_0f5aacd3f9ee77943bbae299)_ _(revision-id: uatr1:c4fdfe0078bbbad1)_ _(previous-revision-id: uatr1:374cc8729191baa0)_
   root `gate` script with the real `verify` definition. **Success —** their shared blocking floor is
   present in both, while the current deliberate differences remain visible: CI adds its PR-only guard,
   merge-ref execution, affected selection, web checkout, and build; local gate adds its live/advisory
   health tails. This is the honest current relationship, not the obsolete claim that build is the
   only difference.
4. **Auto-merge on green.** _(witness: machine)_ _(proof-gate: ci-cd#gate-4)_ Audit the real _(criterion-id: uatc_68ad91538c34aa3b6d77347d)_ _(revision-id: uatr1:e503bbee33db19bc)_
   `automerge` job. **Success —** it needs `verify`, admits only a pull request that is non-draft and
   lacks `hold`, and its sole merge command uses `--merge --delete-branch`, preserving ancestry.
5. **Merged coordination claims retire.** _(witness: machine)_ _(proof-gate: ci-cd#gate-5)_ Drive _(criterion-id: uatc_97ca2fdf0d8a83081b3f6cbf)_ _(revision-id: uatr1:333f88e67365ba72)_
   the branch-claim release seam and audit its workflow wiring. **Success —** the full merged branch
   name reaches `releaseClaimsByBranch`; zero claims are a clean no-op; store failure is swallowed;
   and the keyless WIF/install/writer steps remain `continue-on-error`. This is the current
   notice-board ledger boundary after `events.session` presence retired under ADR-0200.
6. **The Studio deployment handoff is complete.** _(witness: machine)_ _(criterion-id: uatc_321b38ce5a608bd7f1a19307)_ _(revision-id: uatr1:b2e22376de7cd044)_
   _(proof-gate: ci-cd#gate-6)_ Audit both workflow definitions. **Success —** the automerge job
   loudly dispatches `deploy-studio.yml` on `main` for the declared Studio-affecting path set, and the
   deploy workflow retains keyless WIF, Cloud Build with a short-SHA tag, the full runtime-SA/IAP/env
   posture, serialized rollouts, and the newest-created-equals-newest-ready smoke assertion.
7. **The repository-owned path has no unproven merge door.** _(witness: machine)_ _(criterion-id: uatc_411c12c77343632e71b22770)_ _(revision-id: uatr1:c73722a2587b8c0e)_ _(previous-revision-id: uatr1:a18801a48f50864c)_
   _(proof-gate: ci-cd#gate-7)_ Audit the workflow's only merge command. **Success —** the
   repository-owned `gh pr merge` occurrence count in `.github/workflows/ci.yml` is EXACTLY ONE, that
   one is in `automerge`, and `automerge` still declares `needs: verify` — so no second merge door can
   be added anywhere in the repository-owned path without failing this leg. This proves the in-repo
   rail; GitHub administrator settings remain an external operational control, not a fact this
   repository can honestly attest.

## Reliability Gates

1. **~~The ready-PR landing seam is green~~ — DEAD COMMAND, kept only so no later gate is renumbered**
   _(gate: observe)_
   `pnpm --filter @storytree/drive exec node --import tsx --test src/landing-deps.test.ts`.
   **This command CANNOT RUN and must not be believed.** Measured 2026-08-21: it exits non-zero with
   `Could not find 'src/landing-deps.test.ts'`, because
   ADR-0175
   retired the contributor-side landing surface with the interactive in-app orchestrator (ADR-0174) and
   `apps/desktop/src/backend/landing-surface-retired.test.ts` (`lsr-modules-deleted`) now ASSERTS that
   `packages/drive/src/landing-deps.ts` and `landing-deps.test.ts` stay deleted. Its criterion (story
   UAT leg 1) was deleted on 2026-08-21 under ADR-0294 D2 as a withdrawn claim, and this gate is now
   UNCLAIMED. It is left in place — and left un-repaired — for one reason only: `reliabilityGateId`
   mints `<story>#gate-<n>` from POSITION, so removing it would renumber gates 2–7 and silently
   re-point every already-signed verdict and every surviving `(proof-gate:)` binding onto a different
   gate, with nothing reporting the change. *(It previously read "This dedicated integration file
   proves the independent surfaces: real gate exit-code mapping; the PR-opening call's internal
   commit → push → non-draft PR sequence and fail-closed step exits; PR URL parsing; and non-blocking
   `verify` rollup classification." Every one of those surfaces is gone.)* **Do not mint a replacement
   gate here** (ADR-0097 §2): if the repository ever grows a new repository-owned landing seam, that
   seam earns proof at its own capability first.
2. **The verify workflow keeps its hard merge-candidate floor** _(gate: observe)_
   `node --input-type=module -e "import fs from 'node:fs';const c=fs.readFileSync('.github/workflows/ci.yml','utf8');for(const s of ['pull_request:','branches: [main]','uses: actions/checkout@v6','Merged-branch guard (a branch dies on merge)','run: pnpm check:boundaries','run: pnpm check:mirror-conformance','run: pnpm check:web-grounding','run: pnpm check:web-engine','Affected scope (PRs only)','- name: Typecheck','- name: Test','run: pnpm -r build','run: pnpm check:guidance','run: pnpm check:agents','needs: verify'])if(!c.includes(s))throw new Error('missing verify seam: '+s)"`.
   The command reads the landed workflow itself and fails on removal of any named standing seam. The
   named checks are a FLOOR, not the complete list the job runs today (ADR-0336 added a tenth,
   `check:web-experience-closure`, not named here); `check:manifest` and `check:web-experience` were
   removed from this list when ADR-0311 D2 retired them, because a seam-presence gate that names a
   retired rung reds on the retirement itself rather than on drift.
   *(Corrected in place 2026-08-23, same rule: `'ADR number collision (open PRs)'` left this list —
   and gate 3's CI-only delta list — because **ADR-0403 dec 1 deleted the step**. Decisions are
   Postgres rows now, so there is no `docs/decisions/**` for two open PRs to collide on; `ci.yml`'s
   own comment records the deletion at the spot the step stood. Both gates were RED on this string
   and NOBODY SAW IT: until ADR-0421 the spine could not execute a `node -e "…"` command at all, so
   the gate had never once been observed either way.)*
3. **The current local/CI relationship is declared** _(gate: observe)_
   `node --input-type=module -e "import fs from 'node:fs';const src=fs.readFileSync('packages/cli/src/gate-order.ts','utf8');const i=src.indexOf('export const GATE_PLAN');if(i<0)throw new Error('GATE_PLAN literal not found');const end=src.indexOf('];',i);if(end<0)throw new Error('GATE_PLAN literal unterminated');const plan=src.slice(i,end);const planN=plan.replace(/\s+--[a-z][a-z-]*/g,'');const c=fs.readFileSync('.github/workflows/ci.yml','utf8');for(const s of ['check:boundaries','check:mirror-conformance','check:web-grounding','check:web-engine','check:guidance','check:agents'])if(!plan.includes(s)||!c.includes(s))throw new Error('shared gate seam drifted: '+s);for(const s of ['pnpm -r typecheck','pnpm -r test'])if(!planN.includes(s))throw new Error('shared expensive leg missing from GATE_PLAN: '+s);for(const s of ['- name: Typecheck','- name: Test'])if(!c.includes(s))throw new Error('shared expensive leg missing from verify: '+s);for(const s of ['pnpm -r build','Merged-branch guard (a branch dies on merge)','Affected scope (PRs only)'])if(!c.includes(s)||plan.includes(s))throw new Error('CI-only delta drifted: '+s);if(!plan.includes('check:verification-decay')||c.includes('check:verification-decay'))throw new Error('local-only delta drifted: check:verification-decay')"`.
   It reads the local gate's real step list from the `GATE_PLAN` literal in
   `packages/cli/src/gate-order.ts` — **never** from `package.json`'s `gate` script, which since
   2026-08-04 is just the runner invocation (`… src/gate-run.ts`) and names zero steps, so every
   substring assertion against its text passes vacuously. Slicing to the literal is what keeps the
   `plan.includes(…)` negatives honest: the same file also declares `RETIRED_CHECKS`, so a whole-file
   search would find `check:manifest` and report a retired rung as live. The assertions are the
   two-way relationship, not the obsolete "gate = CI − build" equality: the eight shared checks are
   present in both, `pnpm -r build` + the PR-only merged-branch guard + affected selection are present in CI
   and absent from the plan, and `check:verification-decay` is present in the plan and absent from
   CI — each direction asserted BOTH ways, so a step migrating between them fails here.
   *(Corrected in place 2026-08-21, ADR-0139. This gate was RED on `main` and had been since
   ADR-0276 increment 4. It asserted the literals `pnpm -r typecheck` / `pnpm -r test` against the
   `GATE_PLAN` literal, which now declares `pnpm -r --no-bail typecheck` / `pnpm -r --no-bail test`,
   so `plan.includes(…)` was false and the command exited 1 with `shared expensive leg missing from
   GATE_PLAN: pnpm -r typecheck` — exactly the drift-on-its-own-flags failure gate 2's prose above
   warns about. The two literals are KEPT as the declared floor; the plan text is now normalised
   through `planN` (long flags stripped) before they are matched, so adding or removing a flag on a
   shared leg no longer reds a gate that is about WHICH legs are shared, not how they are invoked.
   Verified red-then-green by extracting this exact command from the story and running it: exit 1 on
   `origin/main`, exit 0 here.)*
4. **The green-only non-squash automerge rail is present** _(gate: observe)_
   `node --input-type=module -e "import fs from 'node:fs';const c=fs.readFileSync('.github/workflows/ci.yml','utf8');for(const s of ['automerge:','needs: verify','github.event.pull_request.draft == false','!contains(github.event.pull_request.labels.*.name','hold','gh pr merge','--merge','--delete-branch'])if(!c.includes(s))throw new Error('automerge seam drifted: '+s)"`.
   The audit is structural and deterministic; it does not claim to create a live PR.
5. **Merged branch claims release fail-soft** _(gate: observe)_
   `pnpm --filter @storytree/notice-board exec node --import tsx --test src/store/ingest-merge.test.ts && node --input-type=module -e "import fs from 'node:fs';const c=fs.readFileSync('.github/workflows/ci.yml','utf8');for(const s of ['Authenticate to GCP (keyless WIF','continue-on-error: true','STORYTREE_MERGED_HEAD_REF','pnpm --filter @storytree/notice-board exec tsx src/store/ingest-merge.ts'])if(!c.includes(s))throw new Error('claim-retire wiring drifted: '+s)"`.
   The focused suite proves the writer's release/no-op/swallow boundaries; the audit pins the
   repository-owned keyless fail-soft composition around it.
6. **The dispatch and keyless deploy posture are present** _(gate: observe)_
   `node --input-type=module -e "import fs from 'node:fs';const c=fs.readFileSync('.github/workflows/ci.yml','utf8'),d=fs.readFileSync('.github/workflows/deploy-studio.yml','utf8');for(const s of ['actions: write','gh workflow run deploy-studio.yml --ref main','apps/studio/','packages/','docs/','stories/'])if(!c.includes(s))throw new Error('deploy dispatch drifted: '+s);for(const s of ['workflow_dispatch:','cancel-in-progress: false','google-github-actions/auth@v3','storytree-studio-deployer@','gcloud builds submit','git rev-parse --short HEAD','gcloud run deploy','--service-account','--set-env-vars','--no-allow-unauthenticated --iap','latestReadyRevisionName','latestCreatedRevisionName'])if(!d.includes(s))throw new Error('deploy posture drifted: '+s)"`.
   This is a standing workflow/posture proof, not a fabricated fresh deployment.
7. **Only verified CI owns the merge command** _(gate: observe)_
   `node --input-type=module -e "import fs from 'node:fs';const code=fs.readFileSync('.github/workflows/ci.yml','utf8').replace(/^[^\n\S]*#.*$/gm,'');if((code.match(/gh pr merge/g)||[]).length!==1)throw new Error('repository-owned merge-command count drifted');if(!code.includes('needs: verify'))throw new Error('automerge lost verify dependency')"`.
   This deliberately proves only the repository-owned path; external branch-policy configuration is
   a residual live control. **The command was REPAIRED TWICE on 2026-08-21, and the second repair
   uncovered a red that the first was hiding.**
   (1) It opened
   `pnpm --filter @storytree/drive exec node --import tsx --test src/landing-deps.test.ts && …`, and
   that file has not existed since ADR-0175 retired the landing surface, so the whole gate exited
   non-zero on `Could not find 'src/landing-deps.test.ts'` before its live half ever ran.
   (2) With the dead half removed, the live half went RED on its first honest execution: the raw
   substring count of `gh pr merge` in `ci.yml` is **four**, not one — line 316 is the real command,
   and lines 34, 303 and 325 are COMMENTS discussing it. The assertion was counting prose. It now
   strips whole-line YAML comments before counting, the same move
   `apps/desktop/src/backend/landing-surface-retired.test.ts` already makes with its `code()` helper
   for exactly this reason ("a PROSE mention … never counts as live wiring"). Verified on this tree:
   4 raw occurrences, 1 after stripping, and `needs: verify` still present. The CLAIM is unchanged —
   exactly one repository-owned merge command, in `automerge`, downstream of `verify`. Both are
   REPAIRS of a binding that could not honestly run, not a new gate (ADR-0097 §2): the gate's
   ordinal, its kind and its criterion are untouched.

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
2. **RESOLVED (owner, 2026-06-15 — ADR-0058).**
   The earlier "trunk with two forward leaf edges" framing was a modelling error. By the
   dependency-direction rule (ADR-0058 §1) ci-cd needs both sibling surfaces delivered to pass its own
   UAT, so it **depends on** them — `depends_on` is now `[studio-cloud, notice-board]`, and ci-cd is
   the delivery *process*, not a trunk (its "everything rides on it" universality is a process axis
   the DAG does not encode, §2). The owner kept deploy + retire IN ci-cd (Model A — one cohesive
   pipeline) rather than re-homing them to the targets; the apparent ci-cd↔studio-cloud cycle was an
   artifact of double-counting "stay fresh," which is ci-cd's outcome alone (§1). Verified acyclic
   globally.
3. **`green-gate`'s invariant set moves, and this entry has now been wrong in BOTH directions.** It
   once read "there are now THREE generated-view/surface gates, not the two the scope brief named" —
   counting `check:manifest` + `check:guidance` + `check:agents`. That is stale: ADR-0311 D2 retired
   `check:manifest` outright (declared in `RETIRED_CHECKS` in
   [`packages/cli/src/gate-order.ts`](../../packages/cli/src/gate-order.ts); it is no longer a root
   script and no longer a `verify` step), leaving **TWO** generated-view gates — `check:guidance`
   (ADRs 0051/0291: the canonical `session-orchestrator` rendered to root CLAUDE.md + AGENTS.md) and
   `check:agents` (ADRs 0052/0178/0234: the same delegatable Library population rendered to
   specialist `.claude/agents`, `.cursor/agents`, `.codex/agents`, Gemini CLI's native
   `.gemini/agents`, and OpenCode's `.opencode/agent`). The live `verify` job's full content set is the NINE listed in `green-gate`.
   The Gemini view inherits its parent Gemini CLI session's model/tools; this projection makes no
   Antigravity compatibility claim. **The standing lesson, not the count:** a spec that enumerates
   gate steps goes false every time the gate is re-decided, so `green-gate` now points at
   [`ci.yml`](../../.github/workflows/ci.yml) as the live list and contracts the INVARIANT (no step
   is soft) rather than the membership.
4. **Status stays `proposed` (greenfield, like notice-board).** This machinery is live and working,
   but it has never been driven through storytree's own prove-it-gate red→green, and per ADR-0031
   authored status is a projection of signed verdicts, not of "it works in prod." Confirm `proposed`
   for the whole story (the honest call) rather than `mapped` — the CI workflows have no offline
   `node:test` suite the way the library tier does, so even `mapped` would over-claim.
5. **`repo-surface-manifest` describes a capability that no longer exists (escalation).** Verified
   on the bytes: `check:manifest` is retired by ADR-0311 D2 — it is not a step in `ci.yml`'s
   `verify` job, it is not a script in the root `package.json`, and it is declared in
   `RETIRED_CHECKS` in [`packages/cli/src/gate-order.ts`](../../packages/cli/src/gate-order.ts). The
   capability's whole outcome ("`pnpm check:manifest` refuses any tracked root entry or loose doc not
   declared in `repo-manifest.json`") is therefore a claim about a gate that does not run. Two
   partial survivals complicate the obvious answer, which is why this is surfaced rather than
   guessed: `scripts/check-manifest.mjs` and `repo-manifest.json` are both still on disk, and
   `repo-manifest.json` has acquired a **second, live** role as the ownership map that
   `storytree write-authority install --write` derives the ADR-0255/ADR-0284 write-authority deny
   block from — so the FILE is load-bearing even though the GATE is not. **Call:** retire the
   capability, re-scope it to the surviving write-authority role (which is arguably a different
   story's organ), or re-wire the gate under ADR-0311 D5's fresh-evidence bar. Retiring or
   re-scoping a capability is a structural call I do not make unilaterally; I left the file
   untouched.
6. **RESOLVED (owner-directed, 2026-08-07).** `gate-ci-parity`'s contract 1 —
   `declared-content-delta-is-exactly-build` — asserted that the local gate's content-check set
   equals the CI `verify` set minus `pnpm -r build`, "the single declared constant `{pnpm -r build}`
   — nothing else." Verified false: the delta is **two-way**. CI-only are `pnpm -r build`, the two
   PR-only merged-branch guard, the pinned web-submodule checkout and
   affected-scope selection; local-only is `check:verification-decay`. Established in PR #1204 (main
   `fc4c0246`) and re-verified against the `GATE_PLAN` literal in
   [`packages/cli/src/gate-order.ts`](../../packages/cli/src/gate-order.ts) and the `verify` job in
   [`ci.yml`](../../.github/workflows/ci.yml). **Decided:** re-state it as ONE two-way contract,
   renamed `declared-content-delta-is-two-way` — **not** split one contract per direction. The
   reason worth recording: both directions are read from the SAME two sources in a single pass, so
   one isolated test proves the whole relationship, and Reliability Gate leg 3 above already asserts
   both directions in one command — one contract mirrors the proof shape that exists. The
   capability's title, frontmatter `outcome`, body Outcome paragraph and contract 2's caveat clause
   were brought into line, as was row 4 of the capabilities table above; the capability stays at
   three contracts.
