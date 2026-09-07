---
id: "ci-claim-corroborate"
tier: capability
story: ci-cd
title: "CI corroboration — a check running right now is the one liveness signal a session cannot fake by existing"
outcome: "While a branch is still working — a check running on it right now, or a very recent push — its claims are corroborated live on the ledger by a keyless CI writer that admits those two readings and nothing broader."
status: proposed
proof_mode: integration-test
# Cross-story forward edge (ADR-0010 §4): stamps through notice-board's claim-store seam, the same
# `events.node_claim` ledger `merge-presence-retire` releases through. Rolled up to the story's
# `depends_on: [studio-cloud, notice-board]` per ADR-0058 §3 — not repeated here.
#
# WITHIN-STORY `depends_on` IS EMPTY, and the two edges a reader will reach for are both FALSE on the
# `cross-story-dependency` test run literally, both ways:
#   - NOT `auto-merge-on-green`. `merge-presence-retire` depends on it because the MERGE is the fact
#     it acts on. This capability acts on the OPPOSITE fact — that a branch's work is still going —
#     and its workflow deliberately refuses the default branch, so a merge is the one event it must
#     not read. It needs no merge to have happened to pass its own proof.
#   - NOT `green-gate`. It needs workflow RUNS TO EXIST as GitHub objects it can query — a repository
#     fact — never green-gate's delivered outcome (that a red blocks the merge) consumed through
#     green-gate's boundary. It stamps identically for a green run and a red one, because a red run
#     is equally evidence someone is at the keyboard. This is exactly the reasoning that removed the
#     `gate-ci-parity` → `green-gate` bullet from this story's Dependency graph as FALSE, and it is
#     the same shared-subject/definitional relationship the DAG does not encode.
# The relationship to `merge-presence-retire` is COORDINATION between two writers of one column, not
# consumption: the `default-branch` fence exists so the two cannot contradict each other over one
# merge. Neither needs the other's outcome. So this is a fourth independent root, and ci-cd keeps its
# zero inbound edges.
depends_on: []
# ADOPTION BASIS (ADR-0465 D2/D4), declared spec-borne per ADR-0057. NO `real:` arm — by the time
# this spec lands the code and its tests exist, so there is no red to observe. Which file exercises
# which contract:
# 1 `a-running-check-or-a-fresh-push-corroborates-its-branch` — `ci-corroboration.test.ts`
#   (`branchFromRef` on both spellings; `planCorroboration` admitting a push and a running check,
#   keying on the FULL branch, keeping the NEWEST reading, and the running-check tie-break) plus
#   `ingest-ci-activity.test.ts` (`observeInProgressRuns` turning EVERY running run's `head_branch`
#   into a reading, `observeRef` stamping the pushed ref with OUR clock).
# 2 `false-freshness-is-refused-and-named` — `ci-corroboration.test.ts`, one test per refused shape
#   plus the `at now` boundary case and `renderCorroboration`'s whole pinned report.
# 3 `the-branch-stamp-only-moves-liveness-forward` — `claim-store.test.ts` for the statement SHAPE
#   against the fake client, and `claim-store-branch-activity.live.test.ts`
#   (`narrow-ci-corroboration-stamps-the-branch`) for the two SQL predicates and the qualified
#   `RETURNING` list against a real Postgres. The live file is DB-gated on `STORYTREE_DB_NAME` and
#   SKIPS in the offline package suite by design — see contract 3, which names that split rather than
#   letting the offline half read as the whole proof.
# 4 `the-broad-form-has-no-door-to-arrive-through` — `ci-corroboration.test.ts` ("THE BROAD FORM IS
#   REFUSED AT RUNTIME, not only by the type") plus `ingest-ci-activity.test.ts` (`inProgressRunsUrl`
#   asks for in-progress runs "and nothing else"; the ONLY request made is never a pull-request one;
#   the YAML audit that the workflow WITHHOLDS `pull-requests`).
# 5 `the-corroborator-fires-on-its-own-triggers-and-runs-only-mains-tree` and
# 6 `a-store-failure-is-loud-and-a-github-outage-is-not` — `ingest-ci-activity.test.ts`, which drives
#   the entry against a fake store AND audits the real `.github/workflows/claim-corroborate.yml`, the
#   same writer-plus-workflow-audit shape `ingest-merge.test.ts` already uses.
# All four files sit under `packages/notice-board/src/`, so the one declared command runs every one.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/notice-board", "test"]
  scope:
    testGlobs:
      - "packages/notice-board/src/ci-corroboration.test.ts"
      - "packages/notice-board/src/store/ingest-ci-activity.test.ts"
      - "packages/notice-board/src/store/claim-store-branch-activity.live.test.ts"
    sourceGlobs:
      - "packages/notice-board/src/ci-corroboration.ts"
      - "packages/notice-board/src/store/ingest-ci-activity.ts"
  # ADR-0353's READ-ONLY coverage surface: where the rest of this capability's contract evidence
  # lives. Contract 3's offline half is asserted inside `claim-store.test.ts`, which belongs to the
  # ledger rather than to this capability, so it is declared as a place to LOOK rather than folded
  # into the scope above — the same split `ambient-integration` draws for its wiring leg. Safe to
  # declare here: this node is NOT one of the five specs the contract-4 parity oracle holds
  # byte-identical to a registry twin (it has no `real:` arm, so it can never be real-buildable), so
  # the field owes no mirrored registry entry.
  coverage:
    testGlobs:
      - "packages/notice-board/src/store/claim-store.test.ts"
