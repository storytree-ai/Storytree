---
id: "chat-sse-mount"
tier: capability
story: desktop
title: "The local backend mounts the chat surface — a POST /api/chat intake that streams startChatStream's events as SSE"
outcome: "The local backend adds a `POST /api/chat` route that starts an `orchestrate`-driven session (the consumed headless-orchestrator chat-session-stream core) and streams its events to the renderer as Server-Sent-Events — re-composed from `@storytree/drive` and never importing `apps/studio/server`, so a member chats to an orient/propose agent inside the desktop. Read/propose only: no signing, no build, no PR."
status: proposed
proof_mode: integration-test
depends_on: [local-backend-boot]
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. NET-NEW (no editsExisting): the leaf authors an
# integration test that imports a NOT-YET-EXISTING symbol from a NEW source file under apps/desktop/src
# (red = module-not-found against the source that does not exist at HEAD), then writes that one new
# source file (green). The new module mounts a `POST /api/chat` dispatcher that drives the CONSUMED
# `startChatStream` (from @storytree/drive — the headless-orchestrator chat-session-stream core,
# ADR-0108 Phase 2) and serialises its async-generator event stream (`done`/`error`/`refused`) as SSE,
# behind a node:http dispatcher, with NO `electron`/`dom` import and NO `apps/studio/server` import (the
# surface boundary, sibling to boot-read-routes.ts / local-backend.ts — the operator-attested Electron
# main mounts it on the same /api/* surface). The proof injects the SAME `queryFn` scripted double
# chat-stream.test.ts uses (forwarded through startChatStream → orchestrate) so the intake → session →
# SSE is proven with ZERO live SDK spend. `install: true` + a typecheck wall because the module imports
# VALUE functions across the package boundary (`startChatStream` from @storytree/drive; the proof runs
# in a fresh worktree — tsx + tsc need the lockfile-only install, ADR-0031 §2). Single LITERAL source
# file (no `*`), so the default node:test proof on the one test file is legal — no `proofCommand`.
# SCOPE = apps/desktop (the dispatcher lives in apps/desktop/src/backend/), NOT packages/drive — the
# streaming core (chat-session-stream) is already green at its own scope; THIS proves the desktop mount.
proof:
  command:
    file: pnpm
    args: ["--filter", "desktop", "test"]
  scope:
    testGlobs: ["apps/desktop/src/**/*.test.ts"]
    sourceGlobs: ["apps/desktop/src/**/*.ts"]
  real:
    testFile: "apps/desktop/src/backend/chat-sse-mount.test.ts"
    sourceFile: "apps/desktop/src/backend/chat-sse-mount.ts"
    scope:
      testGlobs: ["apps/desktop/src/backend/chat-sse-mount.test.ts"]
      sourceGlobs: ["apps/desktop/src/backend/chat-sse-mount.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "desktop", "typecheck"]
---

# The local backend mounts the chat surface — a POST /api/chat intake that streams startChatStream as SSE

**Outcome —** The local backend adds a `POST /api/chat` route that starts an `orchestrate`-driven
session — the CONSUMED headless-orchestrator [`chat-session-stream`](../headless-orchestrator/chat-session-stream.md)
core (`startChatStream`, ADR-0108 Phase 2) — and streams its events to the renderer as Server-Sent-Events,
re-composed from `@storytree/drive` and never importing `apps/studio/server`, so a member chats to an
orient/propose agent inside the desktop. **Read/propose only** (ADR-0091): no signing, no build, no PR.

**Depends on —**
- [`local-backend-boot`](local-backend-boot.md) — it EXTENDS the `/api/*` backend that capability stood
  up. The Electron main mounts the chat dispatcher alongside the
  [`boot-read-routes`](boot-read-routes.md) dispatcher and the `local-backend-boot` handler — three
  sibling dispatchers chained on the same `/api/*` surface (boot-read first, then this one, then the
  `local-backend-boot` handler with its 404 fall-through). So this module couples to the same `/api/*`
  request surface and the same re-compose-not-import boundary the keystone established.

> **Proof status (honest) — NOT BUILT, `proposed`.** This precedes the code. It is the realization of
> the consuming-surface glue [`chat-session-stream`](../headless-orchestrator/chat-session-stream.md)
> names in its Guidance: *"The HTTP MOUNTING (the `/api/chat` route + the SSE response wiring) is the
> consuming surface's thin glue (the desktop's local-backend), over THIS streaming core."* The streaming
> CORE is already BUILT and GREEN (signed) at `packages/drive/src/chat-stream.ts` (`startChatStream`),
> barrel-exported from `@storytree/drive` (`import { startChatStream } from "@storytree/drive"`). The
> desktop sidecar (`apps/desktop/electron/backend-entry.ts`) explicitly names this as the gap: *"READ
> loop only (ADR-0119 §2): no build-trigger / adopt / chat-SSE — those are later increments."* This
> capability adds the chat-SSE mount that increment deferred. The renderer chat PANEL (the thin client
> that POSTs the intake and renders the SSE stream) is a SEPARATE follow-on owned by the `studio` story
> (see "Renderer chat panel placement" below); its appearance is this story's operator-attested UAT leg 7.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the CHAT MOUNT AS A WHOLE — a `node:http`
dispatcher that, mounted on `/api/*`, answers a `POST /api/chat` intake by starting an `orchestrate`
session (through `startChatStream`) and STREAMING the session's typed events
(`done`/`error`/`refused`) back as Server-Sent-Events, AND falls through (returns `false`) for everything
else so the caller's 404 still fires. It spans the intake (parse the message body) AND the real
`startChatStream`/`orchestrate` composition producing the event stream AND the SSE serialisation of that
stream — so it is an integration test against the real streaming core (the SDK `query()` scripted), not a
single isolated assertion.

