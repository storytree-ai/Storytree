---
id: "studio-build"
tier: story
title: "UI-driven build (the local loop)"
outcome: "An operator triggers a real node build from the studio UI and watches it run live to a signed verdict on their own machine."
status: proposed
proof_mode: UAT
capabilities: [build-run-registry, build-intent-api, ui-build-trigger]
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
That is a code divergence, not a new acceptance rule: the desired node route is **UNBUILT**, and UAT
leg 8 must fail until implementation once again matches the locked `--live` walls.

## Honest proof posture — `proposed`, with a node-route gap

This spec was authored FIRST, before any implementation, to bound the journey and size the units;
most mechanics then LANDED (PRs #297 / #299 / #300), but the current routed-node implementation is
not reconciled to the accepted `--live` behavior above.
Every contract below describes the isolated unit test that proves a leaf; the capability describes
the integration test that proves it against real in-story collaborators; the story UAT below
describes the acceptance walkthrough that proves the whole loop against the real running studio.
Deterministic component and integration tests already reach several of those legs' observables, but
only UAT leg 5 is formally machine-witnessed through the exact observe gate below — the 2026-07-25
ADR-0209 §8 re-adjudication DECLARED eight legs machine without claiming any of them proven (§6
returns every re-adjudicated leg to UNSTAMPED). Status stays `proposed` because code work remains to
restore the locked node `--live` route, because seven of the eight machine legs still await a spec that
discharges them, and because legs 9 and 10 still await a `pass` drive record at their current
revisions. *(This clause used to say `healthy` "additionally requires the three remaining operator
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

The integrated **acceptance walkthrough** that proves the whole `studio-build` organism — the Phase
1 local loop — meets its outcome end-to-end against the **real running studio** and the **real build
path**. It is minimal-first (one coherent operator journey: trigger → watch → verdict), defect-
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

**Nothing is BOUND either, and that is the deliberate half.** Each of the seven already records IN ITS
OWN TEXT how the existing suites fall short of it — *"No spec discharges this at HEAD"*, *"Partly
covered at HEAD"* — and every one of those shortfalls is a missing INSTRUMENT, not a missing binding:
a live-gated studio spec that reaches a real store (legs 1 and 7), a composite-panel render (leg 2), a
spec coupling an accepted intent to a lit wisp (leg 3), a real double-poll of `GET /api/build` (leg
4), a repaint assertion (leg 6), and for leg 8 a CODE change, since it must currently FAIL against the
known implementation gap. Binding any of them to a suite that stops short would be the rubber stamp
ADR-0097 §2 forbids and the exact reflex ADR-0294's end state point 4 names. So each carries a compact
**UNBOUND — fails closed** clause instead: it declares no `(proof-gate:)`, `resolveWitness` refuses it
(`coverage: "refused"`), no adopt pass can sign it, and **no gate is minted for it**. `library` leg 6
and `proof-binding-integrity` leg 1 are the precedent this follows; PR #1444's desktop terminal
cluster is the worked example at scale.

**Ordinals are untouched.** No leg is deleted, so nothing is burned, nothing is renumbered, and
`studio-build#gate-1` / `#gate-2` / `#gate-3` keep their positions. The five live `uat-criterion`
detail artifacts (`#uat-1`, `#uat-4`, `#uat-6`, `#uat-7`, `#uat-8`) all point at surviving legs, so
none is orphaned.

1. **The studio is running against the live store, so the worker can persist a verdict.** _(criterion-id: uatc_84e580bdf4115de90e35b68e)_ _(revision-id: uatr1:9d61fb1696f7277e)_ _(previous-revision-id: uatr1:282cf28df059352b)_
   _(witness: machine)(detail: studio-build#uat-1)_ Start the studio with the live store up: `pnpm db:up`, then
   `pnpm --filter studio dev` (the live backend is the default). **Success —** the data-api line logs
   `library/comments → Cloud SQL Postgres`, and `GET /api/health` reports the live store reachable
   (`store: 'pg'`, `db: 'ok'`) from a REAL connection, not an injected probe. *(Machine, not human: a
   startup log line and a JSON payload are string comparisons with no judgment in them. It is
   LIVE-GATED — it needs a reachable Cloud SQL instance — which makes it expensive, not irreducible.)*
   **No spec discharges this at HEAD:** `healthApi.integration.test.ts` asserts the payload SHAPE over a
   fully injected `HealthDeps` whose `db: 'ok'` is a literal the test supplied, so it structurally cannot
   witness reachability.
   **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20).** No `(proof-gate:)`: what is missing is a live-gated
   studio spec that opens a REAL connection, and nothing persisted today records this precondition, so
   `resolveWitness` refuses it (`coverage: "refused"`). No gate is minted to host it (ADR-0097 §2) —
   binding it to the injected-deps suite would assert the opposite of what the leg claims.
2. **The island panel composes the node's surface and gates the Build control on buildability.** _(criterion-id: uatc_4cc7aac36abad3cdf3033b46)_ _(revision-id: uatr1:4a5d1acc65a310d2)_ _(previous-revision-id: uatr1:54ff1a49e5ceb3c8)_
   _(witness: machine)_ Open `#/tree`, click a buildable node (e.g. a `drive-machinery` node) to open the
   island side panel. **Success —** the `<aside className="tree-detail">` panel renders the node's status
   badge, UAT verdict line, and capability sub-DAG, AND a **Build** control is present — present ONLY for
   a buildable node: a non-buildable node shows no button, or a disabled one, WITH the reason. Observed
   as the composed panel's DOM under jsdom. *(Machine, not human: which elements a panel renders for a
   given payload is a DOM query, and the buildability gate is a pure branch on a wire flag. Whether the
   panel READS well is no leg's claim since ADR-0348 D6 — design intent above, never this one's.)* **Partly covered at HEAD:**
   `BuildSection.test.tsx:56-83` already pins the Build control's presence and its
   absence-with-a-reason, and `treeBuildable.test.ts` pins the `buildable`/`goGreen` flags the panel
   branches on — but NO test renders the composite `aside.tree-detail`, so the badge + verdict line +
   sub-DAG half is undischarged.
   **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20).** No `(proof-gate:)`: the undischarged half IS the
   composite this leg names, so `resolveWitness` refuses it (`coverage: "refused"`). No gate is minted
   to host it (ADR-0097 §2) — the partial suites green their own targets, never this journey step.