---

# CI corroboration — a check running right now is the one liveness signal a session cannot fake by existing

**Outcome —** While a branch is still working, a push to it fires
[`.github/workflows/claim-corroborate.yml`](../../.github/workflows/claim-corroborate.yml) (keyless
WIF via [`infra/ci-presence.tf`](../../infra/ci-presence.tf)), which runs
[`packages/notice-board/src/store/ingest-ci-activity.ts`](../../packages/notice-board/src/store/ingest-ci-activity.ts)
to observe GitHub, plan through the pure
[`ci-corroboration.ts`](../../packages/notice-board/src/ci-corroboration.ts), and stamp `heartbeat_at`
on every claim held on the observed branches — corroborated by a check **running right now** or a
**very recent push**, and by nothing broader. There is no polling loop to own: the triggers are the
loop, and GitHub runs them.

> **Cross-story boundary (ADR-0010 §4):** this capability writes through the **claim-store** seam
> owned by [`stories/notice-board`](../notice-board/story.md) (the `events.node_claim` ledger) — the
> same seam [`merge-presence-retire`](merge-presence-retire.md) releases through, reached by the
> branch-keyed `PgClaimStore.stampBranchActivity` rather than the session-keyed `stampActivity`. It
> does not own the ledger; it adds a second CI-time writer to a store another story defines. A
> forward edge from this trunk into a sibling — declared, not absorbed.

> **This is the second half of ADR-0535 D2, and its sibling is deliberately NOT in this story.** D2
> bought liveness from two signals with holes in different places. The DENSE half —
> `sweepWorktreeActivity` observing file change inside each claimed worktree — landed as contract 5
> of [`stories/notice-board/ambient-integration.md`](../notice-board/ambient-integration.md), because
> it is local ambient automation carried by `SessionStart` and the statusline. This half is a CI
> workflow with a trigger set, a credential and a permission posture, which is `ci-cd`'s subject: the
> same reading that homes `merge-presence-retire` here while its code sits in
> `packages/notice-board/**`. **ci-cd owns that a workflow runs, on what trigger, with what
> authority; notice-board owns the ledger it writes to.**
>
> The two are opposite numbers rather than duplicates. `merge-presence-retire` records that a
> branch's work is **over** — it DELETES claim rows and emits a `released` event each.
> This capability records that a branch's work is **continuing** — it moves one column forward and
> emits nothing. Different trigger, different verb, different observable; the outcome cannot be
> stated in one sentence with the merge-clear's without a conjunction, which is why it is a
> capability rather than a fourth contract there.

## Guidance

- **Proof-walkthrough first (integration test, against the real planner + the real workflow
  wiring).** Three halves prove together, and they are split by what each can honestly witness. (1)
  The PURE plan: drive `planCorroboration` with fixture `CorroborationObservation`s and assert what
  it admits, what it refuses by name, and how it dedupes — no fetch, no clock, no store, so this half
  is fully deterministic. (2) The WIRING: audit the landed
  [`claim-corroborate.yml`](../../.github/workflows/claim-corroborate.yml) as text for its triggers,
  its permission posture and its single admitted query, the same move
  [`ingest-merge.test.ts`](../../packages/notice-board/src/store/ingest-merge.test.ts) already makes
  against `ci.yml`. (3) The SQL: `stampBranchActivity`'s two monotonic predicates and its qualified
  `RETURNING` list — half witnessed offline as statement TEXT, half only by a real Postgres. See the
  fence below, which is what makes that split a stated one rather than a discovered one.