WHY THIS IS A SEPARATE CAPABILITY FROM `local-backend-boot` AND `boot-read-routes` (the splitting-rule,
ADR-0010): all three share a precondition (a mounted `/api/*` dispatcher the Electron main chains) but
prove DIFFERENT observables. `local-backend-boot` proves "the boot read set serves real envelopes
instead of the 503 stub" (a GET → a JSON envelope). `boot-read-routes` proves "the studio's boot gate is
satisfied" (the three remaining boot GET routes). THIS proves "a chat message starts a real session and
its live output streams back as SSE, fail-closed and read/propose-only" — a POST intake + a *streaming*
response (not a one-shot envelope), with the consumed `orchestrate` composition as the live collaborator
and the terminal `error`/`refused` branches as load-bearing observables. Distinct precondition behaviour
(a streaming POST, not a bare GET), distinct observable, its own isolatable net-new red→green. Authored as
a THIRD sibling (a source file under `apps/desktop/src/backend/`, a dispatcher the Electron main mounts in
sequence) precisely so the keystone's and boot-read's greens are not re-opened to add the chat route.

RE-COMPOSE / CONSUME THE DRIVE CORE, NEVER IMPORT THE STUDIO (the boundary call, see the story's
"Local-backend boundary call" + the ADR-0119 update callout). It imports `startChatStream` from
`@storytree/drive` BY PACKAGE NAME (the consumed headless-orchestrator chat-session-stream core, the one
streaming core both surfaces mount, ADR-0108) — it does NOT import `apps/studio/server` (the forbidden
surface→surface coupling: `static-server.ts` says so; `studio` is `private` with no server export;
`check:boundaries` enforces it). It REPRODUCES the local HTTP helpers (`sendJson`, `readJsonBody`)
exactly as `local-backend.ts` / `boot-read-routes.ts` do, rather than importing the studio's. It NEVER
forks `orchestrate` or re-renders the prompt — the streaming core owns the session; this module owns only
the route + the SSE bytes.

