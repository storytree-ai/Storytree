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
discharges them, and because `healthy` additionally requires the three remaining operator obligations
(the billed live run, the outward-facing approve-to-land, and the APPEARANCE attestation per ADR-0070);
it is never authored. The build-path collaborators
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
The journey is proven against a REAL `--live` build — the SDK leaf genuinely authoring, the spine
genuinely signing — and that genuineness is leg 9's own claim, the one an agent may never manufacture.
The consumed cross-story seams are exercised real throughout. What the 2026-07-25 re-adjudication makes
explicit (and what the earlier blanket "mocks are forbidden" obscured): the MECHANICS legs are
observable against any run of the right SHAPE, so a machine leg may inject the RUNNER — an offline
scripted `PhaseAuthor`, already blessed for this story by ADR-0010 §5 — rather than bill a live SDK run
on every gate pass. Nothing downstream of that one seam may be faked, and no machine leg may fake the
observable it is asserting.

> **Per-leg witness (ADR-0209 §1 / ADR-0106 / ADR-0070).** **RE-ADJUDICATED 2026-07-25** under the
> ADR-0209 §8 corpus-wide witness migration (the third story migrated, after `terminal-repo-picker`
> and `desktop`). The previous pass tagged **seven of eight** legs `witness: human`, leaving only the
> concurrent-build refusal machine-witnessed — the largest human pool left in the corpus. That was
> conservative over-tagging by a weaker pass, not seven irreducible judgment gaps:
> `human-witness-is-a-judgment-gap-not-cost` reserves the human rung for a success condition with **no
> compiler**, and a success that is machine-observable but merely live, expensive, or NOT-YET-HARNESSED
> is `machine`. Re-adjudicating leg by leg resolves this story to **eight `machine` legs and three
> `human` legs** (eleven, up from eight — the splits below GROW the count).
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
> **The appearance leg is now explicit.** The studio button/transcript **appearance** — does the panel
> read well, does the live transcript feel alive — was previously asserted only in this note and carried
> inside no leg, so it could be smuggled into a mechanics leg. It is now leg **11**. ADR-0070's
> two-stage proof stands unchanged: the agent builds the look behind the existing studio surface,
> surfaces it, and STOPS; the owner's nod is the visual verdict. ADR-0209 keeps look, feel and lived
> experience on the human rung, never machine-asserted nor model-judged.
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
> three remaining attestations. Legs 1, 4, 6, 7 and 8 carry seed-canonical `uat-criterion` detail
> artifacts (ADR-0209 §5, under the owner's 2026-07-25 narrower bar: a detail ONLY where the one-line
> title is too thin to judge against, never one per leg) because their stub/fake boundaries, their
> live-gating, and the must-currently-fail wall cannot survive compression to a sentence.

**Goal —** One operator, against `pnpm --filter studio dev` with the live DB up (`pnpm db:up`),
selects a buildable node in the studio world, clicks **Build** in the island side panel, watches a
coarse live transcript stream the phase trail, and sees the run finish at a real signed verdict —
the node's hue updating in the world — entirely on their own machine.

1. **The studio is running against the live store, so the worker can persist a verdict.**
   _(witness: machine)(detail: studio-build#uat-1)_ Start the studio with the live store up: `pnpm db:up`, then
   `pnpm --filter studio dev` (the live backend is the default). **Success —** the data-api line logs
   `library/comments → Cloud SQL Postgres`, and `GET /api/health` reports the live store reachable
   (`store: 'pg'`, `db: 'ok'`) from a REAL connection, not an injected probe. *(Machine, not human: a
   startup log line and a JSON payload are string comparisons with no judgment in them. It is
   LIVE-GATED — it needs a reachable Cloud SQL instance — which makes it expensive, not irreducible.)*
   **No spec discharges this at HEAD:** `healthApi.integration.test.ts` asserts the payload SHAPE over a
   fully injected `HealthDeps` whose `db: 'ok'` is a literal the test supplied, so it structurally cannot
   witness reachability.
2. **The island panel composes the node's surface and gates the Build control on buildability.**
   _(witness: machine)_ Open `#/tree`, click a buildable node (e.g. a `drive-machinery` node) to open the
   island side panel. **Success —** the `<aside className="tree-detail">` panel renders the node's status
   badge, UAT verdict line, and capability sub-DAG, AND a **Build** control is present — present ONLY for
   a buildable node: a non-buildable node shows no button, or a disabled one, WITH the reason. Observed
   as the composed panel's DOM under jsdom. *(Machine, not human: which elements a panel renders for a
   given payload is a DOM query, and the buildability gate is a pure branch on a wire flag. Whether the
   panel READS well is leg 11's claim, not this one's.)* **Partly covered at HEAD:**
   `BuildSection.test.tsx:56-83` already pins the Build control's presence and its
   absence-with-a-reason, and `treeBuildable.test.ts` pins the `buildable`/`goGreen` flags the panel
   branches on — but NO test renders the composite `aside.tree-detail`, so the badge + verdict line +
   sub-DAG half is undischarged.