- **⚠ THE OFFLINE SUITE WITNESSES THE STATEMENT'S TEXT AND NEVER POSTGRES'S VERDICT ON IT, AND THAT
  GAP HAS ALREADY BEEN PAID FOR ONCE.** The fake client in `claim-store.test.ts` records statement
  text and never parses it — so it can pin the two predicates and the `c.`-qualified `RETURNING` list
  as strings (it does, for both stamps), and it cannot tell whether Postgres will ACCEPT them.
  `stampActivity` shipped an unqualified column list and Postgres refused it with `column reference
  "session_id" is ambiguous`, a failure no offline test in that file could have caught.
  `stampBranchActivity` is one unqualified name away from the identical fault with `branch`, because
  its `UPDATE … FROM` puts two relations in scope and BOTH carry a `branch` column. So the DB-gated
  `claim-store-branch-activity.live.test.ts` is not redundancy — it is the only observer of the half
  that actually bit, and contract 3 names it as such rather than letting an offline PASS read as the
  whole proof.
- **⚠ THE BROAD FORM IS REFUSED ON MEASUREMENT, AND THE REFUSAL IS STRUCTURAL RATHER THAN
  DOCUMENTED.** "Has an open pull request, therefore alive" would resurrect the three deadest claims
  on the board: every open PR on this repo is a long-abandoned draft — 852–863 h when ADR-0535
  measured the seven on 2026-09-05, the SAME seven still drafts at ~940 h on 2026-09-08 — and three
  of their branches are exactly the three oldest abandoned claims. Implemented broadly, even by
  accident, that makes corpse-fencing PERMANENT, which is the failure direction with no tell. The
  fence therefore lives in three independent places, none of them prose: the `CorroborationKind`
  union has no member for the reading, the entry makes exactly one GitHub query, and the workflow's
  token is never granted `pull-requests: read`. A capability contract holds all three (contract 4)
  because a fence a later edit can dissolve by adding one line is not a fence.
- **Every fence points the same way: against FALSE freshness.** `heartbeat_at` is not a display
  value — it decides `isReclaimable` (and so the takeover rule), it decides `listLiveClaims`, and
  through `worktree prune --pg`'s live set it decides whether a directory may be DELETED. A stamp
  that is too OLD costs nothing new: it reproduces today's behaviour, where every claim goes stale on
  a timer. A stamp that is too FRESH fences a node nobody can reclaim. That asymmetry is why a
  future reading is REFUSED rather than clamped, why a deleted ref is evidence of absence rather than
  of life, and why the default branch — where `claim-release.yml` is releasing claims on the very
  same event — is never corroborated.
- **Keyless (ADR-0021), and the failure posture is SPLIT rather than uniform.** Auth is GitHub OIDC →
  the `github-actions` WIF pool → the `storytree-ci-presence` service account, provisioned by
  [`ci-presence.tf`](../../infra/ci-presence.tf) — no JSON key, no new IAM, the same identity the
  merge clear already uses. The failure posture then splits, and both halves are deliberate. A STORE
  failure is LOUD (exit 1, `::error::`): this workflow gates nothing, so swallowing it would buy
  nothing and would rebuild the exact defect ADR-0535 fault 1 describes — a liveness stamp that had
  not fired since 15 August while 35 of 40 claims aged out, indistinguishable from a writer that was
  running and finding nothing to say. A GITHUB failure is QUIET (logged, exit 0): ADR-0535 already
  records that this signal goes dark when GitHub does, the push half needs no API call and still
  lands, and reddening a run for someone else's outage teaches the one lesson a check must never
  teach. Contract 6 holds both halves, because flattening either direction loses the point.
- **The trigger set is a decision, and the two rejected candidates are recorded so they are not
  re-derived.** The workflow fires on `push` to any branch but `main`, and on `workflow_dispatch`
  with a branch input. There is deliberately **no `workflow_run: completed`** trigger and **no
  `schedule:`**. A run fires at the END of CI, but a claim is stamped at push time against a 2 h
  staleness window, so a CI run of tens of minutes never ages a claim out on its own — and the
  `check-running` half is already operative without it, because every firing sweeps EVERY in-progress
  run in the repository rather than only its own branch, so on a box with concurrent sessions each
  push refreshes every branch that is building. A cron would fire ~288 times a day to do nothing most
  of them, and would mean OWNING the refresh loop that ADR-0535 D2 names as the standing cost. The
  triggers ARE the loop, and GitHub owns them.
- **The job checks out `main`, never the pushed tree, and that is a fence rather than a convenience.**
  It needs the WRITER, not the branch's code — and taking the pushed tree would let any branch change
  what a job runs while that job holds a store credential.
- **No merge gate depends on any of this (ADR-0535 D5).** This is a truth-telling repair, not an
  availability one. Nothing here may be turned into a merge blocker without its own decision, and the
  workflow sits on no PR's required-check list.