3. **The Build click dispatches an accepted intent and the world marks the node in flight.** _(criterion-id: uatc_6ee9d656d0101a623bab3e57)_ _(revision-id: uatr1:2d380672ffd29632)_ _(previous-revision-id: uatr1:b37a2a2b477666a1)_
   _(witness: machine)_ Click **Build**. **Success —** the client POSTs `/api/build { unitId }`, the
   server answers `202` with a `runId`, the panel flips into a "building…" state showing the transcript
   region, and the node's in-flight `building` work-event surfaces through the existing `/api/activity`
   pipeline so the teal wisp lights on it in the world (ADR-0048) — proving the intent was accepted and
   the worker started WITHOUT the frontend importing any build code (ADR-0004 / ADR-0090 d.2, observable
   as a module-graph assertion: nothing under `apps/studio/src` reaches `packages/agent` or the gate).
   *(Machine, not human: an HTTP status, a `runId`, a rendered state, an activity row and an import graph
   are all decidable. The wisp's HUE reading as "in flight" is design intent above, carried by no leg since ADR-0348 D6.)* **Partly covered at HEAD:**
   `buildApi.integration.test.ts:83-86` pins the `202` + `runId` over the real wire and
   `BuildSection.test.tsx:69-83` pins the click → single POST → "building…" flip — but nothing couples an
   accepted intent to a lit wisp: `inFlightBuilds.test.ts` folds rows only (its own header defers the
   live SQL) and `activityApi.integration.test.ts` stubs `inFlightBuilds` outright.
   **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20).** No `(proof-gate:)`: the coupling this leg turns on —
   an accepted intent reaching the map as a lit wisp — is exactly what both suites stub out, so
   `resolveWitness` refuses it (`coverage: "refused"`). No gate is minted to host it (ADR-0097 §2).
