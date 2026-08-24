---
id: "studio-build"
tier: story
title: "UI-driven build (the local loop)"
outcome: "An operator triggers a real node build from the studio UI and watches it run live to a signed verdict on their own machine."
status: retired
proof_mode: UAT
capabilities: [build-run-registry, build-intent-api, ui-build-trigger]
# RETIRED by ADR-0429 (2026-08-23), closing `retire-orphaned-build-engine-arc`. This story's whole
# journey is the studio's island-panel **Build** control — "an operator triggers a scope-routed build
# … and watches it run live to a verdict" — and ADR-0404 reversed it: dispatching a build is a CLI
# verb (`storytree node build` / `storytree story build`) and no UI dispatches one. Every surface the
# journey names is gone. The front end: `apps/studio/src/components/BuildSection.tsx` deleted by
# ADR-0404 D2/D3. The transport: `POST`/`GET /api/build` and the `api.build` / `api.buildStatus`
# client pair deleted with it (see the comment left in their place at `apps/studio/src/api.ts:356`).
# The engine: `BuildRegistry` / `runBuildJob` / `routedBuildRunner` / `adoptRunnerFromAdoptStory`
# deleted by ADR-0422 D1, along with `packages/drive/src/build-worker.ts` and the four test files
# that were their only readers. So all three capabilities below describe code that was deleted, over
# an API that was deleted, behind a button that was deleted.
#
# THIS RETIREMENT IS HONEST, NOT FORCED — and the difference is worth knowing, because a reader who
# assumes a rung compelled it will look for the rung and find nothing. Its two sibling retirements
# WERE compelled: `map-terminal-build` (ADR-0404 D4) and `desktop-build-mount` (ADR-0422 D4) each had
# capabilities whose `real:` arms bound deleted files, so ADR-0252 D3 left RETIRE as the only
# sanctioned drain. This story has no `real:` arm on any capability and appears nowhere in
# `repo-manifest.json`, so it binds no file, breaches no ceiling, and reds no rung —
# `contract-binding-drift`, the coverage drain and `check:boundaries` were all silent on it before
# ADR-0422 and after. That invisibility is exactly why it outlived two decisions that retired its
# siblings, and exactly why it had to be retired deliberately: it misinforms readers and nothing else.
#
# THE TEN RELIABILITY GATES BELOW ARE KEPT, UNRENUMBERED AND UNCLAIMED, and the body is kept as history.
# Gate ordinals are positional, so removing one silently re-points any signed verdict that named them.
# THE UAT CRITERIA ARE ALL GONE: legs 1-10 were DELETED 2026-08-24 under ADR-0396 D1 (leg 11 went earlier,
# under ADR-0348 D6), every ordinal BURNED, so this story declares ZERO criteria.
#
# (This block read "THE UAT CRITERIA AND RELIABILITY GATES BELOW ARE KEPT, UNRENUMBERED AND UNCLAIMED",
# and reasoned: "Note that leg 5 ... still reads `proven=✓`: it was genuinely driven, over a `/api/build`
# that no longer exists, so it can never be re-earned. That is dormant history on a retired story rather
# than a live claim ... and it is the same disposition `desktop-build-mount` landed with in PR #1578."
# ADR-0437 REVERSES that choice, and TWO things in the reasoning need correcting rather than merely
# overtaking. First, leg 5 was never DRIVEN — it holds no `events.uat_drive` row; it was observe-and-signed
# through gate 1's suite. Second, and load-bearing: it was not "genuinely" proven at all. Gate 1 is
# `pnpm --filter studio test`, whose `409` assertion lived in `buildApi.integration.test.ts`, and ADR-0404
# deleted that file in `902fd9a5` — an ANCESTOR OF BOTH commits at which leg 5's verdicts were signed
# (`bf3e8ec4`, `089ab013`). The suite kept exiting 0 on its other tests, so both greens were HOLLOW when
# minted. "Dormant history rather than a live claim" is also not a state a criterion can be in: every
# instrument reads a criterion as a live obligation and none filters on `status: retired` (ADR-0396's own
# Context). The `desktop-build-mount` precedent this cited is reversed in the same landing for the same
# reason. Corrected in place per ADR-0139. Gate 1's command still names the deleted
# `buildApi.integration.test.ts`; the gate stays, unclaimed, because ids are positional.)
#
# NOT RETIRED WITH IT: `studio-build-uat-seed` (in `stories/drive-machinery/`), the repeatable
# real-build target leg 9 used to click. It survives on its own merits, reachable as
# `storytree node build studio-build-uat-seed --real`; its doc-comment is corrected in place there.
# Story-level edges (ADR-0010 §4 — consumed cross-story seams, encoded as frontmatter
# depends_on; see "Cross-story boundary" below for the import-evidence at file:line):
#   - studio          — the UI/server organism this extends: the build button + transcript live
#                       in apps/studio/src/components/TreeView.tsx's island side panel, and the
#                       new endpoints hang off the SINGLE /api/* route table (apiRouter.ts,
#                       ApiContext), the same table the world's /api/tree + /api/activity serve.
#   - drive-machinery — the build path(s) the worker drives: it ROUTES by unit kind
#                       (routedBuildRunner, buildWorker.ts:144) — a node → EXISTING
#                       `nodeBuild(... --live)`, a story → EXISTING `storyBuild(... --real, openPr)`
#                       (the `story-real-chain` that lands via an auto-merging PR, ADR-0022/0031).
#   (notice-board     — the in-flight `building` teal wisp (ADR-0048) — is REUSED, not consumed by this
#                       story's own code: the work-event is appended inside drive's driveNode and read
#                       via studio's /api/activity, both behind declared edges (drive-machinery,
#                       studio); no new wisp code here, so the edge is transitive, not re-declared —
#                       redundant-transitive edge removed, 2026-07-05 map-health cleanup.)
#   - library         — the verdict SHAPE (events.verdict) + the work-hierarchy spec the build
#                       drives are library's; the worker reflects the new hue via the existing
#                       /api/tree latestVerdicts path.
depends_on: [studio, drive-machinery, library]
# ADR-0166 artifact edges: the deliberate NON-IMPORT seams among the depends_on above (build-artifact /
# write-target / hosted-seam consumption, narrated per-edge in the comments/body of this spec) — the
# declared-edge honesty gate accepts these without a code import; remove an entry if the seam ever
# becomes a real package import.
artifact_edges: [studio, drive-machinery, library]
# Deciding ADRs (ADR-0037 §2): UI-driven orchestration shape (90), proof-bearing-worker
# integrity (91), the orchestrator/agent boundary preserved (4), and UI-drives-agents (8).
decisions: [8, 90, 91, 4]
---

# UI-driven build (the local loop)

**Outcome —** An operator triggers a real node build from the studio UI and watches it run live to
a signed verdict on their own machine.

## What this is

This is **ADR-0090's UI-driven orchestration** ("hosted build-capable backend, thin clients")
brought into the studio — *the local loop, plus story-scoped approve-to-land*. Today's terminal
trigger (`pnpm storytree node build <id> --live`) moves into the studio UI behind a THIN client + a
server-process WORKER, on the operator's OWN machine at flat subscription cost — no hosting, no
cloud credentials, no multi-tenant. The control is **scope-routed** (`routedBuildRunner`,
`apps/studio/server/buildWorker.ts:144`): a drilled-in capability runs the Phase-1 `--live`
single-node pipeline smoke; a selected story runs `story build <id> --real` and, on a green chain,
opens an auto-merging PR — the **Phase-2 approve-to-land** increment PRs #299 + #300 landed (see
"Scope, honestly" below). The mechanics below were authored Phase-1-first. The story path landed,
but the current node route has since diverged from the accepted `--live` shape; the desired
two-scope organism is therefore not fully built.

The shape, decided in ADR-0090 (owner + orchestrator) and **encoded here, not re-designed**:

- **Thin client → intent.** The studio frontend (`apps/studio/src`) posts a build INTENT —
  `POST /api/build { unitId }` — to the local backend. The frontend NEVER imports
  `packages/agent` (ADR-0004 / ADR-0090 d.2); the build button + a live transcript panel live in
  the EXISTING island side panel (`apps/studio/src/components/TreeView.tsx`, the
  `<aside className="tree-detail">` that already shows status, the UAT verdict line, and the
  capability sub-DAG).