THE ROUTE + ITS EXACT SHAPE (pin these — the leaf authors to them, the Electron main wires to them, and
the renderer chat panel parses them):
- **`POST /api/chat`** → a streaming `200` response with `Content-Type: text/event-stream`. The request
  body is `{ "intent": "<the chat message>" }` (a non-empty string; a missing/blank intent is a
  `400`). The response body is the session's typed events, each serialised as ONE SSE frame
  (`data: <json>\n\n`, where `<json>` is the `ChatStreamEvent` — `{ "type": "done", "proposal", "costUsd",
  "turns" }` | `{ "type": "error", "error" }` | `{ "type": "refused", "reason" }`). The stream ENDS
  (the response is `end()`ed) after the terminal event. SSE event-name lines (`event: <type>`) are
  OPTIONAL decoration; the `data:` frame is the contract the test pins.
- **`*` (anything else)** → the dispatcher returns `false` (fall-through to the next dispatcher / the
  `local-backend-boot` 404). It is NOT a catch-all.

THE STREAMING CONTRACT — SERIALISE, DON'T BUFFER: the dispatcher iterates `startChatStream(...)`'s
async-generator and writes each event as an SSE frame AS IT ARRIVES (`res.write(...)`), then `res.end()`
on the terminal event — it does NOT collect the whole stream into one body. (`static-server.ts`'s proxy
already streams `/api/*` via `proxyRes.pipe(res)` without buffering, so a frame written by the sidecar
reaches the renderer live.) The dispatcher SETS the SSE response headers (`Content-Type:
text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`) BEFORE the first frame. The test
asserts the response `Content-Type` is `text/event-stream` and that the streamed frames carry the scripted
session's events ending in the terminal event.