4. **The panel polls, and the coarse transcript accumulates the phase trail in order.** _(criterion-id: uatc_b668fc727a5fc8bf95b9b474)_ _(revision-id: uatr1:fdcc7bda60545265)_ _(previous-revision-id: uatr1:cf16cc9443cf90a6)_
   _(witness: machine)(detail: studio-build#uat-4)_ Watch the transcript. **Success —** the panel POLLS `GET /api/build?runId=…`
   repeatedly and the coarse transcript GROWS line by line across successive REAL polls — the phase trail
   (AUTHOR_TEST → … → GATE) and progress lines, in order — then the loop stops at the terminal poll and
   never polls again. (The transcript is COARSE by design, not a raw model log.) *(Machine, not human:
   "poll N showed these lines, poll N+1 showed those" is an ordered-list comparison. It needs a run of
   the right SHAPE, not a billed one — the Proof section below already blesses an offline scripted
   `PhaseAuthor` here per ADR-0010 §5; the real billed leaf is leg 9.)* **Partly covered at HEAD:**
   `BuildSection.test.tsx:99-132` proves the growth and the loop teardown against a MOCKED `api` client,
   and `buildRegistry.test.ts:52-68` proves ordered accumulation inside the registry — but no test polls
   the real `GET /api/build` endpoint twice (`buildApi.integration.test.ts:89-94` GETs once), and the
   phase TRAIL is seeded into a fixture at `:110` yet asserted nowhere.
   **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20).** No `(proof-gate:)`: a single GET cannot witness
   accumulation ACROSS polls, which is the claim, so `resolveWitness` refuses it
   (`coverage: "refused"`). No gate is minted to host it (ADR-0097 §2) — the instrument is a real
   double-poll, and a mocked client is not one.
