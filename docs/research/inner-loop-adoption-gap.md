# Why ~92% of source work bypasses the inner loop — and the highest-leverage lever

**Status:** findings + recommendation (analysis only — no process change, no build started).
**Date:** 2026-06-28. **Owns:** the open question named in
[ADR-0128](../decisions/0128-the-bare-forest-map-is-honest-by-absence-inner-loop-adoption.md) §4
("*why ~92% of source changes bypass `node build --real` / `story build --real`, and what would make
driving the default path*"). Builds on [ADR-0057](../decisions/0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md)
(inner loop is the default) and its envelope map
([inner-loop-capability-envelope.md](inner-loop-capability-envelope.md)).

## TL;DR

The owner's leading hypothesis is **confirmed**: the conversational outer loop is wired into the
studio only as far as **propose** — [ADR-0108](../decisions/0108-chat-driven-orchestration-a-server-side-session-orchestrator.md)
**Phase 3 (drive authority) is unbuilt**, so making a session drive `--real` is still a manual CLI
step that almost every session skips. But the hypothesis is **not the whole story**: even with a
perfectly wired studio, the *ratio* is capped, because **~83% of the bypass PRs are not a single
isolatable red→green leaf** — they are cross-package structural moves, two-stage-attested UI, or code
fused with the ADR/CLAUDE.md/corpus/infra the loop structurally cannot touch.

So the gap is **two layered facts**, and the levers differ:

1. **Adoption (the actionable minority).** ~17% of bypass PRs (~50 of 286) were a clean single-package
   logic-or-server unit **within today's envelope** and were still not driven. This is pure adoption
   friction — the lever is **make driving the default surface (ADR-0108 Phase 3)** + cut per-build cost.
2. **Shape (the structural majority).** ~83% are not one drivable unit. The lever there is **decompose
   into provable sub-units and supplement the rest** — exactly the `session-orchestrator`'s job, which a
   server-side runtime would do mechanically; plus the still-unbuilt
   [ADR-0057](../decisions/0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md) **E**
   (authoring-as-proof) for the docs/ADR/corpus tail that has no proof mode at all.

**Highest-leverage recommendation (owner fork — green-light, do not start):** build **ADR-0108 Phase 3**
— wire the chat orchestrator's *proposed unit* to the **already-built** build worker
(`routedBuildRunner` → `story build --real`) so driving is the default outcome of a session, not a
manual afterthought. It reuses the worker (ADR-0090), the gate (ADR-0020), and CI-lands-the-trunk
(ADR-0022); the new piece is the route from "propose" to "drive." Pair it with an OQ-ADR that pins the
**target ratio** (ADR-0128 explicitly leaves open that the current ratio may be acceptable for non-leaf
work).

---

## 1. The measurement, independently reproduced

Two machine-written sources, re-pulled 2026-06-28 (method + exact queries in the appendix).

### git / PR classification (`gh pr list`, merged Jun 6–27)

| bucket | count | note |
|---|---:|---|
| total merged PRs | 451 | |
| **driven** (`claude/real/*` promotion) | **23** | exact match to ADR-0128 |
| source-changing, **bypassed** the inner loop | **286** | ADR-0128: 278 (±8, classifier boundary) |
| non-source (docs / ADR / corpus / infra / config only) | 142 | |
| source-changing total | 309 | ADR-0128: 301 |

→ **23 of 309 source-changing PRs (7.4%) were driven; 92.6% bypassed.** Headline reproduced exactly;
the 8-PR delta vs ADR-0128 is how test-only / glue-only PRs fall across the source/docs line and does
not move the conclusion.

### the `events` store (live Cloud SQL, `events.verdict` / `events.work_event`)

- **79 `building` events**, 40 units, 48 runs (ADR-0128: 79 ✓)
- **72 verdicts — 72 pass, 0 fail**, 46 units, 43 runs, 47 distinct commits (ADR-0128: 72 ✓)
- proof modes: `capability` 31, `adopted` 33, `contract` 7, `operator-attested` 1
- **driving cadence: 10 of 18 active days had a verdict → 8 days with *zero* driving** (ADR-0128: 8/18 ✓).
  Driving is bursty: Jun 25–26 alone carry 49 of 72 verdicts; most days the world is provably empty —
  which is exactly why the forest map is bare (the honest symptom ADR-0128 records).

The two sources reconcile: the ~23 driven landings ≈ the 43 verdict-runs collapsed by PR
(a story chain signs many unit verdicts into one promotion).

## 2. Why the 286 bypass PRs bypassed — quantified by shape

Each bypass PR classified by its files into a dominant change-kind and a *buildability shape* (could it
be one isolatable red→green leaf?). Percentages are of the 286 source-bypass PRs.

| change-kind / shape | PRs | % | inner-loop reachability **today** |
|---|---:|---:|---|
| **CODE: single-package clean** (logic/server + test) | **30** | 10% | **directly drivable** — should-have-been-driven |
| CODE: single-package + 1 non-code file | 20 | 7% | drivable (split the 1 doc/config file) |
| UI / visual (tsx/css/forest-world/studio-src/web) | 79 | 28% | two-stage **operator-attested** (ADR-0070) — frontend-builder path |
| CODE: cross-package (≥2 packages/apps) | 81 | 28% | not atomic; only as a **sequenced chain** / decomposed |
| CODE: single-package fused w/ docs/corpus/infra (≥2) | 41 | 14% | drive the **code core**, supplement the rest |
| CODE + UI mixed | 17 | 6% | partially (split logic vs visual) |
| test-only | 15 | 5% | not a red→green leaf (already-green test adds) |
| glue / scripts only | 3 | 1% | no isolatable proof |

Collapsed into the question the owner asked — *genuinely non-buildable vs should-have-been-driven*:

- **Directly drivable, single unit, and not driven (~50 PRs, ~17%)** — the **clean adoption gap**.
  These (e.g. the ADR-0118 CLI units #433–436, the ADR-0095 graduation engine #314/#317, the
  studio write-broker mount #417) are net-new single-package logic/server + a test, squarely inside
  today's envelope. Nothing structural stopped them; the session just edited + `pnpm gate`'d + merged.
- **Has a drivable code core but lands fused with non-drivable work (~218 PRs, ~76%)** — UI (needs
  attestation), cross-package (needs chaining), or code + ADR/CLAUDE.md/corpus/infra. The *PR as landed*
  is not one leaf; the **code sub-unit** is drivable only if the orchestrator decomposes and routes it.
  This is the [ADR-0057](../decisions/0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md)
  gap-audit finding intact: of the last ~13 PRs at that time, *none* could go through the loop
  end-to-end because each carried wiring/ADR/CLAUDE.md/generated artifacts alongside its clean core.
- **No proof mode at all (~18 source + 142 non-source PRs)** — test-only, pure glue, and everything
  docs/ADR/corpus/infra. ADR-0057 **E** (authoring-as-proof, gate-as-proof) is still unbuilt; until it
  is, this tail is structurally outside the loop, and even then its "proof" is a green structural gate,
  not a red→green.

**The envelope is no longer the binding constraint.** Since ADR-0057, B/C/D shipped: a node declares an
arbitrary `proofCommand` (`pnpm --filter x test`, a `check:*` gate, vitest, a shell test), reliability
gates (`observe` / `build-tests` / `integrate`, ADR-0098), edit-existing-source + regression (C), and
`story build --real` chains whole stories (D). So the ~50 clean bypass PRs were *within reach* and still
weren't driven — confirming the bottleneck has moved from **capability** to **adoption**.

## 3. Hypothesis test — "the outer loop is not yet wired into the studio": CONFIRMED

ADR-0108's phased build, against the code on `main` today:

| phase | what it is | status (evidence) |
|---|---|---|
| **1 — headless runtime** | run the `session-orchestrator` agent headlessly; orient + propose | **built, read/propose only.** `packages/drive/src/orchestrate.ts:7` — *"Phase 1 scope: read/propose only — no signing, no building, no PR/gate/merge."* |
| **2 — chat surface** | studio chat panel + SSE transcript | **built, read/propose only.** `chat-stream.ts:10` — *"read/propose only — no signing, no building."* Mounted `POST /api/chat` on the **desktop sidecar** (`apps/desktop/electron/backend-entry.ts`); `ChatDock` mounted in the studio at `apps/studio/src/App.tsx:214`. |
| **3 — drive authority** | route provable units to the build worker; run the prove-it-gate | **NOT BUILT.** `backend-entry.ts:13-14` — *"the chat surface is now mounted (orient + propose via startChatStream); **the build-trigger / adopt outer-loop paths are still later increments.**"* |
| **4 — land w/ human gate** | librarian-curator pass + open the PR; accept-to-land affordance | **NOT BUILT.** |
| **5 — hosted for the circle** | hosted, IAP-gated, BYO-credential | **NOT BUILT.** |

So the conversational orchestrator can talk to you and *propose* a unit, but there is **no path from a
proposal to a signed `--real` build**. Driving remains a human hand-running `node build --real` /
`story build --real` at a terminal. The leg-7 live-witness (memory: chat *functioned* — a real
subscription `query()` streamed a proposal — but stage-2 appearance was HELD) is the same boundary:
propose works, drive does not exist.

**Important nuance — there *is* a UI→`--real` path, but it is not "the outer loop."** ADR-0090's
**Build button** (`apps/studio/server/buildWorker.ts` `routedBuildRunner`, wired in `devApi.ts`) already
routes a *story* id to `story build --real` (persists verdicts, opens a non-draft PR that CI
auto-merges). But it is (a) a manual per-story click, (b) only on the local dev backend, and (c) it does
**not decide or decompose** — a human must already have authored the story with provable nodes and
choose to click. It is a build *trigger*, not the orchestrator deciding *what* to drive. The missing
keystone is precisely the bridge between them: **the proposing orchestrator (Phase 1/2) handing a
provable unit to the driving worker (ADR-0090).** That bridge is ADR-0108 Phase 3.

## 4. The other material reasons (each with evidence)

- **Friction / cost vs `pnpm gate`.** A `--real` build is SDK-billed and fail-closed bounded:
  `node build --real` = **$1/slice + 16-turn cap** (`node-build.ts:753`, `:1331`); `story build --real`
  = **$10 total, $1/slice** (`story-build.ts:130,347`). A substantial integration slice routinely needs
  `--budget` raised and `--max-turns 45` (memory: `chat-sse-mount` used $4.38 / 43 turns near the cap).
  Against this, `pnpm gate` (typecheck + test) is **seconds, free, and offline**. For a clean unit the
  session *could* drive, the rational local choice is almost always edit → gate → merge.
- **"Gate is good enough."** CI re-proves green before the trunk (ADR-0022) with the same
  typecheck+test the gate runs, so for non-leaf work the signed verdict feels redundant — it adds a
  wisp/verdict and the honesty walls (test-author ≠ code-author, spine-observed red→green), but not
  *merge safety*. The verdict's value is **observability + dogfooding** (ADR-0048/0057), which is a
  diffuse benefit a session under deadline discounts.
- **Process / decomposition discipline.** The `session-orchestrator` is *supposed* to decompose a unit
  into provable units and route them, supplementing the non-leaf glue (`orchestrate-route-supplement`).
  In practice the supplement-by-own-edits path dominates: the 41 "code fused with docs/corpus/infra" +
  81 cross-package PRs show sessions landing the whole mixed diff rather than carving the drivable core
  out first. A *human-run* terminal loop makes carve-and-drive high-friction; nothing enforces it.
- **Coverage tail with no proof mode.** The 142 non-source PRs + ~18 test-only/glue source PRs have no
  red→green expressible at all (ADR-0057 E unbuilt). This is a true floor on the ratio, not a failure.

## 5. Recommendation — highest-leverage lever (owner green-light)

**Primary (build arc — owner fork, not started here): ADR-0108 Phase 3, "wire the studio to drive
`--real`."** Make the *default outcome* of a session-orchestrator conversation a driven, signed build,
not a proposal the human then hand-drives. The mechanism already exists on both ends — the proposing
runtime (`orchestrate()` / `startChatStream`) and the driving worker (`routedBuildRunner` →
`story build --real`, which already persists verdicts + opens the auto-merging PR). The unit is the
**bridge + the human accept-to-land gate** (ADR-0108 decision 3): proposal → (approve) → worker →
spine-signed verdict → PR. This is the single change that converts the ~50 directly-drivable bypass PRs
*and* the drivable cores of the ~218 mixed PRs from "skipped because manual" to "driven because default."

Why this over the alternatives:
- *Cheaper friction (raise budgets / lower turn cost)* helps at the margin but leaves the root cause —
  no default surface — untouched.
- *Promote the ADR-0090 Build button harder* captures per-story clicks but still needs a human to
  author + decide; it is not the decompose-and-route intelligence.
- Phase 3 is the keystone both depend on and the one ADR-0108 already designed and sequenced.

**Pair it with an OQ-ADR to settle the target (genuine owner fork) —
[ADR-0129](../decisions/0129-inner-loop-adoption-target-ratio-and-goal-open-question.md), proposed.**
ADR-0128 §4 explicitly leaves open that *the current ratio may be acceptable for non-leaf work.* Before
investing in Phase 3, the owner should pin: **what fraction of source work is it worth driving, and is
the goal observability (a livelier map) or proof-integrity (dogfooding)?** The evidence says the honest
ceiling is roughly the **~50 clean + the code-cores of the ~218 mixed** — a large lift over 23, but
**not** 100%, and the docs/ADR/corpus tail stays out until ADR-0057 E. ADR-0129 records that fork
(OQ1 goal / OQ2 ratio / OQ3 the tail) as a copy-on-write record, not an implied mandate.

> **Update 2026-06-28 (owner-directed, landed):** the inner-loop **USD budget ceilings are removed**
> ([ADR-0130](../decisions/0130-remove-the-inner-loop-usd-budget-ceilings-subscription-funde.md)) — the
> builds are subscription-funded ([ADR-0030](../decisions/0030-all-in-on-claude-agent-sdk.md)), so a
> `$`-budget caps against a *phantom* metered cost while the **turn cap** remains the real runaway brake.
> No USD ceiling is enforced by default now; `--budget` is an opt-in cap. This removes the friction
> lever's cost term for the clean units.

**Do not** (per scope): start the Phase 3 build, raise budgets, or "enforce" driving in guidance — those
are the owner's calls. This document is the evidence to make them.

## Appendix — method & caveats

- **PRs:** `gh pr list --state merged --limit 700 --json number,title,mergedAt,headRefName,files`
  (451 rows, Jun 6 09:14 → Jun 27 23:23 UTC). Branch-class: `claude/real/*` = driven. File-kind
  classifier (logic/ui/server/sql/test/glue/docs/corpus/infra/config) → per-PR source/docs split +
  dominant shape. Source/docs boundary yields 309 source vs ADR-0128's 301 (±8 from test-only/glue
  bucketing); the 23 driven and the 7.4% driven-ratio are exact.
- **events:** `events.verdict` (`unit_id, run_id, proof_mode, outcome, commit_sha, signer, at`) and
  `events.work_event` (`type='building'`, `run_id` inside `doc`), via `@storytree/library/store`
  `createPool` against live Cloud SQL (`STORYTREE_DB_USER` from `~/.storytree/secrets.json`). Days
  bucketed `at time zone 'Australia/Sydney'`.
- **ADR-0108 status:** read from `packages/drive/src/orchestrate.ts`, `chat-stream.ts`,
  `apps/desktop/electron/backend-entry.ts`, `apps/studio/server/buildWorker.ts`,
  `apps/studio/src/App.tsx`.
- **Caveat:** per-PR dominant-shape classification is a heuristic over file paths; a handful of
  "single-package clean" PRs are doc-comment edits in `.ts` files (false positives). The ~17% / ~83%
  split is robust to this noise; the precise per-bucket counts are indicative, not exact.