- **Server-process worker = the single orchestrator boundary.** A worker in the studio SERVER
  process (`apps/studio/server`) picks up the intent and runs the EXISTING `--live` build path —
  the same thing `pnpm storytree node build <id> --live` does today
  (`packages/drive/src/node-build.ts` → `nodeBuild` → `driveNode` → `proveUnit`). A real Claude
  Agent SDK leaf authors the synthetic `add(2,3)` pair through the real prove-it-gate, the spine
  observes the genuine red→green and SIGNS, and a REAL signed verdict for the node persists to
  `events.verdict` (ADR-0091's "the verdict is produced by the gate, never handed in"). The worker
  is the single model boundary; the UI holds no model-invocation path.
- **Live progress = reuse + a thin read path.** The in-flight `building` work-event already lights
  the teal wisp (ADR-0048) via `/api/activity`, and `/api/tree`'s `latestVerdicts` already reflects
  the signed verdict hue — both are REUSED, not rebuilt. A NEW build-status read endpoint
  (`GET /api/build?runId=…`) returns a COARSE transcript (phase/progress lines + the final build
  envelope) that the UI POLLS while the build runs (owner's call: coarse + polled, no websocket).

**Scope, honestly (ADR-0090 phases).** The **node (capability) path** stays the Phase-1 `--live`
local smoke — a single-node build that proves the build PIPELINE on a synthetic task, no land. The
**story path REACHED FORWARD to ADR-0090 Phase 2 — approve-to-land** (PRs #299 + #300): selecting a
story (no cap drilled) and clicking **Build** runs `story build <id> --real`, which authors each
capability for real in a worktree and, on a GREEN chain, opens a **non-draft PR that CI auto-merges
to trunk** (ADR-0022; `claude/real/*` promotion branches merge non-squash per ADR-0031). Clicking
Build IS the approval to land — ADR-0090's "the human still owns accept-to-land" is preserved (the
click is the deliberate, owner-attested human action). STILL out of scope: hosted / multi-tenant /
cloud-auth (Phase 3); no `--real` toggle on a single node; no manual `gh pr merge`; the frontend
holds no model-invocation path — the agent runs only in the server/worker process.

**Known implementation gap — do not redefine the target.** The accepted node behavior above remains
`--live`, non-persisting, and no-land. Current `routedBuildRunner` instead sends a node through
`nodeBuild(..., { real: true, verdictStore: 'pg' })`, persisting its verdict and parking a branch.
That is a code divergence, not a new acceptance rule: the desired node route is **UNBUILT**. *(This
sentence ended "and UAT leg 8 must fail until implementation once again matches the locked `--live`
walls." Leg 8 was deleted 2026-08-24 under ADR-0396 D1 with the rest of this story's criteria, and the
whole route it described was deleted by ADR-0404/ADR-0422 — so nothing must fail, because nothing
claims it any more. The divergence is recorded here as history of what the accepted target once was;
it is not a live obligation on anyone. Corrected in place per ADR-0139.)*

## Honest proof posture — `proposed`, with a node-route gap

This spec was authored FIRST, before any implementation, to bound the journey and size the units;
most mechanics then LANDED (PRs #297 / #299 / #300), but the current routed-node implementation is
not reconciled to the accepted `--live` behavior above.
Every contract below describes the isolated unit test that proves a leaf; the capability describes
the integration test that proves it against real in-story collaborators; the story UAT below
describes the acceptance walkthrough that proves the whole loop against the real running studio.
**OVERTAKEN — this story is `status: retired` (ADR-0429) and declares NO UAT criteria.** The whole
posture below described a `proposed` story working toward a green walkthrough; there is no walkthrough
left. *(This read: "Deterministic component and integration tests already reach several of those legs'
observables, but only UAT leg 5 is formally machine-witnessed through the exact observe gate below —
the 2026-07-25 ADR-0209 §8 re-adjudication DECLARED eight legs machine without claiming any of them
proven (§6 returns every re-adjudicated leg to UNSTAMPED). Status stays `proposed` because code work
remains to restore the locked node `--live` route, because seven of the eight machine legs still await
a spec that discharges them, and because legs 9 and 10 still await a `pass` drive record at their
current revisions." Every clause is now false: the code was deleted rather than restored (ADR-0404 /
ADR-0422), all ten legs were deleted on 2026-08-24 under ADR-0396 D1, and leg 5's "formally
machine-witnessed" green turned out to be hollow at both signings — its gate's `409` assertion had
already been deleted. Corrected in place per ADR-0139.)* *(This clause used to say `healthy` "additionally requires the three remaining operator
obligations (the billed live run, the outward-facing approve-to-land, and the APPEARANCE attestation per
ADR-0070)". All three are now false and are corrected in place per ADR-0139: ADR-0348 D2/D3 made legs 9
and 10 `machine` and model-driven on 2026-08-12, so neither is an operator obligation, and D6 deleted the
appearance leg outright on 2026-08-11. This story carries NO operator-attested leg.)*
It is never authored. The build-path collaborators
(`nodeBuild`, `storyBuild`, the spine, the SDK leaf) already existed and are real; this story added
the server-process worker and trigger UI, but its current node routing does not yet satisfy the
accepted outcome.

## Capabilities (3)

Listed roots-first (a capability appears after everything it depends on).

| # | capability | outcome | depends on |
|---|---|---|---|
| 1 | [`build-run-registry`](build-run-registry.md) | A server-side build run accumulates its coarse transcript and reaches a terminal verdict, with one build at a time. | — |
| 2 | [`build-intent-api`](build-intent-api.md) | An operator dispatches a build intent and reads its live status over the studio API. | `build-run-registry` |
| 3 | [`ui-build-trigger`](ui-build-trigger.md) | An operator triggers a build from the island panel and watches it run live to a verdict. | `build-intent-api` |

## Dependency graph (will be code-derived)

These are **within-story** edges. Until the code exists they are authored from the intended
data-flow; when the units are built they MUST be re-derived from the real imports/calls between
capabilities (static analysis, ADR-0010 §3) and corrected if the code disagrees. The graph is
acyclic; `build-run-registry` is the root (the leaf state machine, no in-story upstream).

- `build-intent-api` → `build-run-registry`
  - The API handlers (`POST /api/build`, `GET /api/build`) are the thin HTTP shell over the
    registry: POST calls the registry's `createRun` + spawns the worker against it; GET reads the
    registry's transcript + status for a `runId`. The API owns no run state of its own — it is the
    registry's transport, so it couples directly to the registry's surface.
- `ui-build-trigger` → `build-intent-api`
  - The frontend's Build button calls `POST /api/build` and the transcript panel polls
    `GET /api/build?runId=…` (through the existing `api.ts` client). The UI imports NO build code
    (ADR-0004 / ADR-0090 d.2) — its only path to a build is the API, so the trigger couples to the
    API and to nothing deeper.

## Cross-story boundary (ADR-0010 §4)

Authored from the intended consumed seams (re-verify against real imports when built). All four seams
are CONSUMED, not absorbed — three as declared `depends_on` edges; the notice-board wisp surface is
reached transitively through drive-machinery / studio (see its bullet) — and this story owns the
worker + the trigger UI, never the build engine, the spine, the wisp pipeline, or the verdict schema.

- **`studio`** — the **UI/server organism** this extends. The new endpoints are added to the SINGLE
  `/api/*` route table (`apps/studio/server/apiRouter.ts`'s `handleApiRequest` + `ApiContext`) that
  both fronts wire — the Vite dev plugin (`devApi.ts`) and the hosted server (`serve.ts`) — so the
  build endpoints are defined ONCE and the worker hangs off `ApiContext`, like `dbWake`/`invites`.
  The Build button + transcript live in the studio's island side panel
  (`apps/studio/src/components/TreeView.tsx`).
- **`drive-machinery`** — the **build path(s) the worker drives**. The worker ROUTES by unit kind
  (`routedBuildRunner`, `apps/studio/server/buildWorker.ts:144`): a NODE id → the EXISTING
  `nodeBuild(unitId, { live: true, … })` (`packages/drive/src/node-build.ts`) — the same path
  `storytree node build <id> --live` runs (→ `driveNode` → `resolveProveSpec` → `proveUnit`, the
  spine observing red/green and signing); a STORY id → the EXISTING `storyBuild(id, { real: true,
  openPr: true, … })` whole-story chain (drive-machinery's `story-real-chain`, topo-ordered from
  `depends_on`), which authors each capability for real, promotes the proven branch, and opens the
  auto-merging PR (ADR-0022 / ADR-0031). The worker NEVER reaches inside the gate or the chain/
  promote/merge engine; it calls the same public entries the CLI does and OWNS only the routing.
  Discovery of which kind a unit is, and whether a story is real-buildable
  (`isStoryBuildable(spec, caps, 'real')`, `packages/orchestrator/src/story-build.ts:234`), are
  drive-machinery's too — consumed, not reimplemented.
- **`notice-board`** *(transitive — reused, not consumed by this story's own code: the work-event is
  appended by drive's `driveNode` and read via studio's `/api/activity`, both behind declared edges)*
  — the **in-flight wisp surface**. `driveNode` already appends the `building`
  work-event that lights the teal wisp (ADR-0048), read by the world via `/api/activity`
  (`inFlightBuilds()` over `PgPresenceStore` / `classifyPresence`). Phase 1 REUSES it — no new wisp
  code; the live build simply produces the marks the existing pipeline already paints.
- **`library`** — the **verdict shape + work-hierarchy spec**. The signed verdict lands in
  `events.verdict` (the proof-protocol shape library owns) and the world reflects the new hue
  through the EXISTING `/api/tree` `latestVerdicts` path. The build also drives a real node spec
  loaded from `stories/` (`loadNodeSpec`).

## UAT Test Criteria

**⚠ THIS STORY DECLARES NO UAT CRITERIA. Ordinals 1–11 are all BURNED** — 11 by ADR-0348 D6
(2026-08-11) and 1–10 by the ADR-0396 D1 retired-story disposition (2026-08-24, adjudicated under
ADR-0437). **Read every dated blockquote and `###` sub-section below as HISTORY, not as a live
posture.** Each honestly records what its own pass found and is kept under ADR-0396 D3 — including the
two passes that concluded nothing here could be deleted, which were right about the question they
asked (ADR-0294 D2's honesty wall) and are not contradicted by a disposition made on the retirement
ground instead. But every present-tense claim below about a surviving leg, its witness tag, its
binding, its coverage or its redness has been overtaken. The note above the (now empty) list is the
current statement, and it is the one to trust. Corrected in place per ADR-0139 rather than rewriting
the record of what each pass actually found.

The integrated **acceptance walkthrough** that proved the whole `studio-build` organism — the Phase
1 local loop — met its outcome end-to-end against the **real running studio** and the **real build
path** was minimal-first (one coherent operator journey: trigger → watch → verdict), defect-
driven thereafter (each real failure earns a permanent regression case, never speculative breadth).
The journey is proven against a REAL subscription-billed `--real` node build — the SDK leaf genuinely
authoring the node's own test and implementation, the spine genuinely signing — and that genuineness is
leg 9's own claim. *(This sentence named a `--live` build until 2026-08-19; the studio UI has no route
to `--live` and never had one, so the whole walkthrough was describing a build nobody could trigger from
it. Corrected in place per ADR-0139 — the `--live` claim itself moved to `agent#gate-2`, see "Where the
`--live` claim went".)* *(That sentence used to end "the one an
agent may never manufacture". ADR-0348 D2 withdrew the premise: the spend is a routine factory action,
not a judgment gap, and leg 9 is `machine` and model-driven since 2026-08-12. What an agent may never
do is FAKE the observable — which is a different rule, and it still holds. Corrected in place per
ADR-0139.)* The consumed cross-story seams are exercised real throughout. What the 2026-07-25 re-adjudication makes
explicit (and what the earlier blanket "mocks are forbidden" obscured): the MECHANICS legs are
observable against any run of the right SHAPE, so a machine leg may inject the RUNNER — an offline
scripted `PhaseAuthor`, already blessed for this story by ADR-0010 §5 — rather than bill a live SDK run
on every gate pass. Nothing downstream of that one seam may be faked, and no machine leg may fake the
observable it is asserting.

### ⚠ WHAT THE FIRST DRIVES OF LEGS 9 AND 10 FOUND (2026-08-12) — two reds, NOT the same kind

Both legs flipped to `machine` under ADR-0348 D2/D3 and both gates are RED. **They are red for
completely different reasons, and conflating them would be the expensive mistake here.**

**Leg 9 — a TRUE product red, since RESOLVED by an owner decision (2026-08-19).** The drive walked it for
real (18.8 min: live store up, `pnpm --filter studio dev` up, real Chromium) and then traced the exact
code a studio-UI node Build click executes:

> `devApi.ts` wires `BuildContext.runner = routedBuildRunner(...)`, and `routedBuildRunner`
> (`packages/drive/src/build-worker.ts`) unconditionally calls `nodeBuild(unitId, { real: true,
> dryRun: false, verdictStore: 'pg' })` for ANY node id. **There is no code path from the studio UI to
> `{ live: true }`.** And `packages/drive/src/node-build.ts` produces the synthetic `add(2,3)` pair
> only on the `--live` path, while `--store pg` is explicitly REFUSED for a synthetic walk
> (ADR-0099-B). So `real:true + verdictStore:'pg'` — what the UI always sends — and the synthetic
> `add(2,3)` pair this criterion names are **mutually exclusive by construction.**

The journey leg 9 authorises is therefore structurally unreachable from the studio UI, whichever node
is picked. This is the SAME ADR-0144 divergence the story already documents for sibling leg 8 under
"Known implementation gap" — it had simply never been written down for leg 9. The driver correctly
declined to burn an unrelated capability's uncancelable `--real` build as a diagnostic, since no such
run could satisfy the criterion, and reported `fail` rather than a partial pass.

**That fork was raised to the owner and ANSWERED on 2026-08-14; leg 9 was re-authored on 2026-08-19.**
This paragraph used to read "**The red stays red.** Re-authoring the criterion to match what shipped is
precisely the move ADR-0294 exists to prevent, and the criterion is the older owner-approved claim.
Whether the remedy is to give the UI a `--live` route or to re-adjudicate what leg 9 should promise is
owner / story-author work." That was the correct posture for an agent holding no owner decision, and it
is now overtaken — corrected in place per ADR-0139 rather than left standing as an instruction not to do
what the owner directed.

**The decision was to re-adjudicate leg 9, NOT to give the UI a `--live` route.** Re-authoring a
criterion to match what shipped is ADR-0294's central prohibition when an AGENT does it to dodge a red;
it is not the same act when the OWNER re-decides what the story should promise. The wider framing the
owner gave, which governs more than this leg: **the studio is becoming an OBSERVABILITY LAYER ONLY** —
driving happens from the terminal or an agent harness such as Claude Code desktop, and we will not move
back to studio-UI driving until the system is more mature. So the UI's `--real` node route is not a
divergence to be reverted here; it is what the surface does, and leg 9 now claims it.

**The `--live` genuineness claim was NOT dropped — it was re-homed** to `agent` UAT leg 1 /
`agent#gate-2`, which is where a real `node build <id> --live` smoke is actually driven and witnessed.
See "Where the `--live` claim went" below. What this decision does NOT settle is leg 8, which still
names the `--live`, non-persisting, no-land node route as the accepted target and must still fail; that
is deliberately out of scope here and is carried as an open story-author question below.

**Leg 10 — NOT a product verdict. It has never been successfully driven, and the cause is the
harness.** Three drives, no readable report:

| # | ceiling | wall clock | outcome |
| --- | --- | --- | --- |
| 1 | 30 min | 30.0 min (cut off) | no report → MISS |
| 2 | 60 min | 11.3 min (ended early) | no report → MISS |
| 3 | 45 min | refused before spending | dirty tree — drive 2's orphaned poller was still writing |

Drive 2 is the one that explains it. Its driver wrote a real Playwright harness that navigates to a
story panel, clicks **Build**, and then **polls for up to 40 minutes** waiting for a terminal build
state. Its own session ended after 11.3 minutes — while that poll was still running. The orphan later
reached terminal and wrote `uat-leg10-terminal.png` into the tree, which is both the evidence the walk
was progressing AND what refused drive 3. The screenshot shows the real forest map, the
`context-traversal-telemetry` panel, and three live `work · story:real` claims: **the build genuinely
started.** No report was ever emitted because nobody was left to emit one.

So leg 10's journey is longer than one drive session's turn budget, and the drive harness has no way
to hand a long observation back to a later session. That is a HARNESS gap, not evidence about
approve-to-land. **Do not read this gate's red as a finding about the product, and do not re-author the
criterion on the strength of it.** Two supporting conditions were also measured and are worth knowing
before the next attempt: ports 5173–5178/5190/5199 were all held by OTHER worktrees' studios (drive 2
pointed itself at `localhost:5180`, a JSON-backed sibling studio, not a live-store one from this
checkout), and `SELECT 1` was answering in ~17 s.

**A hypothesis this measurement KILLED, recorded so it is not re-run:** drive 1's timeout looked like
the ceiling being too small for a `story build --real`, and the ceiling was made overridable
(`STORYTREE_UAT_DRIVE_TIMEOUT_MIN`) on that basis. Drive 2 then finished in 11.3 min at a 60-min
ceiling. **The ceiling was never the cause.** The override is still worth having — a fixed ceiling
should not be able to manufacture a red that reads like a product finding — but it does not fix this.

> **Per-leg witness (ADR-0209 §1 / ADR-0106 / ADR-0070).** **RE-ADJUDICATED 2026-07-25** under the
> ADR-0209 §8 corpus-wide witness migration (the third story migrated, after `terminal-repo-picker`
> and `desktop`). The previous pass tagged **seven of eight** legs `witness: human`, leaving only the
> concurrent-build refusal machine-witnessed — the largest human pool left in the corpus. That was
> conservative over-tagging by a weaker pass, not seven irreducible judgment gaps:
> `human-witness-is-a-judgment-gap-not-cost` reserves the human rung for a success condition with **no
> compiler**, and a success that is machine-observable but merely live, expensive, or NOT-YET-HARNESSED
> is `machine`. Re-adjudicating leg by leg resolved this story to eight `machine` legs and three
> `human` legs (eleven, up from eight — the splits below GROW the count).
>
> **NARROWED 2026-08-11 (ADR-0348 D6): the one EXPERIENCE leg is DELETED, so the story now carries
> eight `machine` legs and two `human` legs (ten).** The deleted leg — *"the build affordance and the
> live transcript read right"* (old leg 11) — asked whether this surface is any GOOD, not whether the
> operator's journey achieved its goal. That is continuous owner feedback gathered through use, not a
> discrete pass/fail obligation the story must clear to be green. Its design intent is NOT discarded:
> it is carried in "The build surface's design intent" below. Ordinals are BURNED, not renumbered —
> position 11 is simply absent, so every surviving leg keeps the number it has always had and no signed
> verdict or `(proof-gate:)` binding is silently re-pointed. The two surviving human legs are genuine
> ACCEPTANCE claims about what the operator's own action DID: leg 9 (a genuinely subscription-billed
> run) and leg 10 (an outward-facing landing on trunk).
>
> **ONE irreducible thread ran through nearly every leg, fused onto provable mechanics: a real `--live`
> build is subscription-billed, so an agent must never burn the spend unattended.** That makes the
> SPEND human; it does not make the MECHANICS human. Rather than launder that one claim across four
> legs, it is HOISTED into a single human leg (9), and each mechanic is stated as what it actually is —
> observable against any run of the right SHAPE:
>
> | old leg | machine half | human half |
> | --- | --- | --- |
> | 4 (watch the transcript) | 4 — the poll loop and the transcript's ordered accumulation | 9 — the real SDK leaf genuinely authoring, billed |
> | 6 (the run finishes) | 6 — the terminal envelope and the in-place world repaint | 9 — the billed run behind it |
> | 7 (the verdict is real) | 7 — the `events.verdict` row's spine provenance, and the frontend's non-participation | 9 — a REAL signed verdict needs the billed run |
> | 8 (the scope-routed walls) | 8 — the NODE route opened no worktree, pushed no branch, landed nothing | 10 — the STORY route's non-draft PR auto-merging to trunk |
>
> Legs **1, 2, 3** moved wholesale `human` → `machine`: a startup log line naming `Cloud SQL Postgres`
> plus a `/api/health` payload, a rendered panel's DOM, and a `202`-with-`runId` plus a state flip are
> each byte- or node-level observables with no judgment in them. Leg 1 is LIVE-GATED (it needs a
> reachable store) — expense, not irreducibility.
>
> **The appearance leg was made explicit in 2026-07-25, then deleted in 2026-08-11.** The studio
> button/transcript **appearance** was previously asserted only in this note and carried inside no leg,
> so it could be smuggled into a mechanics leg; the 2026-07-25 pass gave it leg **11** so it stood
> alone. ADR-0348 D6 then deleted it: naming an experience property as its own leg was the right move
> for honesty and the wrong move for a GATE, because it made the story's crown wait on a verdict nobody
> was going to sit down and render. The rule it leaves behind is unchanged and still binding — a
> mechanics leg may never smuggle in an appearance claim; the difference is that the appearance claim
> now has no leg to live in and is design intent instead.
>
> **The harnesses expected to judge the machine legs.** `apps/studio`'s vitest suite
> (`pnpm --filter studio test`) is the home for legs 2–6 and 8: `environment: 'node'` with the component
> tests opting into jsdom per-file (`apps/studio/vitest.config.ts`; `BuildSection.test.tsx:1`), and it
> already drives the real `handleApiRequest` over a real `node:http` server with the runner injected
> (`buildApi.integration.test.ts`). Legs 1 and 7 need a store that suite deliberately does not have —
> `vitest.config.ts` declares it "offline by design: no DB, no gcloud … no network" — so they need a
> **live-gated** spec on the `createTestPool` / `*.live.test.ts` pattern the packages already use
> (`packages/library/src/store/test-db.ts`), which is a NEW surface for `apps/studio` (see "Open
> modeling calls" item 2).
>
> **Nothing here is green.** Per ADR-0209 §6 a re-adjudicated leg returns to UNSTAMPED and earns green
> only under its newly-declared witness. The machine legs are **declared, not proven**: only leg 5 has a
> spec bound to a gate today; legs 2, 3, 4 and 6 are PARTLY covered by existing suites that stop short
> of the integrated observable; legs 1, 7 and 8 have no spec at all, and leg 8 must currently FAIL
> against the known implementation gap. The owner signs nothing as a result of this re-adjudication. The
> story-level `uat_witness` is absent → human (the ADR-0040 fail-closed signpost), so the machine-driven
> whole-story UAT node stays WITHHELD; the crown derives from the per-leg roll-up plus the operator's
> two remaining attestations. Legs 1, 4, 6, 7 and 8 carry seed-canonical `uat-criterion` detail
> artifacts (ADR-0209 §5, under the owner's 2026-07-25 narrower bar: a detail ONLY where the one-line
> title is too thin to judge against, never one per leg) because their stub/fake boundaries, their
> live-gating, and the must-currently-fail wall cannot survive compression to a sentence.

**Goal —** One operator, against `pnpm --filter studio dev` with the live DB up (`pnpm db:up`),
selects a buildable node in the studio world, clicks **Build** in the island side panel, watches a
coarse live transcript stream the phase trail, and sees the run finish at a real signed verdict —
the node's hue updating in the world — entirely on their own machine.

### The build surface's design intent (carried here, deliberately NOT a UAT leg — ADR-0348 D6)

The appearance intent that stood as leg 11 until 2026-08-11 is recorded here so it is not lost with
its leg. **The Build control should sit well in the island side panel; the "building…" state and the
growing coarse transcript should feel ALIVE rather than stalled; the teal in-flight wisp should read
as in-flight on the map; and the finished verdict should read clearly.** Legs 2, 3, 4 and 6 already
machine-pin that the elements exist, that the state flips, that the lines accumulate and that the hue
changes — none of them can say whether the result reads well, and none of them may pretend to. Under
ADR-0348 D6 that reading is not an acceptance criterion: it is continuous feedback the owner gives by
USING the studio, and the honest consequence is that nothing here records whether anyone has looked.
Where it becomes worth carrying a verdict again, ADR-0070 stage 2 at the capability tier is where it
belongs — not a story-tier gate.

### Where the `--live` claim went (2026-08-19) — re-homed, not dropped

Leg 9 used to be the corpus's claim that the **`--live` loop works end to end**: a real subscription
leaf authoring the synthetic `add(2,3)` pair through a genuine RED→GREEN to a signature. When leg 9 was
re-authored to the `--real` journey the UI actually performs, that claim was moved rather than lost —
ADR-0294 D2's obligation, discharged here by NAMING the node and checking what it actually asserts.

**The new home: `agent` UAT leg 1, "The selected live runtime authors a real slice"**
(`stories/agent/story.md`, `uatc_027e3e8ad2253d327fc15c07`), bound to `agent#gate-2`:

```
pnpm --filter @storytree/drive exec node --import tsx \
  src/uat-drive-witness.check.ts agent uatc_027e3e8ad2253d327fc15c07
```

That gate witnesses a persisted `events.uat_drive` record from *"a fresh subscription-funded session
that ran `node build <id> --live` for real and watched the leaf author a red test then a green
implementation under phase-enforced write scope, with the spine's own out-of-band runs deciding
red/green"* (`stories/agent/story.md`, gate 2). That is precisely the claim leg 9 used to carry, and
unlike leg 9 it is reachable: the `--live` smoke is a CLI entry, not a studio-UI one
(`build-worker.ts:329` — *"The synthetic `--live` smoke … is still available at the CLI via
`buildRunnerFromNodeBuild` — it is simply no longer what a human's accept dispatches (ADR-0144)"*).

**It is GREEN, verified rather than assumed.** Running that check on 2026-08-19 exits 0: a model
(`claude-code`) drove the leg end to end and reported `pass` at commit `d5910b6` on 2026-08-12, in
main's ancestry and inside the 90-day freshness floor (run `uat-drive:agent:d5910b62cb:42068`).

**What it proves, and at what rigor — read this before leaning on it.** The witness is a model driver's
REPORT, admitted as a verdict under ADR-0295 D1; the check confirms that a `pass` record exists for the
criterion's CURRENT `revision-id`, that its commit is in HEAD's ancestry, and that it is recent — it
does NOT independently re-derive red→green from exit codes or from an `events.verdict` row. Its own
success line says so: *"a model … drove … end to end and **reported** pass"*. ADR-0295 D2 accepts
false-positive greens as a known cost detected by use, so this is the designed rung and not a defect —
but it means the corpus's standing claim that the live loop runs end to end rests on a model's report,
which is weaker than the `--real` family and should not be cited as though it were equivalent.

**The two nearby rungs, so nobody over- or under-reads this one.** `drive-machinery` legs 1–3
(`witnessable-verdict.check.ts`, `dogfood-witness.check.ts`) are STRONGER — they query `events.verdict`
directly and pass only on a real spine-signed row — but they prove `--real`, not `--live`.
`prove-it-gate.e2e.test.ts` runs on EVERY gate pass and genuinely proves the gate/spine half (real file
writes, real exit codes, real signing on a real `add(2,3)` fixture), but it states at `:26` that "ONLY
the model is scripted", so it cannot witness a real SDK leaf authoring. Between them, the one clause no
standing gate covers is a REAL leaf on the `--live` path — which is exactly why `agent#gate-2` has to
carry it, and exactly why its rigor is worth stating plainly.

### ADR-0294 disposition (2026-08-08): all eleven criteria KEPT, none deleted

Adjudicated against D1/D2 as part of increment 3 and recorded here so a later reader can see this
story was examined rather than skipped. The result is the opposite of the cluster's other stories, and
the reason is specific: **none of `studio-build`'s three capabilities declares a `proof.real.testFile`
at all**, so there is no lower tier to point a D2 deletion at. The obligation D2 puts on a deleting
author — name the node that already proves it — cannot be discharged for any leg here, and D2 says
plainly that a criterion with no such node is not a duplicate.

Leg by leg: legs 1–8 are consecutive steps of one narratable operator journey (start the studio →
open the island panel → click Build → watch the transcript → be refused a second build → reach a
terminal envelope → inspect the verdict's provenance → confirm the no-land walls), which is D1's
shape, and each already records IN ITS OWN TEXT precisely how the existing suites fall short of it
("No spec discharges this at HEAD", "Partly covered at HEAD"). Leg 5 is the only gate-bound one, and
it is bound correctly rather than duplicately: `studio-build#gate-1` observes
`apps/studio/server/buildApi.integration.test.ts`, whose `409` assertion lives inside the single
story-tier walk **“runs an operator-dispatched build from intent to a terminal verdict over the
wire”** — an integration journey, not a capability unit test. Legs 9 and 10 are live human legs (the
subscription-billed run, the outward-facing approve-to-land) belonging to chip `task_47c74cb0`, and
leg 11 was a D3 appearance verdict belonging to chip `task_99f7e0a9`. *(That D3 relocation never
happened and is now moot: ADR-0348 D6 replaced D3's relocate-every-appearance-leg obligation with
deletion for this leg. ADR-0294 D3 still governs where an appearance verdict lives WHEN one is worth
carrying — it is the "every one of them must be relocated" reading that is withdrawn.)*

Nothing here was renumbered by that pass and no reliability gate has ever been touched. The 2026-08-11
ADR-0348 D6 deletion likewise burns ordinal 11 rather than renumbering, and leaves `studio-build#gate-1`
exactly where it is.

### ADR-0294 **D4** pass (2026-08-20): the seven unbound legs declared UNBOUND — still none deleted

The D2 pass above answered *which legs duplicate lower-tier proof* (none, and it says why). This pass
answers the other half of ADR-0294's end state, point 4: **what the machine legs that bind no gate
ARE, now that they are neither deleted nor bound.** For this story that is legs **1, 2, 3, 4, 6, 7 and
8** — every machine leg except 5 (bound to `studio-build#gate-1`), 9 (`#gate-2`) and 10 (`#gate-3`).

**Nothing is deleted, and the reason is the one already recorded above: none of this story's three
capabilities declares a `proof.real.testFile`, so D2's obligation — name the lower-tier node that
already proves it — cannot be discharged for any leg here.** That was re-verified at HEAD on
2026-08-20 against [`build-run-registry`](build-run-registry.md),
[`build-intent-api`](build-intent-api.md) and [`ui-build-trigger`](ui-build-trigger.md); it still
holds. ADR-0294 D5 counts this story's criteria among the 28 it calls untouchable for exactly this
reason, so a later pass arriving here looking for deletions should stop at this paragraph rather than
re-derive it.

**The seven are BOUND as of 2026-08-22 (gates 4–10), and all seven are RED until driven.** Until then
none was, and this paragraph read: *"**Nothing is BOUND either, and that is the deliberate half.** … Binding
any of them to a suite that stops short would be the rubber stamp ADR-0097 §2 forbids and the exact reflex
ADR-0294's end state point 4 names. So each carries a compact **UNBOUND — fails closed** clause instead …
and **no gate is minted for it**."*

**That reasoning is kept, not overridden — it argues against binding to a SUITE, and none of gates 4–10 is
one.** Each of the seven still records IN ITS OWN TEXT how the existing suites fall short — *"No spec
discharges this at HEAD"*, *"Partly covered at HEAD"* — and every shortfall is still a missing INSTRUMENT:
a live-gated studio spec that reaches a real store (legs 1 and 7), a composite-panel render (leg 2), a spec
coupling an accepted intent to a lit wisp (leg 3), a real double-poll of `GET /api/build` (leg 4), a
repaint assertion (leg 6), and for leg 8 a CODE change, since it must currently FAIL against the known
implementation gap. What changed is that the OTHER instrument this story already uses for legs 9 and 10 —
ADR-0295 D1's model-driven executor — reaches all seven, and a drive-witness gate cannot exit 0 without a
recorded `pass` walk of that criterion at its current revision. So the rubber-stamp test is SATISFIED
rather than waived: nothing greens, and every one of the seven is honestly red.

**What forced the question.** The unbound state was never local to these legs. `runAdopt` resolves EVERY
real machine leg before signing any, with no partial verdict set (ADR-0405 D3), so seven unbound legs
refused this story's whole UAT-signing pass and stranded bound legs 5, 9 and 10 — which HAVE gates and
could otherwise be signed. **Binding is not driving:** no drive has been run for any of the seven, and
ADR-0405 D4 leaves a red check red rather than re-driving to chase a pass.

**Ordinals are untouched.** No leg is deleted, so nothing is burned, nothing is renumbered, and
`studio-build#gate-1` / `#gate-2` / `#gate-3` keep their positions — gates 4–10 were APPENDED after them. The five live `uat-criterion`
detail artifacts (`#uat-1`, `#uat-4`, `#uat-6`, `#uat-7`, `#uat-8`) all point at surviving legs, so
none is orphaned.

> **~~Legs 1–10.~~ ALL TEN DELETED 2026-08-24 under ADR-0396 D1. This story now declares NO UAT test
> criteria, and every ordinal 1–11 is BURNED.** `studio-build` is `status: retired` (ADR-0429): its
> whole journey is *"an operator triggers a real node build from the studio UI"*, and that surface is
> gone — ADR-0404 D2/D3/D4 deleted `BuildSection.tsx`, the `POST`/`GET /api/build` transport and the
> `api.build` client pair, and ADR-0422 D1 deleted the engine behind them (`BuildRegistry`,
> `runBuildJob`, `routedBuildRunner`, `build-worker.ts`). A retired story has withdrawn its outcome, so
> its acceptance steps are obligations against a journey nobody will run and no instrument will ever
> discharge. Ordinal 11 was already burned by ADR-0348 D6 (2026-08-11); all ten keys `studio-build#uat-1`
> … `#uat-10` are recorded `superseded` in
> [`stories/uat-legacy-dispositions.json`](../uat-legacy-dispositions.json), and no
> `studio-build#uat-n` key can ever denote a second criterion.
>
> **⚠ This REVERSES the two "none deleted" passes recorded above, and it is a different ground, not a
> reversal of their reasoning.** The 2026-08-08 D2 pass and the 2026-08-20 D4 pass both concluded that
> nothing here could be deleted, and both were RIGHT on their own question: ADR-0294 D2 requires the
> deleting author to name the lower-tier node that already proves the claim, none of this story's three
> capabilities declares a `proof.real.testFile`, so no D2 citation could be discharged for any leg. That
> paragraph told a later pass to *"stop at this paragraph rather than re-derive it"* — and a D2 pass
> should. **ADR-0396 D1 is not a D2 pass.** It does not ask where the proof lives; it observes that
> there is no longer an outcome for a proof to be OF. ADR-0396 D5 makes the retired ground the primary
> one precisely so nobody is forced into 29 citations nobody verified. Both records above stand as
> written and are corrected only where they assert a live posture.
>
> **The three legs that needed an explicit adjudication (ADR-0437), rather than the mechanical rule:**
>
> - **Leg 5** (`uatc_e561d5c581c5ea3374ec5e07`, "a second build while one is running is refused") held
>   the only signed verdicts on this story — `pass` in `events.verdict` twice, `spine@storytree`,
>   `adopted`, at `bf3e8ec4` (2026-08-21) and `089ab013` (2026-08-22). That is exactly the state
>   ADR-0396 D8's fence was written to protect, and the fence does **not** hold, because the proof was
>   never real at either signing. Its gate is `studio-build#gate-1` = `pnpm --filter studio test`,
>   observing the `409` assertion in `apps/studio/server/buildApi.integration.test.ts` — and ADR-0404
>   deleted that file in `902fd9a5`, which is an ANCESTOR OF BOTH commits. No concurrent-build `409`
>   assertion survives anywhere in the studio suite. **Both verdicts were hollow at the moment the spine
>   signed them**: the suite kept exiting 0 on its other tests, and nothing in the signing path can tell
>   that a broad `observe` gate has lost its subject. ADR-0437 D1 narrows D8 to test the proof rather
>   than the row; this is the leg that forced it.
> - **Leg 1** (`uatc_84e580bdf4115de90e35b68e`) is the one whose journey STILL WALKS, and it is deleted
>   anyway. It reads `proven=–` — no verdict, no attestation — but it acquired a genuine `pass` in
>   `events.uat_drive` on 2026-08-24 at `9388c921` (`claude-code-subscription`, revision
>   `uatr1:6ac0e503e389370a`), during the very drive that discovered this story was retired. Its walk is
>   `pnpm db:up` then `pnpm --filter studio dev`, checking the data-api line and `GET /api/health`; it
>   never touches the deleted Build control, so it passed honestly. **Walkability is per LEG, not per
>   story** — but a leg that still walks is not thereby an acceptance claim of a story whose outcome is
>   withdrawn. This is step 1 of a walkthrough whose steps 2–10 are unwalkable, and a precondition that
>   still holds for a journey nobody can complete asserts nothing about the product. Per ADR-0437 D5 and
>   ADR-0396's own Consequences: if live-store reachability deserves a standing story-tier acceptance
>   claim, it belongs to whichever LIVE story owns the studio substrate today, and authoring it there is
>   a separate story-author unit this change deliberately does not perform. A drive record is also not
>   proof credit and never reached D8's fence (ADR-0437 D2) — the spine mints the verdict, and here it
>   never did.
> - **Leg 9** (`uatc_4e688a6e4149741b5dd0a736`) carries two `fail` drive records (2026-08-12, 2026-08-20).
>   A fail is evidence, not an absence, and the 2026-08-12 one is why this story has a "Where the
>   `--live` claim went" section at all: it proved the old `--live` wording structurally unreachable
>   from the UI. That finding is already re-homed in prose above and on `agent` UAT leg 1, so nothing is
>   lost with the leg.
>
> **Every drive and verdict row STAYS** (ADR-0437 D3). `events.verdict`, `events.uat_drive` and
> `events.attestation` are append-only history of what actually ran and when; because
> `rollupCriterionStatus` walks corpus→verdict, rows naming a deleted criterion simply stop being looked
> up and no rung reds. Deleting the criteria removes two false greens from the corpus without erasing
> the record that anything happened.
>
> **What the legs carried is already in the body (ADR-0396 D3), and was not re-derived here.** The
> appearance intent is under *"The build surface's design intent"*; the `--live` genuineness claim is
> under *"Where the `--live` claim went"* and lives on `agent#gate-2`; the node-route persistence
> contradiction leg 7 turned on is open modeling call 3, and leg 8's `--live`-vs-`--real` fault line is
> open modeling call 6 — **both calls survive this deletion and neither is answered by it.** Checked
> before deleting, not after (ADR-0396's Consequences); each is annotated in place below.

**This story declares NO UAT test criteria.** Ordinals 1–11 are all burned — 11 by ADR-0348 D6
(2026-08-11) and 1–10 by the ADR-0396 D1 disposition (2026-08-24). Under ADR-0294 D5 a story may declare
zero criteria and green honestly on the ADR-0085 own-proof union; here all three capabilities are
retired too, so nothing is claimed at any tier. The story crown read `unproven` before this change and
reads the same after — nine of the ten legs were already `proven=–`, so no green was lost.

End state — the operator triggers a real node build from the studio UI and watches it run live to a signed
verdict on their own machine: the live-store precondition, the composed panel and its buildability gate,
the accepted intent and in-flight mark, the polled transcript's accumulation, the concurrent-build
refusal, the terminal envelope and in-place repaint, the verdict's spine provenance, and the node route's
no-land walls all machine-witnessed — and the subscription-billed run itself and the outward-facing
approve-to-land on trunk MODEL-DRIVEN and machine-witnessed too since 2026-08-12 (ADR-0348 D2/D3),
leaving this story with NO operator-attested leg at all. Whether the panel LOOKS right is no longer an
acceptance obligation (ADR-0348 D6); that intent is recorded above and answered by the owner in use.

## Reliability Gates

> ⚠ **ALL TEN GATES ARE NOW UNCLAIMED BY ANY CRITERION (2026-08-24, ADR-0396 D6 / ADR-0437 D6), and
> none may be deleted or renumbered.** Every one of gates 1–10 bound one of the ten legs deleted under
> ADR-0396 D1. Gate ids are minted from 1-based POSITION, so removing one silently re-points
> already-signed verdicts and surviving `(proof-gate:)` bindings — `terminal-tabs` gates 1 and 3 are
> the standing precedent for retained-but-unclaimed gates. **The two shapes now fail differently, and
> the difference matters:**
>
> - **Gates 2–10 are drive-witness gates** (`uat-drive-witness.check.ts <story> <criterion-id>`). Each
>   resolves its criterion id in the story FIRST, so each now exits 1 on the DECLARATION — *"story
>   declares no criterion `uatc_…`"* — rather than on the product. That is honest, it is not a defect to
>   chase, and it means no drive can ever produce a record for any of them again.
> - **Gate 1 is a broad suite gate** (`pnpm --filter studio test`) and is the cautionary one. It kept
>   exiting 0 — and the spine kept signing `studio-build#gate-1` — after ADR-0404 deleted
>   `buildApi.integration.test.ts`, the file holding the only `409` assertion it existed to observe. A
>   suite gate binds a COMMAND, not a claim, so it cannot tell you it has lost its subject. That is what
>   made leg 5's two `proven=✓` greens hollow, and it is the finding ADR-0437's Consequences records as
>   general to suite gates rather than local to this story.

1. **The studio build mechanics suite is green** _(gate: observe)_ `pnpm --filter studio test`.
   The command deterministically exercises the real build API route and registry with scripted
   collaborators: `buildApi.integration.test.ts` proves the second-intent `409` while the original
   run remains live (UAT leg 5). The locked scope-routed walls in UAT leg 8 are not claimed by this
   gate: the current routed-node implementation and suite exercise a different `--real` persisted,
   parked-branch shape. What this gate does NOT claim, after the 2026-07-25 ADR-0209 §8
   re-adjudication: the seven OTHER `machine` legs (1, 2, 3, 4, 6, 7, 8) are declared, not observed
   here — legs 1 and 7 are live-gated and need a spec this offline suite cannot host, legs 2, 3, 4 and 6
   are only partly reached by the existing deterministic tests, and leg 8 must currently fail. It also
   does not claim legs 9 and 10, which carry their own gates below. *(This clause previously ended by
   naming "the three `human` legs (9 …, 10 …, 11 …)" as "never machine-witnessable at all". All three
   statements are now false and are corrected in place per ADR-0139: leg 11 was DELETED by ADR-0348 D6,
   and legs 9 and 10 are `machine` under D2/D3 — the model-driven UAT executor is the harness whose
   absence that sentence was really describing.)*

**Gates 2 and 3 are NEW (2026-08-12, ADR-0348 D2/D3/D5) and were APPENDED — gate 1 kept its ordinal.**
Gate ids are positional (`asset:edit-story-uat-criteria` step 2), so inserting or renumbering would
silently re-point already-signed verdicts and surviving `(proof-gate:)` bindings. Neither carries a
`(covers:)`: they prove a JOURNEY, not a capability, and adding them to a `(covers:)` list would let an
observe-and-sign `adopt` pass green a capability that never went red (ADR-0085 / ADR-0097).

**Neither gate drives anything, and neither spends.** The drive is deliberately out-of-band —
`pnpm --filter @storytree/drive exec node --import tsx src/uat-drive.run.ts studio-build <criterion-id>`
spawns a fresh subscription-funded session that walks the authored journey against the real running
studio and appends a record to `events.uat_drive`. ADR-0010 §5 keeps that off every gate path, exactly
as `dogfood-probe.run.ts` is. The gate is the cheap standing WITNESS of that persisted artifact, and the
spine still mints the verdict over the exit code IT watched, so ADR-0295 D2's *no model signs its own
verdict* holds with the signing path unchanged. A leg is model-driven exactly when the observe gate it
names runs `uat-drive-witness.check.ts` — the binding is self-describing, so nothing needs a second
registry (`packages/drive/src/uat-drive.ts`, `isModelDrivenGate`).

A gate here goes red — honestly, not spuriously — when no `pass` record exists for the criterion's
CURRENT `revision-id`, when the drive's commit is not in HEAD's ancestry, or when the newest record is
older than 90 days (the ADR-0016 ageing floor).

2. **UAT leg 9 — "a real subscription-billed `--real` node run reaches a genuinely signed, persisted verdict" was driven end to end** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts studio-build uatc_4e688a6e4149741b5dd0a736`.
   Witnesses that a model brought the studio up, triggered ONE real build from the UI, and observed the
   click route to `nodeBuild(..., { real: true, verdictStore: 'pg' })`, the real leaf author the NODE'S
   OWN test and implementation in a fresh worktree, the prove-it-gate observe a genuine RED then GREEN
   from real exit codes, the spine sign, and the verdict persist to `events.verdict` with the proven
   commit parked on a `claude/real/<unit>-<run>` branch. *(Re-worded 2026-08-19 with leg 9 itself: this
   gate previously described the synthetic `--live` walk, which no studio-UI click can reach. The gate
   id, its ordinal and its command are UNCHANGED — only the sentence describing what it witnesses moved,
   so no signed verdict or `(proof-gate:)` binding is re-pointed. The `--live` smoke's own witness is
   `agent#gate-2`.)*
3. **UAT leg 10 — "the STORY route's approve-to-land opens a non-draft auto-merging PR" was driven end to end** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts studio-build uatc_891f34bd18df9ce452617b82`.
   Witnesses that a model selected a real-buildable STORY, clicked Build, and observed the worker route
   to `story build <id> --real` and open a NON-DRAFT PR for CI to auto-merge to trunk.

**Gates 4–10 are NEW (2026-08-22, `machine-uat-signing-gap-arc-inc-02`) and were APPENDED — gates 1, 2 and
3 kept their ordinals.** Gate ids are positional (`asset:edit-story-uat-criteria` step 2), so inserting or
renumbering would silently re-point already-signed verdicts and surviving `(proof-gate:)` bindings. None
carries a `(covers:)`: each proves a JOURNEY, not a capability. They are the same neither-drives-nor-spends
witnesses gates 2 and 3 are, on the same honesty terms — red when no `pass` record exists for the
criterion's CURRENT `revision-id`, when the drive's commit is not in HEAD's ancestry, or when the newest
record is older than 90 days. **All seven are RED today** and none has been driven; see "The seven are
BOUND" above for why that is the point rather than a defect, and gate 10 for the one that is expected to
stay red until a code gap closes.

4. **UAT leg 1 — "the studio is running against the live store, so the worker can persist a verdict" was driven end to end** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts studio-build uatc_84e580bdf4115de90e35b68e`.
   Witnesses that a model brought the studio up against the live store and observed the data-api line log
   `library/comments → Cloud SQL Postgres` and `GET /api/health` report `store: 'pg'`, `db: 'ok'` from a REAL
   connection — the reachability `healthApi.integration.test.ts` structurally cannot witness, because its
   `db: 'ok'` is a literal the test supplied.
5. **UAT leg 2 — "the island panel composes the node's surface and gates the Build control on buildability" was driven end to end** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts studio-build uatc_4cc7aac36abad3cdf3033b46`.
   Witnesses that a model opened `#/tree`, clicked a buildable node, and observed the composite
   `aside.tree-detail` panel render the node's status badge, UAT verdict line AND capability sub-DAG with a
   Build control present — present ONLY for a buildable node, absent or disabled WITH the reason otherwise.
   The composite render is the half no existing test performs.
6. **UAT leg 3 — "the Build click dispatches an accepted intent and the world marks the node in flight" was driven end to end** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts studio-build uatc_6ee9d656d0101a623bab3e57`.
   Witnesses the COUPLING both existing suites stub out: that an accepted intent (`202` + `runId`, panel
   flipped to "building…") surfaces as an in-flight `building` work-event through the real `/api/activity`
   pipeline and lights the teal wisp on that node in the world (ADR-0048), with the frontend importing no
   build code.
7. **UAT leg 4 — "the panel polls, and the coarse transcript accumulates the phase trail in order" was driven end to end** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts studio-build uatc_b668fc727a5fc8bf95b9b474`.
   Witnesses accumulation ACROSS successive REAL polls of `GET /api/build?runId=…` — the coarse transcript
   growing line by line with the phase trail in order, then the loop stopping at the terminal poll and never
   polling again. A single GET cannot witness this, and a mocked client is not a real double-poll. It needs
   a run of the right SHAPE, not a billed one; the real billed leaf is leg 9.
8. **UAT leg 6 — "the run reaches a terminal envelope and the world repaints in place, with no manual reload" was driven end to end** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts studio-build uatc_db68af6799a98ffdcfa7e9d5`.
   Witnesses the repaint that is undischarged end to end: a TERMINAL `GET /api/build?runId=…` carrying the
   final envelope (verdict line, signer, cost, phase trail), the panel showing that verdict, and the node's
   hue in the world updating from the freshly signed `events.verdict` through `/api/tree`'s `latestVerdicts`
   — WITHOUT a manual reload, i.e. the terminal poll itself triggering the re-pull.
9. **UAT leg 7 — "the verdict's provenance is the spine's, and the frontend never touched it" was driven end to end** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts studio-build uatc_82ff49ccf66f8dacce8affee`.
   Witnesses that the verdict in `events.verdict` came from a STUDIO-DISPATCHED run and carries a SPINE
   signer — the half a row-reading check cannot supply — and that no `apps/studio/src` path can write a
   verdict at all. **It settles nothing about open modeling call item 3:** whether such a row should exist
   on the node route remains the owner's call, and if it resolves against persistence the leg's claim
   changes and its prose is re-authored, invalidating any drive record by design.
10. **UAT leg 8 — "the NODE route's no-land walls hold" was driven end to end** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts studio-build uatc_b4173ad8a474d2938b6022b5`.
    Witnesses that the node build opened NO git worktree, pushed NO branch and landed nothing, and that the
    remaining walls hold — no hosted run, no `--real` toggle on a single node, no manual `gh pr merge`.
    **This gate is EXPECTED RED** against the "Known implementation gap": `routedBuildRunner` sends a node
    through `nodeBuild(..., { real: true, verdictStore: 'pg' })`, the OPPOSITE of the accepted wall, so a
    drive reports a FAIL. That is the gap stated as a failing obligation, not a manufactured green; making
    it pass is a CODE obligation.

## Proof

**The story carries NO UAT criteria (above) and there is no walkthrough left to pass.** It is
`status: retired` (ADR-0429), all three capabilities retired with it, and the surface the walkthrough
walked was deleted by ADR-0404 / ADR-0422 — so nothing is claimed at any tier. *(This read "The story
carries the UAT (above); it is proven when that walkthrough passes against the real running studio +
the real `--real` node build path the UI actually dispatches, AND its capabilities' integration tests
and contracts pass underneath it", and said `--live` until 2026-08-19. All ten legs were deleted
2026-08-24 under ADR-0396 D1; corrected in place per ADR-0139. The `--live` path's own proof remains
`agent#gate-2`, unaffected.)* The capability/contract obligations were minimal-to-green (slow growth): the
registry state machine and the API dispatch are isolatable and machine-provable; the wiring
capability is an integration test against the real in-story collaborators with the build-path
spawn exercised through the real `nodeBuild` entry (an offline scripted `PhaseAuthor` is acceptable
in the integration test, ADR-0010 §5, to avoid billing a live SDK run on every gate pass — the billed
run is the model-driven UAT leg 9 above, machine-witnessed since 2026-08-12 under ADR-0348 D2 and no
longer an operator obligation). That same ADR-0010 §5 allowance is what makes the
mechanics legs (4, 6) honestly `machine`: their observables hold for any run of the right SHAPE, so
only the spend and the genuineness need the operator.

**Honest status — `proposed`, partially landed with a node-route gap.** The build affordance,
registry/API mechanics, transcript UI, and story `--real` arm landed on `main` (PRs #297 / #299 /
#300), with deterministic component tests reaching several of the legs' observables. Only UAT leg 5 is
formally machine-witnessed; the 2026-07-25 ADR-0209 §8 re-adjudication declared seven more legs
`machine` without proving any of them, and returned every re-adjudicated leg to UNSTAMPED (§6) — the
reclassified legs are not green, they are newly eligible to BE proven. Code is still missing for the
accepted node `--live`, non-persisting, no-branch route: current routing uses `--real`, persists the
verdict, and parks a branch, so UAT leg 8 (now `machine`) must currently fail — a code obligation, not
a re-tag. NO operator obligation remains: legs 9 and 10 were the last two, and ADR-0348 D2/D3 made both
`machine` and model-driven on 2026-08-12 — each now earns green through its own observe gate (2 and 3)
witnessing a `pass` drive record, not through an operator's signature. *(This passage used to read "TWO
operator obligations remain pending: the subscription-billed live run (leg 9) and the outward-facing
approve-to-land on trunk (leg 10)"; corrected in place per ADR-0139.)* The third obligation — the
APPEARANCE attestation per ADR-0070 that stood at leg 11 — went earlier still: ADR-0348 D6 deleted it as
an experience rather than an acceptance claim on 2026-08-11, and its intent is recorded under "The build
surface's design intent" above. `healthy` is earned through the prove-it-gate, never edited here.

## Open modeling calls (for the owner)

> ⚠ **Checked before deleting, not after (ADR-0396's Consequences) — items 2, 3, 4 and 6 below NAME
> deleted legs and are corrected in place; item 1 and item 5 name none and are untouched.** None of
> the four is ANSWERED by the deletion — a retirement withdraws the story's outcome, it does not
> settle a modeling question the story raised along the way — so each is corrected to say what
> survives rather than removed.

1. **Brownfield-downstream wiring-shape check.** You can build DOWNSTREAM of a brownfield story
   (e.g. `drive-machinery` is brownfield — not itself real-buildable, yet the worker drives the
   `nodeBuild`/`storyBuild` entries it owns) — but only if the brownfield upstream's wiring is "in
   the right shape." OPEN: can we have a CHECK that validates that wiring shape BEFORE allowing a
   downstream build, and should the Build affordance surface it? Today `isStoryBuildable(spec, caps,
   'real')` (`packages/orchestrator/src/story-build.ts:234`) only checks the SELECTED story's own
   drive-order proof config — it never inspects an UPSTREAM brownfield's wiring shape, so a downstream
   `story build --real` can proceed on an ill-shaped upstream and only fail deep inside the chain.
   The affordance COULD instead WARN "this story's upstream brownfield isn't in the right shape"
   before offering the build, rather than letting it run and break. Surfaced for the owner — the
   shape of the check (what "right shape" means, where it lives, whether it warns or refuses) is not
   decided here.

Items 2–5 below are raised by the 2026-07-25 ADR-0209 §8 witness re-adjudication (item 6 is later — it
comes from the 2026-08-19 leg 9 re-authoring). None re-opens the
settled design; each is SURFACED, not decided here.

2. **MOOT since 2026-08-24 — its subject legs are deleted.** *(Read "Legs 1 and 7 need a LIVE-GATED
   spec surface `apps/studio` does not yet have …" as history: legs 1 and 7 were deleted under
   ADR-0396 D1 with this story's other eight, so there is no remaining leg for such a surface to
   discharge. If a live-gated `apps/studio` spec surface is worth building on its own merits — leg 1's
   store-reachability claim is exactly the shape ADR-0437 D5 says belongs on whichever LIVE story owns
   the studio substrate — that is a fresh call for whoever authors that claim, not a resumption of this
   one. Corrected in place per ADR-0139.)* Original text: Legs 1 and 7 needed a LIVE-GATED spec surface
   `apps/studio` did not yet have (REQUIRED, outside `stories/**`). `apps/studio/vitest.config.ts`
   declares the suite "offline by design: no DB, no gcloud … no network", and no
   `apps/studio/server/*.test.ts` opens a real connection — every DB-shaped test injects a fake
   (`healthApi.integration.test.ts`'s `HealthDeps`, `dbApi.integration.test.ts`'s `CloudSqlAdmin`,
   `activityApi.integration.test.ts`'s stubbed `inFlightBuilds`). Leg 1 (store-reachability) and leg 7
   (the `events.verdict` row's spine provenance) could not be discharged inside that charter. The
   repo's established pattern is `createTestPool` (`packages/library/src/store/test-db.ts`) with a
   `*.live.test.ts` file that SKIPS when the store is absent rather than failing — but adopting it in
   `apps/studio` was a NEW surface for this app and a deliberate exception to its offline charter.
3. **DISSOLVED, not answered, since 2026-08-24.** *(This item asked whether the accepted NODE route
   persisted its verdict, calling out a genuine three-way internal contradiction between "What this
   is", UAT leg 7, and "Known implementation gap" — deliberately left for the owner. Leg 7 was deleted
   under ADR-0396 D1 with this story's other nine, and the story itself retired (ADR-0429), so there is
   no longer an ACCEPTED node route for either side of the contradiction to be true or false about.
   The question dissolves rather than resolves: nobody decided (c) over (a)/(b) or vice versa, and a
   later reader must not read the deletion as having settled it either way. Original text kept below
   as history per ADR-0396 D3.)* Three statements in this file disagreed, and the re-adjudication
   surfaced the conflict without authority to settle it: (a) "What this is" said "a REAL signed verdict
   for the node persists to `events.verdict`"; (b) UAT leg 7 required that row to exist; (c) "Known
   implementation gap" said the accepted node behavior "remains `--live`, **non-persisting**, and
   no-land", and `buildWorker.test.ts:92-109` pinned `buildRunnerFromNodeBuild` with `verdictStore`
   UNDEFINED, commented "ADR-0099-B no forged persist". If (c) was the true wall, leg 7's observable was
   unreachable by design on the node route and the leg belonged to the STORY route (or to a
   `--live --store pg` variant); if (a)/(b) were, the gap note's "non-persisting" was the stale clause.
4. **MOOT since 2026-08-24 — every leg it names is deleted.** *(This item catalogued the specs still
   needed to discharge legs 1, 2, 3, 4, 6, 7 and 8. All seven — and the eighth, leg 5 — were deleted
   under ADR-0396 D1. There is nothing left to discharge. Kept below as history per ADR-0396 D3; the
   one trap it names — `window.desktopTerminal` present routes a Build click to a terminal SEED rather
   than `/api/build` — is worth carrying forward if a similar surface is ever authored elsewhere, since
   `BuildSection.tsx` itself is gone (ADR-0404 D2).)* Original text: Per ADR-0209 §1 a `witness:` tag
   states which KIND of witness is RIGHT, not that the proof exists. Only leg 5 was bound to a gate.
   Concretely undischarged, with the harness that would judge each: legs 2, 3, 4 and 6 in the EXISTING
   `apps/studio` vitest suite — leg 2 needed the first render of the composite `aside.tree-detail`
   (only `BuildSection` rendered, never the panel that composed the status badge, UAT verdict line and
   sub-DAG); leg 3 needed an accepted intent COUPLED to a lit wisp (`inFlightBuilds` was only
   fold-tested and `activityApi` stubbed it) plus a module-graph assertion that `apps/studio/src`
   reached no build code; leg 4 needed two REAL sequential `GET /api/build?runId=…` polls (the growth
   proof ran against a mocked `api` client) and the first assertion on the phase-trail line; leg 6
   needed the `cost` and phase-trail envelope fields asserted and the repaint-without-reload observed
   (only `onTerminal` firing was pinned). Leg 8 needed an assertion that observed GIT — no test did —
   and could not pass until the node route was restored to `--live`. Legs 1 and 7 needed item 2's
   live-gated surface.
5. **`witness: model` was unavailable, so nothing here was considered for it.** ADR-0209 §1's third rung
   is unreachable at HEAD: `UAT_TEST_CRITERION_WITNESSES` (`packages/library/src/uat-test-criteria.ts`)
   admits only `human`/`machine`/`either`, and proof-protocol's `UatWitness` only `human`/`machine`, so
   writing `model` fails the corpus parse. Every leg here was classified into `machine` or `human`. On the
   evidence this costs nothing for THIS story — no leg turns on semantic judgment of prose or artifacts;
   the human legs are spend, an outward-facing action, and look/feel, none of which a model rung would
   take. Recorded so the owner's open fork on widening the enum is not re-litigated per story.
6. **ANSWERED, more strongly than either option this item posed, by ADR-0429 (2026-08-23).** This item
   asked whether the story's journey was still the accepted target, or should be RE-BOUNDED around
   observing a build driven from elsewhere. Neither happened — ADR-0429 retired `studio-build`
   outright, so the journey stopped being the accepted target and was not replaced by a narrower one.
   That is decisive where "re-bound" would only have been partial: it also settles the "immediate
   consequence" this item flagged — whether leg 8's `--live` walls survive leg 9's `--real` claim — by
   removing both legs rather than by picking a side, since there is no accepted route left for either
   to be true or false about. This is the story-author adjudication the item asked for, arrived at by
   retirement rather than by re-bounding. Original text kept below as history per ADR-0396 D3.*
   Does the whole `--real` UI journey still claim the right thing, now that the studio is an
   OBSERVABILITY LAYER ONLY? (raised 2026-08-19 by the leg 9 re-authoring.) The owner's 2026-08-14
   framing was that driving happens from the terminal or an agent harness and the studio is not a
   driving surface again until the system matures. Leg 9 was re-authored under that framing, but it was
   not the only leg whose subject was an operator DRIVING from the UI: legs 2, 3, 4 and 6 were all "the
   operator clicks Build and watches", and this story's whole outcome sentence was *"An operator
   triggers a real node build from the studio UI…"*. Its immediate consequence: leg 8 named the
   `--live`, non-persisting, no-land node route as the accepted target and "must currently FAIL", while
   leg 9 claimed the `--real`, persisting, branch-parking route as correct — both could not be the
   accepted target, and nothing in the 2026-08-14 decision settled which.
