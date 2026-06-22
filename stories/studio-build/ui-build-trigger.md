---
id: "ui-build-trigger"
tier: capability
story: studio-build
title: "UI build trigger + live transcript"
outcome: "An operator triggers a scope-routed build (a node smoke, or a story chain that lands) from the island panel and watches it run live to a verdict."
status: "proposed"
proof_mode: "integration-test"
depends_on: [build-intent-api]
---

# UI build trigger + live transcript

**Outcome —** An operator triggers a scope-routed build from the island panel — a single-node
`--live` smoke for a drilled-in capability, or a whole-`story build --real` chain that lands to
trunk for a selected story — and watches it run live to a verdict.

**Depends on —** [`build-intent-api`](build-intent-api.md) — the UI's only path to a build is the
API; it imports no build code (ADR-0004 / ADR-0090 d.2).

> **Proof status (honest) — mechanics LANDED, still `proposed`.** This capability LANDED on `main`
> (the scope-routed `BuildSection` + `routedBuildRunner`, PRs #297 / #299 / #300). It has TWO proof
> stages (ADR-0070): the geometry/behaviour (button posts, panel polls, scope routes, terminal
> verdict shows) is machine-witnessed by the integration test + landed unit tests below
> (`BuildSection.test.tsx`, `buildWorker.test.ts`, `treeBuildable.test.ts`, `story-buildable.test.ts`,
> green); the APPEARANCE (does the panel read well, does the live transcript feel alive) is
> **operator-attested** — the agent builds the look behind the existing studio surface, surfaces a
> deep-link, and STOPS; the owner's nod is the visual verdict, never self-signed. Status stays
> `proposed` pending that attestation + the live-run UAT, not for want of code.

## Guidance

WHY THIS IS A CAPABILITY: it is where the things wire together — the studio SERVER worker that ROUTES
by unit kind and spawns the real build path (a node `--live` smoke or a story `--real` chain), the
frontend scope-routed Build control, and the live TRANSCRIPT panel — proven by an integration test
against the real in-story collaborators (the real registry, the real API, the real `nodeBuild` entry
with an injected scripted `PhaseAuthor`; the story-route to `storyBuild` is covered by the landed
`buildWorker.test.ts`). It is the integration seam the story UAT rides; the leaf state machine and
the HTTP dispatch are its two upstream capabilities. The landed code models node-and-story build as
ONE scope-routed affordance, so this single capability covers BOTH scopes — there is no second UI
trigger component.

THE WORKER SPAWN IS THE NEW BACKEND PIECE, AND IT ROUTES BY KIND (ADR-0090 d.2 / ADR-0091): the
server-process worker — the function the API's POST handler starts fire-and-forget — ROUTES on the
unit's kind (`routedBuildRunner`, `apps/studio/server/buildWorker.ts:144`): a STORY id → `storyBuild(id,
{ real: true, dryRun: false, verdictStore: 'pg', openPr: true })` — the whole-story `--real` chain that
authors each capability for real and, on green, opens the auto-merging PR (`openPr`,
`apps/studio/server/buildWorker.ts:115`; the worker ALWAYS sets it for a UI-driven story build); a NODE
id → `nodeBuild(id, { live: true, dryRun: false, real: false, verdictStore: 'pg' })`. Both persist to
`events.verdict` via `--store pg`. It emits one coarse mode line, then defers to the chosen entry's
envelope, streaming its coarse progress into the run's transcript (via `build-run-registry`'s
`appendLine`). It stays the SINGLE orchestrator boundary: it calls the same public entries the CLI does
and reaches inside NOTHING (not the gate, not the spine, not the leaf, not the chain/promote/merge
engine). The verdict it persists is the gate's, signed by the spine — never handed in by the worker or
the UI.

THE FRONTEND HOLDS NO MODEL PATH (ADR-0004): the Build control and transcript panel live in
`apps/studio/src/components/TreeView.tsx`'s island side panel (the `<aside className="tree-detail">`
that already renders the status badge, the UAT verdict line, and the capability sub-DAG), as a single
`<BuildSection scope={…} />` at the foot of the panel (`apps/studio/src/components/TreeView.tsx:4063`).
The `scope` prop ('node' | 'story') drives only the honest framing/hint — the api call is the same
`api.build(unitId)` either way. The button calls `POST /api/build` and the panel polls
`GET /api/build?runId=…` through the existing `api.ts` client. `apps/studio/src` STILL imports NO
build engine (ADR-0004) — its only path to a build is the API, story-scope and node-scope alike. (A
boundary-style assertion that the studio src tree does not import the agent is a worthwhile guard,
mirroring `check:boundaries`.)

REUSE THE WISP + HUE, DO NOT REBUILD THEM (ADR-0048 / ADR-0040): the in-flight teal wisp on the node
comes for free — `nodeBuild`'s `building` work-event already lights it, the world reads it via
`/api/activity`. The node's post-build hue comes for free too — the signed `events.verdict` is read
by the existing `/api/tree` `latestVerdicts` path. This capability adds NO wisp code and NO hue code;
it adds the trigger, the worker spawn, and the transcript read. State this so a rebuild does not
duplicate the activity/verdict pipelines.

POLL CADENCE: the panel polls `GET /api/build?runId=…` on a modest interval while the run is
non-terminal and STOPS polling once terminal (status passed/failed). Reuse the studio's existing
poll posture (the world already polls `/api/tree` + `/api/activity`); do not open a websocket
(owner's call).

SCOPE-ROUTED AFFORDANCE — ONE CONTROL, TWO SCOPES (ADR-0090 Phase 1 + Phase 2): there is ONE Build
control at the foot of the island panel, in the SAME spot whether the selection is a story or a
capability (`BuildSection` with a `scope` prop, `apps/studio/src/components/TreeView.tsx:4063`). The
owner's "it disappears as I click around" was the single-node model showing through — most stories
carry no single buildable node, but many are whole-story buildable. Routing:
  - A drilled-in CAPABILITY → `node build <id> --live` — the single-node Phase-1 local pipeline smoke
    (proves the build PIPELINE on a synthetic task, not the node's real feature; lands nothing).
  - A STORY (no cap drilled) → `story build <id> --real` — authors each capability for real, then on
    a green chain opens a NON-DRAFT PR that CI auto-merges to trunk (ADR-0022; non-squash per
    ADR-0031). Clicking Build IS the approval to land (ADR-0090 Phase-2 approve-to-land — the human
    still owns accept-to-land); the hint copy says so.
The affordance reads a server-computed flag, never a guess: `storyBuildable` for a story
(`isStoryBuildable(spec, caps, 'real')` on `/api/tree`, `apps/studio/server/apiRouter.ts:984`) and
the existing `buildable` for a node. A non-buildable selection shows WHY in place — never a vanishing
button: a story with no real-buildable capabilities yet shows "add a `real:` proof arm…". Honest by
construction today: `notice-board` / `binding-staleness` ARE real-buildable; `library` / `agent`
honestly show no real-buildable capabilities yet (no `real:` arm / no caps).
THE REMAINING WALLS: no `--real` TOGGLE on a single node, no manual `gh pr merge`, no hosted /
multi-tenant run (that is Phase 3). And the two-stage proof (ADR-0070) still holds: the
geometry/behaviour — button posts, panel polls, scope routes, terminal verdict shows — is
machine-witnessed; the APPEARANCE is operator-attested (the agent builds the look behind the studio
surface, surfaces it, and STOPS; the owner's nod is the visual verdict, never self-signed).

LIVE-RUN COST IS A HUMAN-WITNESS ACTION: a real `--live` build is subscription-billed, so the
integration test drives the worker with an injected scripted `PhaseAuthor` (no spend) and the
genuine live run is the story UAT's human-witness action — an agent must not burn live spend
unattended on every gate pass.

## Integration test

**Goal —** Prove that triggering a build from the studio surface runs the real build path to a
terminal verdict and the transcript reflects it — against the real in-story collaborators, with the
live SDK leaf replaced by an injected scripted `PhaseAuthor` (ADR-0010 §5).

The integration test exercises the worker spawn + the API + the registry together (the frontend
button/panel behaviour is testable with the React testing-library harness the studio already
carries; the appearance is operator-attested, NOT part of this machine test). No stubs within the
organism.

The integration test would:

1. Through the real `/api/*` server, `POST /api/build { unitId: '<real buildable node>' }` → `202`
   `{ runId }`; the worker starts and drives `nodeBuild` (scripted author, in-memory verdict store
   for the test).
2. Poll `GET /api/build?runId=<id>` → observe the transcript grow with the coarse phase trail while
   `status: 'building'`.
3. On completion, `GET /api/build?runId=<id>` → `status: 'passed'` with the terminal envelope —
   proving the studio-triggered build ran the REAL drive path to a signed verdict (the spine
   observed the scripted red→green and signed).
4. (UI leg, testing-library) render the side panel for a buildable node → the Build button is
   present; clicking it calls the api client's `POST /api/build`; the panel flips to a building state
   and begins polling; on a terminal poll it shows the verdict and stops polling. For a
   non-buildable node the button is absent / disabled with a reason.
5. (UI leg) assert the panel imports NO build engine — its build path is the `api.ts` client only.
6. Drive a FAILING scripted build → the panel shows the failed terminal state with the reason; the
   single-build guard still refuses a concurrent trigger from the button.

## Contracts (6)

Each **one isolated automated test** (vitest / testing-library, the studio suite), collaborators
stubbed (a fake api client / a fake `nodeBuild`). The mechanics LANDED (PRs #297 / #299 / #300;
landed suites incl. `BuildSection.test.tsx`, `treeBuildable.test.ts`, `story-buildable.test.ts`);
each below is the isolated assertion that proves the leaf (re-cite at real `file:line` against the
landed code).

1. **`ubt-worker-spawns-real-build-entry`** — the worker invokes the existing build entry, unchanged
   - **asserts —** the worker function calls `nodeBuild(unitId, { live: true, … })` (an injected
     stub stands in for the real entry in the unit test) with the Phase-1 options — single node,
     live mode, pg verdict store — and reaches inside no gate/spine/leaf internals.
   - **covers —** `apps/studio/server/buildWorker.ts` *(provisional)*
2. **`ubt-worker-streams-coarse-lines-to-run`** — the worker feeds coarse progress into the run
   - **asserts —** as the (stubbed) build emits its phase trail / envelope, the worker calls the
     registry's `appendLine` with COARSE lines (phase trail, status, verdict line) and terminalises
     the run with the envelope — never the raw model stream.
   - **covers —** `apps/studio/server/buildWorker.ts`
3. **`ubt-build-button-posts-intent`** — the scope-routed control posts an intent through the api client
   - **asserts —** rendering the foot-of-panel `BuildSection` for a buildable selection (a node OR a
     story) shows a Build control; clicking it calls the api client's `POST /api/build { unitId }`
     exactly once with the SELECTED unit's id and transitions the panel to a building state. The
     `scope` prop drives only the framing/hint, not the api call.
   - **covers —** `apps/studio/src/components/BuildSection.tsx` / `apps/studio/src/components/TreeView.tsx:4063`
4. **`ubt-transcript-polls-until-terminal`** — the panel polls status and stops when terminal
   - **asserts —** while a run is `building` the panel polls `GET /api/build?runId=…` on the
     interval and renders the accumulating transcript; once the poll returns a terminal status it
     renders the verdict and STOPS polling (no further fetches).
   - **covers —** `apps/studio/src/components/TreeView.tsx` (the transcript poller)
5. **`ubt-button-absent-for-non-buildable`** — a non-buildable selection shows WHY, never a vanishing button
   - **asserts —** the `BuildSection` for a non-buildable selection shows no enabled Build control but
     names the reason in place — and the copy differs by `scope`: a non-buildable NODE names its
     missing proof config; a non-buildable STORY shows "add a `real:` proof arm…" — the surface never
     offers a build that cannot run, and never simply disappears.
   - **covers —** `apps/studio/src/components/BuildSection.tsx` (the buildable gate + scope copy)
6. **`ubt-scope-routes-by-kind`** — the affordance reads the right buildable flag per scope
   - **asserts —** `BuildSection` is rendered with `scope: 'story'` and `buildable: story.storyBuildable`
     for a story selection and `scope: 'node'` and `buildable: cap.buildable` for a drilled-in
     capability (`apps/studio/src/components/TreeView.tsx:4063`), where `storyBuildable` is the
     server-computed `isStoryBuildable(spec, caps, 'real')` flag on `/api/tree`
     (`apps/studio/server/apiRouter.ts:984`) — so the control offers a story build only when the
     real chain would actually run, never on a capless or all-live-only story.
   - **covers —** `apps/studio/src/components/TreeView.tsx:4063` / `apps/studio/server/apiRouter.ts:984`