## Integration test (would-be)

**Goal —** A branch with a check running on it right now has its claims moved forward on the ledger;
a branch that only has an old open PR does not, and could not even if someone asked for it.

Drive `planCorroboration` over fixture observations covering both admitted kinds and every refused
shape, asserting the plan's stamps and each refusal's reason. Drive `ingest-ci-activity.ts` against a
fake claim store and a stubbed `fetch`, asserting it stamps what the plan produced, prints the run
report, propagates a store failure and swallows a GitHub one. Audit the real workflow YAML for its
triggers, its `actions: read` / withheld-`pull-requests` permission posture, its `main`-pinned
checkout and its keyless WIF steps. The `heartbeat_at` write itself is proven against a real Postgres
in the DB-gated live file.

## Contracts (6)

1. **`a-running-check-or-a-fresh-push-corroborates-its-branch`** — the two admitted readings reach
   the ledger, keyed on the full branch
   - **asserts —** `planCorroboration` turns each admitted `CorroborationObservation` — `kind:
     "check-running"` or `kind: "push"`, and there is no third — into one `BranchCorroboration`
     carrying the branch `branchFromRef` recovers from either spelling the two observers use (a push
     event's `refs/heads/<branch>` via `observeRef`, a workflow run's bare `head_branch` via
     `observeInProgressRuns`), keeping ANY branch shape with no `claude/*` filtering, and deduping to
     at most one stamp per branch holding the NEWEST observation — with `check-running` taking an
     exact tie over `push`, since the timestamps cannot choose and a run executing is the stronger
     statement. `observeInProgressRuns` reads EVERY in-progress run in the repository rather than only
     the firing branch's, which is what makes the check-running half operative with no
     `workflow_run` trigger: one session's push refreshes every branch that is currently building.
   - **why the observation carries OUR clock —** `observeRef` stamps the job's own `observedAt`, never
     the pushed commit's `timestamp`: a commit authored hours ago and pushed just now would otherwise
     read as hours old, and the evidence here is the PUSH, not the authoring.
   - **why the shape gate must never come back —** claims are keyed on the FULL branch and any shape
     can hold one (a lobby `worktree-…`, a `claude/real/…` promotion); the one time this repo
     filtered on a `claude/*` prefix it cost PR #1024's claim its machine clear for 46 minutes.
2. **`false-freshness-is-refused-and-named`** — every reading that could stamp fresher than its
   evidence is refused, and every refusal is reported
   - **asserts —** `planCorroboration` admits no false-fresh reading and records each one in
     `plan.refused` under one of the five `CorroborationRefusalReason`s rather than dropping it
     silently — six shapes across those five reasons, since `unreadable` covers two: a
     blank ref or an unparseable `observedAt` (`unreadable`), a non-branch ref such as `refs/tags/…`
     (`not-a-branch`), a push that DELETED the ref (`deleted-ref` — the one thing a push can say that
     is evidence of ABSENCE), the repository's `ctx.defaultBranch` (`default-branch`, read from
     context rather than a `"main"` literal so the fence is provable), and a reading ahead of
     `ctx.now` (`future`, refused rather than clamped). `renderCorroboration` prints every stamp,
     every refusal and the ledger's own written count, so a run that saw nothing is distinguishable
     from a writer that stopped running.