READ/PROPOSE ONLY, NO SIGNING (ADR-0091 / the Phase-2 wall — inherited from the consumed core): the chat
mount streams an orient+propose session. It holds NO signing key, hands in NO verdict, triggers NO build,
opens NO PR, lands NOTHING (Phases 3–5). The single-session guard is NOT re-implemented here — it is the
composition-level TYPED brake in `orchestrate` (ADR-0108 d.6 / PR #416), surfaced by `startChatStream` as
the distinct `refused` event this mount forwards verbatim as an SSE frame. One orchestration at a time; a
second concurrent chat session streams a `refused` frame, never a forged session. The desktop BUILD /
outer-loop path (Phases 3–5 + the ADR-0117 brokered friend writes) is the SEPARATE next increment,
explicitly OUT OF SCOPE here.

THE THIN CLIENT NEVER IMPORTS THE AGENT (ADR-0108 d.1 / ADR-0004): the renderer chat panel sends the POST
and renders the SSE frames; it never imports `@storytree/agent` and holds no model path. The agent
boundary is the backend process (the desktop sidecar, ADR-0113 §2 / ADR-0119 §1) — this mount runs there,
behind the SSE route; the renderer is downstream of the route (and of `static-server.ts`'s proxy).

THE CI-PROVABLE CORE IS ELECTRON-FREE (the standalone-resilient-library shape, mirroring
`boot-read-routes.ts` / `local-backend.ts`): the module lives under `apps/desktop/src/backend/` with NO
`electron` and NO `dom` import, so `node:test` can drive it headlessly over a real `node:http` server and
a real loopback `fetch`. The Electron sidecar (`backend-entry.ts`) is the thin operator-attested binding
that mounts this dispatcher alongside the boot-read + local-backend handlers (that wiring + the live SDK
chat run are witnessed under the Story UAT, not asserted in CI).

OFFLINE-TESTABLE BY INJECTION (the SAME discipline `chat-stream.test.ts` uses): the dispatcher drives the
REAL `startChatStream` → REAL `orchestrate` → REAL `renderAgentPrompt` over the seed corpus, with ONLY the
live-spend SDK `queryFn` injected as a scripted double (forwarded through the mount's deps into
`startChatStream`). So the intake → session → SSE stream is proven WITHOUT a live SDK run on every gate
pass (ADR-0010 §5). The live chat run (a real subscription `query()` streaming to a real panel) is the
operator-attested leg (the desktop Story UAT leg 7), not a standing test. No real keychain, no DB, no
network beyond loopback HTTP.

## Integration test

**Goal —** Prove that the chat dispatcher, mounted as a `/api/*` `node:http` handler, answers a
`POST /api/chat` intake by starting a REAL `orchestrate` session (through `startChatStream`, the consumed
chat-session-stream core) and streaming its typed events back as Server-Sent-Events — a terminal `done`
carrying the proposal on success, a terminal `error` on a dead session, a distinct `refused` on a second
concurrent session — and falls through (so the caller's 404 fires) for an unhandled path. Entirely
in-process: no Electron, no live SDK, no DB, no network beyond loopback HTTP.

The integration test exercises this capability against its **real in-story / cross-story collaborator** —
the real `startChatStream` (from `@storytree/drive`) over the real `orchestrate` composition (the real
`session-orchestrator` render over the real seed corpus, built with an `InMemoryStore` + `loadCorpus`) —
with the live-spend collaborator (the SDK `query()`) injected as a scripted `queryFn` double, exactly as
`packages/drive/src/chat-stream.test.ts` does. No stubs within the desktop's own composition.

The integration test would:

1. Mount `createChatSseMount({ queryFn })` behind a wrapper that sends a 404 when the dispatcher returns
   `false`. (The mount loads its own seed-corpus store internally — `getDefaultStore()` over
   `apps/studio/data/` — so the test injects ONLY the `queryFn` scripted double, not a store.) Inject a
   `queryFn` scripted double whose session emits a success result (a proposal + `costUsd`/`turns`), as
   `chat-stream.test.ts`'s `OK_SDK_RESULT` does.
2. `POST /api/chat` with `{ intent: "what should I build next?" }` → a `200` response whose
   `Content-Type` is `text/event-stream`, whose body parses to a sequence of SSE `data:` frames ending in
   a terminal `done` event carrying the scripted proposal text (and `costUsd`/`turns`) — proving the real
   `startChatStream`/`orchestrate` ran and its stream was serialised as SSE, not a one-shot JSON body.
3. `POST /api/chat` with a missing / blank `intent` → a `400` (a chat message is required) — never a
   started session, never a hung stream.
4. A dead session (e.g. `session-orchestrator` absent from the store, or the scripted `queryFn` errors)
   → the SSE stream ends in a terminal `error` frame (an honest failure), never a forged proposal and
   never a hung stream, and the SDK is never called past the fail-closed point.
5. A second concurrent `POST /api/chat` while the first session is in-flight → the SSE stream ends in a
   distinct terminal `refused` frame carrying the single-session reason (NOT a generic `error`, so the
   renderer can show "busy / try again"), the running session's stream left untouched.
6. An unhandled `/api/x` → the dispatcher returns `false`, so the wrapper's 404 fires — the deletion
   test proving the dispatcher is a real path-matcher that falls through, never a catch-all that swallows
   `/api/me` / `/api/tree` / the boot routes the sibling dispatchers own.

## Contracts (4)

The test-proven leaf behaviours — each one isolated automated test (`node:test`, the `desktop` suite),
the live SDK collaborator injected as a scripted `queryFn` double. None exist yet; each is the assertion
a contract test WILL prove against the real chat-mount code once authored (provisional path — re-cite at
real `file:line` when built). Per ADR-0122 (`storytree coverage`), each contract id is the lead of a
distinctly-named test in the single net-new test file, so the coverage check reports 4/4.

1. **`csm-streams-events-as-sse`** — POST /api/chat streams the session's events back as SSE, read/propose only
   - **asserts —** a `POST /api/chat` with a valid `{ intent }` starts the REAL `startChatStream` /
     `orchestrate` session (the rendered prompt names `session-orchestrator`, not a fork) and returns a
     `200` `text/event-stream` response whose body is the session's typed events serialised as SSE
     `data:` frames ending in a terminal `done` event carrying the proposal (and `costUsd`/`turns`) — the
     streaming shape the renderer parses, NOT a one-shot JSON body. The "no build/PR/verdict side effect"
     half is true BY CONSTRUCTION (read/propose only, ADR-0091): the mount's only collaborator is
     `startChatStream`, it holds no signing key and no build runner, so there is no path through which it
     could sign, build, open a PR, or land.
   - **covers —** `apps/desktop/src/backend/chat-sse-mount.ts` (the chat route + the SSE serialisation +
     the read/propose-only import surface) *(provisional path)*
2. **`csm-rejects-a-blank-intent`** — a missing/blank chat message is a 400, no session started
   - **asserts —** a `POST /api/chat` with a missing or blank `intent` returns a `400` and starts NO
     session (the SDK is never reached) — the desktop fast-fails malformed local input before any spend,
     never a hung stream.
   - **covers —** `apps/desktop/src/backend/chat-sse-mount.ts` (the intake validation) *(provisional path)*
3. **`csm-fails-closed-on-dead-session`** — a dead session ends the SSE stream in a terminal `error` frame
   - **asserts —** a dead/error session (e.g. `session-orchestrator` absent, the scripted `queryFn`
     errors) yields a terminal `error` SSE frame — never a forged proposal, never a hung stream — the
     fail-closed honesty inherited from the consumed core, forwarded as SSE. Distinct from the `refused`
     branch below.
   - **covers —** `apps/desktop/src/backend/chat-sse-mount.ts` (the terminal `error` frame mapping) *(provisional path)*
4. **`csm-dispatcher-falls-through-not-404s`** — the dispatcher returns false for an unhandled path
   - **asserts —** the dispatcher handles `POST /api/chat` (returns `true`) and returns `false` for any
     other path — so the caller (the Electron main, mounting it alongside the boot-read + local-backend
     handlers) can fall through to the existing 404; the chat-mount module is electron-free and does not
     import `apps/studio/server` (the surface boundary holds by construction). (The distinct `refused`
     single-session frame — proven against the real composition-level guard — is asserted within the
     fall-through suite's sibling concurrency case, sharing the `startChatStream` collaborator; it is
     part of this dispatcher contract's surface, not a separately-coverable name.)
   - **covers —** `apps/desktop/src/backend/chat-sse-mount.ts` (the dispatcher's fall-through + import surface) *(provisional path)*

## Guidance — the net-new slice that earns the signed verdict

The brownfield bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the chat-mount module as a
new module, test-first.

- **The new test —** `apps/desktop/src/backend/chat-sse-mount.test.ts` (`node:test` +
  `node:assert/strict`, the package convention — drive a real `node:http` server, no Electron/DOM/DB/SDK,
  exactly as `boot-read-routes.test.ts` does; build the seed + inject the `queryFn` exactly as
  `chat-stream.test.ts` does). Import `{ createChatSseMount }` (or the chosen name) from
  `"./chat-sse-mount.js"` and `{ startChatStream }`'s collaborator transitively (the mount imports it;
  the test injects only the `queryFn` scripted double). Name each test for its contract id
  (`csm-…`) so `storytree coverage chat-sse-mount` reports 4/4 (ADR-0122).
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING — `chat-sse-mount.ts`
  does not exist at HEAD, so the test fails module-not-found (the net-new missing-symbol red, ADR-0057).
  Assert the SSE stream (terminal `done`/`error`/`refused`), the blank-intent 400, and the fall-through.
- **The GREEN (as it actually landed, PR #439) —** `apps/desktop/src/backend/chat-sse-mount.ts` exports
  the `ChatSseMountDeps` interface (`{ queryFn? }`) and `createChatSseMount(deps)` returning the async
  `(req, res, pathname) => Promise<boolean>` dispatcher. On `POST /api/chat`: parse `{ intent }`
  (400 if blank), set the SSE headers, iterate `startChatStream({ intent, store, queryFn })`, write each
  event as an SSE `data:` frame, `end()` on the terminal event. Return `false` for any other path. NO
  `electron`, NO `dom`, NO `apps/studio/server` import. The import resolves, the assertions hold, and the
  package suite + typecheck are green (ADR-0122 coverage 4/4). The Electron sidecar (`backend-entry.ts`)
  then mounts this dispatcher alongside the boot-read + local-backend handlers (operator-attested wiring,
  not CI). **The store is loaded INTERNALLY, not injected:** the mount lazy-loads its own seed-corpus
  `SeedStore` over `apps/studio/data/` (`getDefaultStore()`) rather than taking a `store` dep — so the
  only injected seam is `queryFn` (the offline scripted double; omit for the real SDK default).

> **The deferred mount-deps extension is GLUE, not a contract (decided, story-author 2026-06-27).** The
> landed `ChatSseMountDeps = { queryFn? }` does NOT forward `startChatStream`'s live orientation seams
> (`runner` / `model` / `maxTurns` / `maxBudgetUsd`). For a *live* run that matters: `orchestrate.ts`
> documents that the `runner` (`OrientationRunner`) is REQUIRED for real orientation, "or the orientation
> tools fall back to a no-op stub and the agent cannot actually orient" — so a live `createChatSseMount({})`
> would converse + propose from the rendered `session-orchestrator` prompt but BLIND to live state (it
> cannot read the live tree / library / notice board). Extending the deps to forward `runner` (and the
> live-tuning `model`/`maxTurns`/`maxBudgetUsd`) is therefore real work — but it is **operator-attested
> glue, NOT an offline-provable contract**, because the `OrientationRunner` is reachable ONLY through a
> real SDK tool-dispatch: `runHeadlessOrchestrator` wires the runner into `options.mcpServers`, but a
> scripted `queryFn` (the discipline every offline proof here uses) consumes `{ prompt, options }` and
> yields canned messages — it NEVER emits a `tool_use`, so `OrientationTool.call()` → `runner(argv, deps)`
> (`packages/agent/src/orientation-tools.ts`, the ONLY call site) never fires. A sentinel runner injected
> into the mount would be wired but never invoked offline, so "the mount forwards the runner" has no
> observable, offline-provable consequence at the mount's own scope. It is meaningfully exercised only in
> a live run — i.e. the `desktop` Story UAT leg 7 (operator-attested, ADR-0070), the same leg the live
> chat run already lives under. So the extension is folded into the operator-attested sidecar wiring
> below, not authored as a new CI contract. (If the runner's wiring is ever made observable WITHOUT a live
> SDK — e.g. a scripted `queryFn` that fakes a `tool_use` the SDK contract would route through the MCP
> dispatch — that becomes a provable contract; today's scripted-`queryFn` discipline does not reach it.)

Rules:

- **Consume `startChatStream`, never fork `orchestrate`, never import the studio** (the boundary call).
  The mount imports `startChatStream` from `@storytree/drive` by package name and reproduces the local
  HTTP helpers; it never imports `apps/studio/server/*` and never re-renders the prompt. The test pins
  this (`csm-dispatcher-falls-through-not-404s` for the import surface; `csm-streams-events-as-sse` for
  the real-composition reuse via the named `session-orchestrator` prompt).
- **Electron-free core** — no `electron`/`dom` import; the sidecar wiring is the operator-attested binding.
- **Stream, don't buffer** — write each event as an SSE `data:` frame as it arrives and `end()` on the
  terminal event; set `Content-Type: text/event-stream` before the first frame. The test pins the
  content type + the per-event frames (`csm-streams-events-as-sse`).
- **Fail closed, never hang** — a blank intake is a 400 with no session (`csm-rejects-a-blank-intent`); a
  dead session ends in a terminal `error` frame (`csm-fails-closed-on-dead-session`); a second concurrent
  session ends in a distinct `refused` frame (forwarded from the consumed core's typed guard, ADR-0108
  d.6). All pinned.
- **Read/propose only** — surface the proposal in the stream; hold no signing key, hand in no verdict,
  trigger no build, open no PR (ADR-0091). Phases 3–5 are out of scope. The mount takes no signer and no
  runner-of-builds, so the boundary holds by construction.
- **Chat route only (slow growth, ADR-0108 / ADR-0119 §2)** — mount only `POST /api/chat`. Do NOT add the
  build-trigger (it is `local-backend-boot`'s), the adopt route, or the boot read routes (they are
  `boot-read-routes`') — those are separate capabilities / later increments.