3. **The Build click dispatches an accepted intent and the world marks the node in flight.**
   _(witness: machine)_ Click **Build**. **Success —** the client POSTs `/api/build { unitId }`, the
   server answers `202` with a `runId`, the panel flips into a "building…" state showing the transcript
   region, and the node's in-flight `building` work-event surfaces through the existing `/api/activity`
   pipeline so the teal wisp lights on it in the world (ADR-0048) — proving the intent was accepted and
   the worker started WITHOUT the frontend importing any build code (ADR-0004 / ADR-0090 d.2, observable
   as a module-graph assertion: nothing under `apps/studio/src` reaches `packages/agent` or the gate).
   *(Machine, not human: an HTTP status, a `runId`, a rendered state, an activity row and an import graph
   are all decidable. The wisp's HUE reading as "in flight" is leg 11's.)* **Partly covered at HEAD:**
   `buildApi.integration.test.ts:83-86` pins the `202` + `runId` over the real wire and
   `BuildSection.test.tsx:69-83` pins the click → single POST → "building…" flip — but nothing couples an
   accepted intent to a lit wisp: `inFlightBuilds.test.ts` folds rows only (its own header defers the
   live SQL) and `activityApi.integration.test.ts` stubs `inFlightBuilds` outright.
4. **The panel polls, and the coarse transcript accumulates the phase trail in order.**
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
5. **A second build while one is running is refused.** _(witness: machine)_
   _(proof-gate: studio-build#gate-1)_ Attempt a second build while the first is running (click Build
   again, or POST a second intent). **Success —** the server REFUSES the concurrent build (`409`, "a
   build is already running") — the single-build-at-a-time guard holds; the running build is unaffected.
   *(Unchanged by the 2026-07-25 re-adjudication — already machine, and still the one leg bound to the
   observe gate below.)*
6. **The run reaches a terminal envelope and the world repaints in place, with no manual reload.**
   _(witness: machine)(detail: studio-build#uat-6)_ Let the build finish. **Success —** `GET /api/build?runId=…` reports a TERMINAL
   status carrying the final build envelope (verdict line, signer, cost, phase trail); the panel shows
   that verdict; and the node's hue in the world updates to reflect the freshly signed `events.verdict`
   through the existing `/api/tree` `latestVerdicts` path — WITHOUT a manual reload, i.e. the terminal
   poll itself triggers the re-pull. *(Machine, not human: a terminal status, the envelope's fields, and
   "the tree was re-fetched and the hue changed with no navigation" are all observable. The billed run
   behind it is leg 9; whether the finished panel LOOKS right is leg 11.)* **Partly covered at HEAD:**
   the terminal status + envelope are pinned at `buildApi.integration.test.ts:112-113`,
   `buildRegistry.test.ts:90-122` and `BuildSection.test.tsx:124-125` (verdict + signer) — but `cost` and
   the `phase trail` line sit in fixtures and are asserted NOWHERE, and the repaint is entirely
   undischarged: only `onTerminal` firing exactly once is pinned (`BuildSection.test.tsx:232-257`), never
   that the callback re-pulls `/api/tree` or that a hue changed.
7. **The verdict's provenance is the spine's, and the frontend never touched it.**
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
8. **The NODE route's no-land walls hold.** _(witness: machine)(detail: studio-build#uat-8)_ Confirm the scope-routed walls on the
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
9. **A real subscription-billed `--live` run drives the loop to a genuinely signed verdict.**
   _(witness: human)_ The operator triggers ONE real build from the studio UI and lets it run: a real
   Claude Agent SDK leaf genuinely authors the synthetic `add(2,3)` pair, the real prove-it-gate observes
   a genuine RED then GREEN from real exit codes, and the spine SIGNS. **Success —** the owner's
   attestation that the run they watched was real and billed, and that the verdict legs 6 and 7 inspect
   came from it. *(operator-attested and irreducible — a `--live` build is subscription-billed REAL
   SPEND; an agent may never burn it unattended, and no harness can manufacture "this was a genuinely
   billed run". Every MECHANIC observable during such a run is machine-witnessed above, provable against
   an offline scripted `PhaseAuthor` run of the same shape per ADR-0010 §5 — this leg is the spend and
   the genuineness, nothing else.)*
10. **The STORY route's approve-to-land opens a non-draft PR that CI auto-merges to trunk.**
    _(witness: human)_ Select a real-buildable STORY (no capability drilled) and click **Build**: the
    worker routes to `story build <id> --real`, which authors each capability for real and, on a GREEN
    chain, opens a **non-draft PR that CI auto-merges to trunk** (ADR-0022; `claude/real/*` promotion
    branches merge non-squash per ADR-0031). Clicking Build IS the approval to land (ADR-0090 Phase 2).
    **Success —** the owner's attestation that their click landed the change on trunk.
    *(operator-attested and irreducible — this is an OUTWARD-FACING action against the real repository:
    it opens a PR that merges to `main`. `human-owns-the-outer-loop` and `approval-gated-trunk` put the
    click itself on the human rung, and no agent may self-authorize a landing. The ROUTING half — that a
    story id resolves to `storyBuild` with `openPr: true` and a node id never does — is already machine,
    pinned at `buildWorker.test.ts:113-159`.)*
11. **The build affordance and the live transcript read right.** _(witness: human)_ The Build control
    sits well in the island side panel, the "building…" state and the growing coarse transcript feel
    ALIVE rather than stalled, the teal in-flight wisp reads as in-flight on the map, and the finished
    verdict reads clearly. **Success —** the owner's stage-2 visual verdict (ADR-0070).
    *(operator-attested and irreducible — "reads well" and "feels alive" have no compiler; ADR-0209 keeps
    look, feel and lived experience on the human rung, never machine-asserted nor model-judged. Legs 2,
    3, 4 and 6 already machine-pin that the elements exist, that the state flips, that the lines
    accumulate and that the hue changes — this leg carries only the judgment those observables cannot.)*

End state — the operator triggers a real node build from the studio UI and watches it run live to a signed
verdict on their own machine: the live-store precondition, the composed panel and its buildability gate,
the accepted intent and in-flight mark, the polled transcript's accumulation, the concurrent-build
refusal, the terminal envelope and in-place repaint, the verdict's spine provenance, and the node route's
no-land walls all machine-witnessed — and only the subscription-billed run itself, the outward-facing
approve-to-land on trunk, and the panel's look attested by the operator.

## Reliability Gates

1. **The studio build mechanics suite is green** _(gate: observe)_ `pnpm --filter studio test`.
   The command deterministically exercises the real build API route and registry with scripted
   collaborators: `buildApi.integration.test.ts` proves the second-intent `409` while the original
   run remains live (UAT leg 5). The locked scope-routed walls in UAT leg 8 are not claimed by this
   gate: the current routed-node implementation and suite exercise a different `--real` persisted,
   parked-branch shape. What this gate does NOT claim, after the 2026-07-25 ADR-0209 §8
   re-adjudication: the seven OTHER `machine` legs (1, 2, 3, 4, 6, 7, 8) are declared, not observed
   here — legs 1 and 7 are live-gated and need a spec this offline suite cannot host, legs 2, 3, 4 and 6
   are only partly reached by the existing deterministic tests, and leg 8 must currently fail — and the
   three `human` legs (9 the subscription-billed run, 10 the outward-facing approve-to-land, 11 the
   operator's appearance judgement) are never machine-witnessable at all.

## Proof

The story carries the UAT (above); it is proven when that walkthrough passes against the real
running studio + the real `--live` build path, AND its capabilities' integration tests and contracts
pass underneath it. The capability/contract obligations are minimal-to-green (slow growth): the
registry state machine and the API dispatch are isolatable and machine-provable; the wiring
capability is an integration test against the real in-story collaborators with the build-path
spawn exercised through the real `nodeBuild` entry (an offline scripted `PhaseAuthor` is acceptable
in the integration test, ADR-0010 §5, to avoid billing a live SDK run on every gate pass — the live
run is the human-witness UAT action above, leg 9). That same ADR-0010 §5 allowance is what makes the
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
a re-tag. The three operator obligations also remain pending: the subscription-billed live run (leg 9),
the outward-facing approve-to-land on trunk (leg 10), and the APPEARANCE attestation per ADR-0070
(leg 11). `healthy` is earned through the prove-it-gate, never edited here.

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

The four items below are raised by the 2026-07-25 ADR-0209 §8 witness re-adjudication. None re-opens the
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
