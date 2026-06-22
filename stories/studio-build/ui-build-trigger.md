---
id: "ui-build-trigger"
tier: capability
story: studio-build
title: "UI build trigger + live transcript"
outcome: "An operator triggers a build from the island panel and watches it run live to a verdict."
status: "proposed"
proof_mode: "integration-test"
depends_on: [build-intent-api]
---

# UI build trigger + live transcript

**Outcome —** An operator triggers a build from the island panel and watches it run live to a
verdict.

**Depends on —** [`build-intent-api`](build-intent-api.md) — the UI's only path to a build is the
API; it imports no build code (ADR-0004 / ADR-0090 d.2).

> **Proof status (honest) — NOT BUILT.** This precedes the code. This capability has TWO proof
> stages (ADR-0070): the geometry/behaviour (button posts, panel polls, terminal verdict shows) is
> machine-witnessed by the integration test below; the APPEARANCE (does the panel read well, does
> the live transcript feel alive) is **operator-attested** — the agent builds the look behind the
> existing studio surface, surfaces a deep-link, and STOPS; the owner's nod is the visual verdict,
> never self-signed.

## Guidance

WHY THIS IS A CAPABILITY: it is where the three things wire together — the studio SERVER worker that
spawns the real build path, the frontend Build BUTTON, and the live TRANSCRIPT panel — proven by an
integration test against the real in-story collaborators (the real registry, the real API, the real
`nodeBuild` entry with an injected scripted `PhaseAuthor`). It is the integration seam the story UAT
rides; the leaf state machine and the HTTP dispatch are its two upstream capabilities.

THE WORKER SPAWN IS THE NEW BACKEND PIECE (ADR-0090 d.2 / ADR-0091): the server-process worker — the
function the API's POST handler starts fire-and-forget — invokes the EXISTING
`nodeBuild(unitId, { live: true, verdictStore: 'pg', … })` (`packages/cli/src/node-build.ts`) and
streams its coarse progress into the run's transcript (via `build-run-registry`'s `appendLine`). It
is the SINGLE orchestrator boundary: it calls the same public entry the CLI does and reaches inside
NOTHING (not the gate, not the spine, not the leaf). The verdict it persists is the gate's, signed
by the spine — never handed in by the worker or the UI.

THE FRONTEND HOLDS NO MODEL PATH (ADR-0004): the Build button and transcript panel live in
`apps/studio/src/components/TreeView.tsx`'s island side panel (the `<aside className="tree-detail">`
that already renders the status badge, the UAT verdict line, and the capability sub-DAG). The button
calls `POST /api/build` and the panel polls `GET /api/build?runId=…` through the existing `api.ts`
client. `apps/studio/src` must NOT import `packages/agent` or any build engine — its only path to a
build is the API. (A boundary-style assertion that the studio src tree does not import the agent is a
worthwhile guard, mirroring `check:boundaries`.)

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

PHASE-1 SCOPE WALLS IN THE UI: the panel shows Build → building… → verdict. It must NOT show an
"approve / open PR" control, a `--real` toggle, or a whole-story build button — those are Phase 2/3.
The button is offered only for a buildable node (reuse the API's discovery answer or a buildable
flag on the tree node); a non-buildable node shows no button or a disabled one naming why.

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

## Contracts (5)

Each **one isolated automated test** (vitest / testing-library, the studio suite), collaborators
stubbed (a fake api client / a fake `nodeBuild`). None exist yet; each is the assertion a contract
test WILL prove (re-cite at real `file:line` when built).

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
3. **`ubt-build-button-posts-intent`** — the panel button posts an intent through the api client
   - **asserts —** rendering the side panel for a buildable node shows a Build button; clicking it
     calls the api client's `POST /api/build { unitId }` exactly once and transitions the panel to a
     building state.
   - **covers —** `apps/studio/src/components/TreeView.tsx` (the side panel Build control)
4. **`ubt-transcript-polls-until-terminal`** — the panel polls status and stops when terminal
   - **asserts —** while a run is `building` the panel polls `GET /api/build?runId=…` on the
     interval and renders the accumulating transcript; once the poll returns a terminal status it
     renders the verdict and STOPS polling (no further fetches).
   - **covers —** `apps/studio/src/components/TreeView.tsx` (the transcript poller)
5. **`ubt-button-absent-for-non-buildable`** — no Build control for a non-buildable node
   - **asserts —** the side panel for a node with no buildable proof config shows no Build button (or
     a disabled one with the reason) — the Phase-1 surface never offers a build that cannot run.
   - **covers —** `apps/studio/src/components/TreeView.tsx` (the buildable gate)