3. **`the-branch-stamp-only-moves-liveness-forward`** — the ledger write is monotonic, branch-keyed,
   and witnessed by a real database
   - **asserts —** `PgClaimStore.stampBranchActivity` updates `heartbeat_at` only where `c.branch =
     v.branch AND v.observed > c.heartbeat_at AND v.observed <= now()`, touching no other column,
     appending no audit event, and returning the count of claims actually moved — so a stale reading,
     a future reading (judged against the DATABASE's clock, the only clock the staleness test uses)
     and a branch holding no claim each correctly take nothing, and no claim can be aged INTO the
     takeover window by its own liveness signal.
   - **who has to be able to tell —** two observers, and the split is the point. The offline fake in
     `claim-store.test.ts` pins the predicates and the `c.`-qualified `RETURNING` list as statement
     TEXT; it records that text without parsing it, so it can never witness whether Postgres ACCEPTS
     the statement — which is precisely how `stampActivity` shipped `column reference "session_id" is
     ambiguous`. That half's only observer is
     `packages/notice-board/src/store/claim-store-branch-activity.live.test.ts` (DB-gated on
     `STORYTREE_DB_NAME`, skipped in the offline package suite). An offline PASS on this contract is
     therefore a NARROWED pass, never the whole proof.
4. **`the-broad-form-has-no-door-to-arrive-through`** — "an open PR, therefore alive" is refused in
   three independent places, none of them prose
   - **asserts —** `CorroborationKind` is a two-member union with no `open-pull-request` member, so
     the refused reading has no shape to arrive in, and `planCorroboration` refuses it AT RUNTIME too
     rather than leaning on the type alone; `inProgressRunsUrl` is the only GitHub query
     `ingest-ci-activity.ts` makes — workflow runs filtered to `status=in_progress`, with `queued`
     deliberately excluded because a run can sit queued for hours under saturated runners, so
     "queued" answers "was requested at some point" and is a weaker claim than the one being made —
     and the sole request the writer issues reaches no pull-request endpoint; and
     `.github/workflows/claim-corroborate.yml` declares a `permissions:` block granting `actions:
     read` while WITHHOLDING `pull-requests`, which sets that scope to `none`, so the job's token
     cannot read a pull request even if a later edit asked it to. All three are asserted, because any
     one of them alone is one line away from being dissolved by an edit that looks like a widening
     rather than a regression.
   - **why this is the one fence that must not slip —** the broad form fails in the direction with no
     tell. A board that corroborates corpses looks healthier than one that does not, so nothing
     downstream reports the fault; ADR-0535 measured that three of the seven open drafts sit on the
     three oldest abandoned claims, which is what makes corpse-fencing permanent rather than noisy.
5. **`the-corroborator-fires-on-its-own-triggers-and-runs-only-mains-tree`** — the writer is reached
   without a refresh loop, keylessly, from code no branch can change
   - **asserts —** `.github/workflows/claim-corroborate.yml` fires on a `push` to any branch but
     `main` (`branches-ignore: [main]`, which also keeps tag pushes out) and on `workflow_dispatch`
     with a branch input, and invokes `ingest-ci-activity.ts` with no branch-shape gate — any shape
     can hold a claim; it checks out `ref: main` rather than the pushed tree, so a branch cannot
     change what a job runs while that job holds a store credential; it authenticates keylessly
     through the `ci-presence.tf` WIF pool and the `storytree-ci-presence` service account's Cloud SQL
     IAM username, referencing no JSON key; and it sets `cancel-in-progress: true`, superseding an
     in-flight corroboration on a newer push.
   - **why cancelling here is the inverse of `claim-release.yml`, which never cancels —** a cancelled
     RELEASE is a lost release and the claims stay forever, whereas a cancelled corroboration merely
     leaves an OLDER heartbeat, which is the cheap direction of the same false-freshness asymmetry
     every other fence here is drawn on.
   - **why no `workflow_run` and no `schedule` —** recorded so neither is re-derived as an
     improvement. A claim is stamped at push time against a 2 h staleness window, so a CI run of tens
     of minutes never ages one out on its own, and the check-running half already works without an
     end-of-CI trigger because each firing sweeps every in-progress run repository-wide. A cron would
     fire ~288 times a day to mostly do nothing, and would mean OWNING the refresh loop ADR-0535 D2
     prices as this signal's standing cost — the triggers are the loop, and GitHub owns them.
6. **`a-store-failure-is-loud-and-a-github-outage-is-not`** — the two failure directions get opposite
   treatment, on purpose
   - **asserts —** `corroborateClaims` propagates a `stampBranchActivity` rejection rather than
     swallowing it, and the entry turns it into an `::error::` line naming what the ledger was NOT
     told plus a non-zero exit — unlike `ingest-merge.ts`, which returns `-1` and never rejects; while
     `fetchInProgressRuns` answers `null` and logs "the check-running half is dark" for a missing API
     context, a non-2xx status and an unreachable host alike, so a GitHub outage costs the run
     nothing, and `observeInProgressRuns` is TOTAL over a malformed body — a parse fault yields no
     observations instead of throwing, because the push reading beside it is still worth writing.
     A run with nothing to say still prints its report, and a plan with no stamps never asks the
     store at all.
   - **why the two directions differ —** `merge-presence-retire` is fail-soft because its failure
     could redden a merge that already landed. This workflow blocks no merge and sits on no
     required-check list (ADR-0535 D5), so swallowing a STORE failure would buy nothing and would
     rebuild the defect that opened the arc: a liveness writer whose only record is the row it wrote
     cannot be told from one that has silently stopped, which is how the retired ping stayed dead for
     three weeks. `claim-release.yml`'s `STORYTREE_CLAIM_RELEASE_STRICT` is that same reasoning
     already landed here. A GITHUB failure is somebody else's outage, and a check that reds on one
     trains its reader to ignore it.