5. **A second build while one is running is refused.** _(witness: machine)_ _(criterion-id: uatc_e561d5c581c5ea3374ec5e07)_ _(revision-id: uatr1:4b5ab3273c013e40)_
   _(proof-gate: studio-build#gate-1)_ Attempt a second build while the first is running (click Build
   again, or POST a second intent). **Success —** the server REFUSES the concurrent build (`409`, "a
   build is already running") — the single-build-at-a-time guard holds; the running build is unaffected.
   *(Unchanged by the 2026-07-25 re-adjudication — already machine, and still the one leg bound to the
   observe gate below.)*
6. **The run reaches a terminal envelope and the world repaints in place, with no manual reload.** _(criterion-id: uatc_db68af6799a98ffdcfa7e9d5)_ _(revision-id: uatr1:26e046252dad4c51)_ _(previous-revision-id: uatr1:60706e2d853964bc)_
   _(witness: machine)(detail: studio-build#uat-6)_ Let the build finish. **Success —** `GET /api/build?runId=…` reports a TERMINAL
   status carrying the final build envelope (verdict line, signer, cost, phase trail); the panel shows
   that verdict; and the node's hue in the world updates to reflect the freshly signed `events.verdict`
   through the existing `/api/tree` `latestVerdicts` path — WITHOUT a manual reload, i.e. the terminal
   poll itself triggers the re-pull. *(Machine, not human: a terminal status, the envelope's fields, and
   "the tree was re-fetched and the hue changed with no navigation" are all observable. The billed run
   behind it is leg 9; whether the finished panel LOOKS right is design intent above, carried by no leg since ADR-0348 D6.)* **Partly covered at HEAD:**
   the terminal status + envelope are pinned at `buildApi.integration.test.ts:112-113`,
   `buildRegistry.test.ts:90-122` and `BuildSection.test.tsx:124-125` (verdict + signer) — but `cost` and
   the `phase trail` line sit in fixtures and are asserted NOWHERE, and the repaint is entirely
   undischarged: only `onTerminal` firing exactly once is pinned (`BuildSection.test.tsx:232-257`), never
   that the callback re-pulls `/api/tree` or that a hue changed.
   **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20).** No `(proof-gate:)`: the in-place repaint is
   undischarged end to end and nothing persists a record of it, so `resolveWitness` refuses it
   (`coverage: "refused"`). No gate is minted to host it (ADR-0097 §2) — binding it to the
   `onTerminal`-fires-once assertion would sign a callback, not a repaint.
7. **The verdict's provenance is the spine's, and the frontend never touched it.** _(criterion-id: uatc_82ff49ccf66f8dacce8affee)_ _(revision-id: uatr1:3167f3d198d9bc9f)_ _(previous-revision-id: uatr1:842a0495fc3f4630)_
   _(witness: machine)(detail: studio-build#uat-7)_ Confirm the verdict is real and persisted. **Success —** `storytree tree
   <unitId>` (or the DB directly) shows the new signed verdict in `events.verdict` carrying a SPINE
   signer — a gate verdict produced by the spine's observed red→green (ADR-0091's "the verdict is
   produced by the gate, never handed in"), not a hue handed in by the UI — and no `apps/studio/src` path
   can write a verdict at all (no verdict-write route, no signer import). *(Machine, not human: a row's
   presence and its signer field are DB reads, and "the frontend holds no write path" is a route-table
   plus module-graph assertion. It is LIVE-GATED on a reachable store — expense, not irreducibility. That
   the verdict came from a REAL BILLED run is leg 9's claim, not this one's.)* **No spec discharges this
   at HEAD:** no `apps/studio` test touches a real DB. **The persistence half is contingent on an
   unresolved acceptance question** — the accepted node route is declared NON-persisting under "Known
   implementation gap", which this leg's `events.verdict` row would contradict; see "Open modeling calls"
   item 3, which this re-adjudication surfaces rather than settles.
   **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20).** No `(proof-gate:)`. `drive-machinery`'s
   `witnessable-verdict.check.ts` reads `events.verdict` rows directly, so a check of that shape is the
   instrument this leg eventually wants — but a persisted verdict alone cannot say the run was
   STUDIO-dispatched, which is the claim, and item 3 has not settled whether such a row should exist on
   this route at all. So it stays refused (`coverage: "refused"`) and no gate is minted for it
   (ADR-0097 §2).
8. **The NODE route's no-land walls hold.** _(witness: machine)(detail: studio-build#uat-8)_ Confirm the scope-routed walls on the _(criterion-id: uatc_b4173ad8a474d2938b6022b5)_ _(revision-id: uatr1:7484251c58a3db62)_ _(previous-revision-id: uatr1:0452675ea9918025)_
   node path (this walkthrough's steps 1–7). **Success —** the node build was the single-node `--live`
   local smoke: it opened NO git worktree, pushed NO branch, and landed nothing — and the remaining walls
   hold: no hosted run, no `--real` toggle on a single node, no manual `gh pr merge`. *(Machine, not
   human: worktree/branch/ref state before and after a run is `git` output, and the routed options a node
   id resolves to are directly inspectable. Nothing here is a judgment.)* **This leg must currently FAIL,
   by design** (see "Known implementation gap" above): `routedBuildRunner` sends a node through
   `nodeBuild(..., { real: true, verdictStore: 'pg' })`, and `buildWorker.test.ts:135-159` pins exactly
   that `--real`, persisting, parked-branch shape — the OPPOSITE of the accepted wall. No test observes
   git at all; the `park` claim there is only that a transcript LINE mentions parking. Making this leg
   pass is a CODE obligation, not a re-tag.
   **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20).** No `(proof-gate:)`, and here that is doubly
   deliberate: a leg that must currently FAIL may not be bound at all, because the only suite observing
   this shape pins the OPPOSITE wall and binding to it would manufacture a green over a known gap.
   `resolveWitness` refuses it (`coverage: "refused"`) and no gate is minted for it (ADR-0097 §2).
9. **A real subscription-billed `--real` node run drives the loop to a genuinely signed, persisted verdict.** _(criterion-id: uatc_4e688a6e4149741b5dd0a736)_ _(revision-id: uatr1:374f40689b49037d)_ _(previous-revision-id: uatr1:5418a7aa38bfbe79)_
   _(witness: machine)_ _(proof-gate: studio-build#gate-2)_ The driver triggers ONE real build from the studio UI and lets it run: the
   click routes through `routedBuildRunner` to `nodeBuild(unitId, { real: true, dryRun: false,
   verdictStore: 'pg' })` (ADR-0144), a real subscription-funded Claude Agent SDK leaf genuinely authors
   THE NODE'S OWN test and implementation at their real repo paths in a fresh git worktree under
   phase-enforced write scope, the real prove-it-gate observes a genuine RED then GREEN from real exit
   codes, and the spine SIGNS. **Success —** a `pass` drive record whose walk reports the run reached a
   spine-signed verdict PERSISTED to `events.verdict`, that the verdict legs 6 and 7 inspect came from
   it, and that a PASS parked the proven commit on a `claude/real/<unit>-<run>` branch without opening a
   PR (ADR-0031/ADR-0136 — only a STORY route lands, which is leg 10). *(`machine` since 2026-08-12
   under ADR-0348 D2. It was `human` on a SPEND basis — "a subscription-billed build is REAL SPEND; an
   agent may never burn it unattended" — and D2 retires exactly that basis: the spend is a routine
   factory action, not a judgment gap (`asset:human-witness-is-a-judgment-gap-not-cost`). Nothing here
   ever turned on taste. ADR-0010 §5 still keeps the spend off every gate pass: the drive is
   deliberately out-of-band and the gate below only WITNESSES its persisted record. Every MECHANIC
   observable during such a run is machine-witnessed above; this leg is the genuineness of a billed run,
   nothing else.)*

   **RE-AUTHORED 2026-08-19 (owner-directed) — this leg used to name the synthetic `--live` `add(2,3)`
   pair, and that claim MOVED rather than being dropped.** The 2026-08-12 drive below proved the old
   wording structurally unreachable: the studio UI has no code path to `{ live: true }`, and `--store pg`
   is refused for a synthetic walk (`node-build.ts:486`, ADR-0099-B), so `--live` and the persisting
   journey legs 6/7 depend on are mutually exclusive BY CONSTRUCTION. The owner's decision was to keep a
   leg that claims the journey the UI actually performs and re-home the `--live` genuineness claim,
   NOT to build a `--live` route into the studio — the studio is becoming an OBSERVABILITY layer, with
   driving done from the terminal or an agent harness. **Note what did NOT change: the genuineness is
   intact and arguably stronger.** `--real` bills a real subscription leaf exactly as `--live` does
   (`node-build.ts:1136-1138`); the difference is only WHAT the leaf authors — a real contract's own
   test/impl instead of a throwaway `add(2,3)` fixture. **Where the `--live` claim now lives:** the
   `agent` story's UAT leg 1, "The selected live runtime authors a real slice"
   (`uatc_027e3e8ad2253d327fc15c07`), bound to `agent#gate-2` — see "Where the `--live` claim went"
   below for what that node does and does not prove.
10. **The STORY route's approve-to-land opens a non-draft PR that CI auto-merges to trunk.** _(criterion-id: uatc_891f34bd18df9ce452617b82)_ _(revision-id: uatr1:321ad0444900b10d)_ _(previous-revision-id: uatr1:cb9c0cf57e608abf)_
    _(witness: machine)_ _(proof-gate: studio-build#gate-3)_ Select a real-buildable STORY (no capability drilled) and click **Build**: the
    worker routes to `story build <id> --real`, which authors each capability for real and, on a GREEN
    chain, opens a **non-draft PR that CI auto-merges to trunk** (ADR-0022; `claude/real/*` promotion
    branches merge non-squash per ADR-0031). Clicking Build IS the approval to land (ADR-0090 Phase 2).
    **Success —** a `pass` drive record whose walk reports the click landed the change on trunk.
    *(`machine` since 2026-08-12 under ADR-0348 D3. It was `human` because this is an OUTWARD-FACING
    action against the real repository — it opens a PR that merges to `main` — and D3 retires that
    basis: the merge ceremony performs exactly this unattended every day, so it is a routine factory
    action rather than a judgment gap. ADR-0348 D4 governs the driver inside the walk: it proceeds on
    its own judgment through the outward-facing step and raises an `open-question` only when IT is
    unsure. `human-owns-the-outer-loop` and `approval-gated-trunk` are untouched everywhere else. The
    ROUTING half — that a story id resolves to `storyBuild` with `openPr: true` and a node id never
    does — remains machine, pinned at `buildWorker.test.ts:113-159`.)*
End state — the operator triggers a real node build from the studio UI and watches it run live to a signed
verdict on their own machine: the live-store precondition, the composed panel and its buildability gate,
the accepted intent and in-flight mark, the polled transcript's accumulation, the concurrent-build
refusal, the terminal envelope and in-place repaint, the verdict's spine provenance, and the node route's
no-land walls all machine-witnessed — and the subscription-billed run itself and the outward-facing
approve-to-land on trunk MODEL-DRIVEN and machine-witnessed too since 2026-08-12 (ADR-0348 D2/D3),
leaving this story with NO operator-attested leg at all. Whether the panel LOOKS right is no longer an
acceptance obligation (ADR-0348 D6); that intent is recorded above and answered by the owner in use.

## Reliability Gates

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

## Proof

The story carries the UAT (above); it is proven when that walkthrough passes against the real
running studio + the real `--real` node build path the UI actually dispatches, AND its capabilities'
integration tests and contracts pass underneath it. *(Said `--live` until 2026-08-19; corrected in place
with leg 9 — no studio-UI click reaches `--live`. The `--live` path's own proof is `agent#gate-2`.)* The capability/contract obligations are minimal-to-green (slow growth): the
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

2. **Legs 1 and 7 need a LIVE-GATED spec surface `apps/studio` does not yet have (REQUIRED, outside
   `stories/**`).** `apps/studio/vitest.config.ts` declares the suite "offline by design: no DB, no
   gcloud … no network", and no `apps/studio/server/*.test.ts` opens a real connection — every DB-shaped
   test injects a fake (`healthApi.integration.test.ts`'s `HealthDeps`, `dbApi.integration.test.ts`'s
   `CloudSqlAdmin`, `activityApi.integration.test.ts`'s stubbed `inFlightBuilds`). Leg 1
   (store-reachability) and leg 7 (the `events.verdict` row's spine provenance) cannot be discharged
   inside that charter. The repo's established pattern is `createTestPool`
   (`packages/library/src/store/test-db.ts`) with a `*.live.test.ts` file that SKIPS when the store is
   absent rather than failing — but adopting it in `apps/studio` is a NEW surface for this app and a
   deliberate exception to its offline charter. OPEN for the owner/orchestrator: introduce
   `apps/studio/server/*.live.test.ts` under that pattern, or host these two legs' specs in a package
   that already has the live harness. Either way the work is in `apps/studio/**` or `packages/**` —
   **outside the story-author's fence** — flagged so it lands with the legs it proves.
3. **Does the accepted NODE route persist its verdict, or not? (a genuine internal contradiction in this
   spec, deliberately NOT resolved here).** Three statements in this file disagree, and the
   re-adjudication surfaced the conflict without authority to settle it: (a) "What this is" says "a REAL
   signed verdict for the node persists to `events.verdict`"; (b) UAT leg 7 requires that row to exist;
   (c) "Known implementation gap" says the accepted node behavior "remains `--live`, **non-persisting**,
   and no-land", and `buildWorker.test.ts:92-109` pins `buildRunnerFromNodeBuild` with `verdictStore`
   UNDEFINED, commented "ADR-0099-B no forged persist". If (c) is the true wall, leg 7's observable is
   unreachable by design on the node route and the leg belongs to the STORY route (or to a
   `--live --store pg` variant); if (a)/(b) are, the gap note's "non-persisting" is the stale clause.
   This is an ACCEPTANCE question, not a witness question — the spec's own instruction is "do not
   redefine the target" — so it goes to the owner. Leg 7 is left as authored, with the contingency
   stated in the leg. Note this predates the re-adjudication; it was not introduced by it.
4. **The specs that discharge the eight machine legs do NOT exist yet (outside `stories/**`).** Per
   ADR-0209 §1 a `witness:` tag states which KIND of witness is RIGHT, not that the proof exists. Only
   leg 5 is bound to a gate today. Concretely undischarged, with the harness that would judge each:
   legs 2, 3, 4 and 6 in the EXISTING `apps/studio` vitest suite — leg 2 needs the first render of the
   composite `aside.tree-detail` (today only `BuildSection` renders, never the panel that composes the
   status badge, UAT verdict line and sub-DAG); leg 3 needs an accepted intent COUPLED to a lit wisp
   (`inFlightBuilds` is only fold-tested and `activityApi` stubs it) plus a module-graph assertion that
   `apps/studio/src` reaches no build code; leg 4 needs two REAL sequential `GET /api/build?runId=…`
   polls (the growth proof today runs against a mocked `api` client) and the first assertion on the
   phase-trail line; leg 6 needs the `cost` and phase-trail envelope fields asserted and the
   repaint-without-reload observed (today only `onTerminal` firing is pinned). Leg 8 needs an assertion
   that observes GIT — no test does today — and cannot pass until the node route is restored to `--live`.
   Legs 1 and 7 need item 2's live-gated surface. All of this is `apps/studio/**` work — **outside the
   story-author's fence** — flagged so it lands with whoever builds these legs. One trap for that
   builder: `BuildSection.test.tsx:612-688` shows that when `window.desktopTerminal` is present a Build
   click SEEDS a terminal command and never POSTs `/api/build` at all, so any new end-to-end assertion on
   the click → `202` path must pin the no-bridge branch.
5. **`witness: model` was unavailable, so nothing here was considered for it.** ADR-0209 §1's third rung
   is unreachable at HEAD: `UAT_TEST_CRITERION_WITNESSES` (`packages/library/src/uat-test-criteria.ts`)
   admits only `human`/`machine`/`either`, and proof-protocol's `UatWitness` only `human`/`machine`, so
   writing `model` fails the corpus parse. Every leg here was classified into `machine` or `human`. On the
   evidence this costs nothing for THIS story — no leg turns on semantic judgment of prose or artifacts;
   the human legs are spend, an outward-facing action, and look/feel, none of which a model rung would
   take. Recorded so the owner's open fork on widening the enum is not re-litigated per story.
6. **Does the whole `--real` UI journey still claim the right thing, now that the studio is an
   OBSERVABILITY LAYER ONLY? (raised 2026-08-19 by the leg 9 re-authoring; deliberately NOT decided
   here, and NOT a witness question.)** The owner's 2026-08-14 framing is that driving happens from the
   terminal or an agent harness and the studio is not a driving surface again until the system matures.
   Leg 9 was re-authored under that framing, but it is not the only leg whose subject is an operator
   DRIVING from the UI: legs 2, 3, 4 and 6 are all "the operator clicks Build and watches", and this
   story's whole outcome sentence is *"An operator triggers a real node build from the studio UI…"*. If
   the studio is observability-only, the honest question is whether this story's journey is still the
   accepted target at all, or whether it should be re-bounded around OBSERVING a build driven from
   elsewhere. That is a re-bounding of the story, not a re-tagging of a leg, so it belongs to
   `story-author` with the owner — one adjudication across the whole surface, not leg by leg.
   **Its immediate consequence, already visible in this file:** leg 8 still names the `--live`,
   non-persisting, no-land node route as the accepted target and "must currently FAIL", while leg 9 now
   claims the `--real`, persisting, branch-parking route as correct. Both cannot be the accepted target.
   That contradiction is not new — item 3 above records the same fault line from the persistence angle
   and predates this edit — but the leg 9 re-authoring makes it explicit rather than latent, and it is
   named here so the next reader does not mistake it for damage done by this change. **Nothing in the
   2026-08-14 decision settles it:** the owner directed that leg 9 be re-authored and that no `--live`
   route be built into the studio UI; that is silent on whether leg 8's locked walls survive.
