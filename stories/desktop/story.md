---
id: "desktop"
tier: story
title: "Desktop client — a trusted member runs the whole storytree loop on their own machine, credential in the OS keychain"
outcome: "A trusted inner-circle member launches a native desktop app that runs the real storytree loop locally — the studio UI over a backend booted in the Electron main process — signs in with their Claude credential held in the OS keychain, and their builds bloom in the shared forest, with the renderer never importing the agent and the credential never leaving their machine."
status: proposed
proof_mode: UAT
# Capabilities, roots-first. The first two are ADR-0109 Step 1 (the credential-host shell, BUILT/
# operator-attested); the rest are the ADR-0113 thick-client step (the local backend + its boot read
# routes, the in-process credential wiring, the shared-forest connection). The chat surface that ships
# INSIDE this desktop has TWO halves: its provable streaming BACKEND (the SSE/intake core,
# `startChatStream`) is headless-orchestrator's Phase 2 (ADR-0108), CONSUMED here; but the desktop-side
# MOUNT of that core — the `POST /api/chat` route on the local backend that serialises its event stream
# as SSE — IS a desktop capability (`chat-sse-mount`), the thin glue chat-session-stream's Guidance
# names. The renderer chat PANEL is a `studio` frontend component (consumed compiled), not a capability
# here (see the Cross-story boundary section + "Renderer chat panel placement").
capabilities: [credential-broker, electron-shell, local-backend-boot, boot-read-routes, chat-sse-mount, local-credential-wiring, shared-forest-connection, brokered-local-uat-signing, desktop-launch-preconditions]
# Story-level edges (ADR-0010 §4 / ADR-0074 — these are the cross-story `depends_on` the boundary
# gate (`check:boundaries`) enforces against apps/desktop/package.json's @storytree/* deps, ADR-0100;
# ADR-0113 §8 requires the desktop → studio-server/drive edges to be DECLARED here or CI goes red):
#   - studio          — loads studio's COMPILED dist (studio's delivered outcome, ADR-0090 d.4); the
#                       renderer is the SAME studio frontend. The desktop must NOT import apps/studio/
#                       SERVER source (a surface→surface coupling the existing static-server.ts forbids,
#                       and studio is `private` with no server export) — it RE-COMPOSES the same organism
#                       drivers the studio backend is built from (see "Local-backend boundary call").
#   - drive-machinery — @storytree/drive (the build/orchestrate drivers: routedBuildRunner-equivalent
#                       wiring of nodeBuild/storyBuild/adoptStory/orchestrate + loadLocalSecrets) AND
#                       @storytree/orchestrator (the spec discovery findNodeSpecFile/loadNodeSpec/
#                       isStoryBuildable the routed runner needs) — both owned by drive-machinery. This
#                       is the studio server's OWN composition (devApi.ts), re-homed in the Electron main
#                       process (the single agent boundary, ADR-0004 / ADR-0090 d.2). @storytree/agent is
#                       reached TRANSITIVELY through drive's `orchestrate` (the SDK single-import-site,
#                       ADR-0004) — the desktop never imports @storytree/agent directly.
#   - library         — @storytree/library/store (renderAgentPrompt + loadCorpus) for the local backend's
#                       library/tree reads and the orchestrate composition's prompt render (ADR-0051).
#   - headless-orchestrator — the chat/loop streaming CORE that ships INSIDE this desktop is its Phase 2
#                       (ADR-0108): the orchestrate-driven session + its SSE-shaped event stream
#                       (`startChatStream`). The desktop CONSUMES that core; it is NOT a desktop capability.
#                       The desktop-side MOUNT of it — the `POST /api/chat` SSE route on the local backend —
#                       IS a desktop capability (`chat-sse-mount`), the thin glue chat-session-stream's
#                       Guidance assigns to the consuming surface. The renderer chat PANEL is a `studio`
#                       frontend component (a thin client over the route, ADR-0108 d.1), also not a
#                       capability here.
#   - studio-cloud    — ADR-0117 (amends ADR-0113 §6 for friends): the friend's forest writes are now
#                       BROKERED, not direct. The local backend POSTs his locally-signed verdict/presence
#                       to studio-cloud's `write-broker` (a members-gated /api/* endpoint), and the SERVER
#                       persists them — no per-friend Cloud SQL IAM grant, no local DB connection. This is a
#                       RUNTIME HTTP edge (a configured broker URL + a POST client), NOT a package import:
#                       the desktop MUST NOT import apps/studio/server source (the surface boundary,
#                       ADR-0100). The studio-cloud edge itself adds no apps/studio/server import.
#   - proof-protocol, notice-board — the WIRE SHAPES the broker write-client POSTs. The client imports
#                       @storytree/proof-protocol (`Verdict`) and @storytree/notice-board (`PresenceDeclaration`)
#                       to type — and the test to construct — the bytes it sends (contract `fr-write-brokers-not-direct`).
#                       Pure-zod protocol packages (no `pg`, no server) so brokers-not-direct still holds — but
#                       they are NOT reachable transitively (this repo's pnpm strict isolation has no hoisting):
#                       they are DECLARED deps in apps/desktop/package.json, so `check:boundaries` requires the
#                       cross-story edge declared here, exactly like the drive-machinery/studio/library edges
#                       (ADR-0074 / ADR-0113 §8 — the "declare it, never work around it" pattern below).
depends_on: [studio, drive-machinery, library, headless-orchestrator, studio-cloud, proof-protocol, notice-board]
# ADR-0166 artifact edges: the deliberate NON-IMPORT seams among the depends_on above (build-artifact /
# write-target / hosted-seam consumption, narrated per-edge in the comments/body of this spec) — the
# declared-edge honesty gate accepts these without a code import; remove an entry if the seam ever
# becomes a real package import.
artifact_edges: [studio, headless-orchestrator, studio-cloud]
# Deciding ADRs (ADR-0037 §2): 0109 sanctions the credential-host Electron client; 0111 fixes Step 1's
# placement (apps/desktop + this story); 0113 redefines Step 2 as booting the worker LOCALLY (the thick
# client) and amends ADR-0090 d.4 for the trusted inner-circle phase; 0117 amends ADR-0113 §6 — the
# friend's forest writes are BROKERED to studio-cloud's write-broker (no per-friend Cloud SQL IAM grant,
# an in-app `builder` role instead); 0090 the client/worker split + d.4 source guard (amended); 0091 the
# proof-off-tether sanction the local backend rides (and the broker holds no signing key); 0004 the
# orchestrator/agent boundary preserved by topology (main IS the boundary); 0108 the chat surface that
# ships here; 0021 keyless Cloud SQL IAM (the per-friend grant ADR-0117 REMOVES for friends); 0070 the
# operator-attested appearance (and the live `builder` grant); 0176 supersedes 0119 and is the complete
# current sidecar decision: tsx-sidecar + studio boot reads + re-compose boundary, with DB/git launch
# preconditions and no degraded shell.
decisions: [109, 111, 113, 117, 176, 90, 91, 4, 108, 21, 70, 179, 180, 198]
---

# Desktop client — a trusted member runs the whole storytree loop on their own machine

**Outcome —** A trusted inner-circle member launches a native desktop app that runs the real storytree
loop locally — the studio UI over a backend booted in the Electron **main** process — signs in with
their Claude credential held in the OS keychain, and their builds bloom in the **shared forest**, with
the renderer never importing the agent and the credential never leaving their machine.

This story has **two layers, decided by two ADRs**:

1. **The credential-host shell (ADR-0109 Step 1, BUILT; ADR-0179 amends with the Credentials UI).** An
   Electron shell that loads the compiled studio bundle and keeps each runtime credential in the **OS
   keychain** — never persisted in, returned to, or recoverable from the renderer (a raw value may
   exist transiently in the password input and cross the store IPC once on submission, ADR-0179). Its
   provable core (the broker's keychain round-trip, two-kind independence, operation-bridge lifetime,
   and the desktop-only Credentials panel's one-way store/boolean status) is green in CI; the real-OS-
   keychain round-trip + the native shell's appearance are operator-attested (ADR-0070). This is the
   [`credential-broker`](credential-broker.md) + [`electron-shell`](electron-shell.md) pair.

2. **The thick-local client (ADR-0113, this extension).** For the inner circle — today a single trusted
   co-builder — the desktop becomes a **thick client**: the Electron main process **runs the real studio
   backend locally** (the build/orchestrate machinery) bound to `127.0.0.1`, replacing the
   `static-server.ts` `/api/*` 503 stub, so the whole loop runs on the member's machine. This is the
   redefinition of **ADR-0109 Step 2**: "wire to the worker" becomes "boot the worker **locally**," not
   "call a hosted worker over TLS." It adds the [`local-backend-boot`](local-backend-boot.md),
   [`local-credential-wiring`](local-credential-wiring.md), and
   [`shared-forest-connection`](shared-forest-connection.md) capabilities.

The deciding ADRs are
[ADR-0109](../../docs/decisions/0109-a-native-credential-host-desktop-client-electron-for-byo-cre.md)
(the credential-host shell) and
[ADR-0113](../../docs/decisions/0113-thick-local-desktop-for-the-inner-circle-the-drive-machinery.md)
(owner-directed 2026-06-26, born accepted per ADR-0110 — design-time alignment IS the ratification),
which chose **thick-local over thin-hosted** for the inner-circle step on the explicit premise that the
source is shared with the trusted circle.

## Why thick-local (the premise, from ADR-0113)

The shipped plan routed the inner circle through a **thin client + hosted worker** (ADR-0090), with
**d.4 "source stays server-side in every phase"** as a load-bearing guard. That guard's reason —
protecting the private source from an **untrusted** recipient — does not apply to a trusted co-builder
the owner shares the repo with anyway. With the source shared, the entire justification for keeping the
engine off his machine evaporates, and the local-first drive machinery (a real checkout + git + pnpm +
worktrees, ADR-0031) runs in its native habitat instead of inside a containment-hardened hosted runtime
(ADR-0108's "biggest new surface"). ADR-0113 amends ADR-0090 d.4 **for the inner-circle phase only** —
when the circle grows past "trusted with the source," the thin-hosted path returns (it is deferred, not
deleted).

## Design floor (the guards ADR-0113 PRESERVES)

- **The ADR-0004 boundary is preserved by TOPOLOGY, not abandoned.** The Electron **main** process IS
  the single orchestrator/agent boundary; the **renderer never imports `@storytree/agent`** and holds no
  model-invocation path (ADR-0090 d.2 / ADR-0004 stand verbatim). What changes is *where the boundary
  process runs* — the trusted member's own machine — not that the boundary exists. The desktop reaches
  the SDK only transitively through `@storytree/drive`'s `orchestrate` (the single-import-site).
- **Carries the compiled UI for the renderer (ADR-0090 d.4, amended in premise).** The renderer is the
  SAME **compiled** studio frontend bundle. What ADR-0113 changes is that the **main process** now also
  carries the engine (the build/orchestrate drivers) — accepted because the recipient is trusted. The
  renderer still ships only the compiled UI.
- **The credential lives in the OS keychain ONLY, brokered IN-PROCESS (ADR-0109 preserved, simplified).**
  The keychain-held credential is brokered to the local backend in the SAME (main) process — **no TLS
  hop**, no server-side persistence; the credential never leaves the member's machine. A *stronger* BYO
  posture than brokering to a hosted box, and the renderer/keychain isolation (ADR-0109 d.4) still holds.
- **Proof integrity is unchanged (ADR-0091).** The local backend is a **sanctioned off-tether worker**:
  the spine observes RED then GREEN from real exit codes and SIGNS; the agent holds no signing key and
  hands in no verdict; CI independently re-proves green before the trunk (ADR-0022). The damage ceiling
  stays a briefly-wrong hue corrected by CI — if anything stronger (a single-operator local worker).
- **Shared forest, one living forest, writes BROKERED (ADR-0017 / ADR-0023; ADR-0113 §6 AMENDED by
  ADR-0117).** The member's builds, verdicts, and presence still land in the SHARED Cloud SQL Postgres so
  his work blooms in the same forest the owner watches — a per-member local store is explicitly NOT chosen
  (it would fragment the forest). But ADR-0117 changes HOW they land for friends: instead of his local
  backend opening a direct keyless Cloud SQL connection under his own IAM identity (the per-friend `gcloud`
  grant), it **POSTs the locally-signed verdict / presence to the hosted studio's members-gated
  write-broker**, and the SERVER persists them under its one service-account DB identity. The friend holds
  **no DB identity and opens no DB connection**; he is authorized **in-app** as a `builder` (the Members
  panel, an in-app grant — no `gcloud`, no Cloud SQL IAM grant). Local COMPUTE is unchanged (the spine runs
  the gate and signs locally, ADR-0091); only the write is brokered. The live broker write + the `builder`
  grant are the **operator-attested** legs (UAT 5/6).
- **Minimal packaging for v1 (ADR-0109's "minimal first").** The trusted member runs a dev-mode desktop
  build with the toolchain present (Node / pnpm / git). Code-signing, notarization, and auto-update stay
  deferred (revisited when the circle widens past hands-on devs).
- **The boundary gate sanctions the new edge (ADR-0074 / ADR-0113 §8).** `check:boundaries` must record
  the desktop → drive-machinery (and the studio/library) edges as sanctioned organism dependencies for
  the desktop surface — the `depends_on` above declares them. Adding the `@storytree/*` deps to
  `apps/desktop/package.json` WITHOUT these declared edges fails the gate; the edge is legitimate by
  ADR-0113, so the gate is satisfied by declaring it, never worked around.

## Local-backend boundary call (decided here — the dependency-graph/layout call is the story-author's, not the owner's)

> **Update ([ADR-0119](../../docs/decisions/0119-thick-local-desktop-backend-a-tsx-sidecar-serving-the-studio.md),
> 2026-06-27, owner-directed).** Wiring the proven `createLocalBackend` factory into the real Electron
> shell surfaced two corrections: (1) the drivers run as a **tsx sidecar** the Electron main spawns and
> proxies `/api/*` to — bundling raw-TS drivers into the CJS main breaks `import.meta` (corpus paths +
> the build path's `tsx` resolution); (2) the read route table is the studio's **boot set** —
> `me` / `health` / `docs` / `tree` / `assets` / `comments` — NOT just health/tree/assets, because the
> studio frontend boot-gates on `/api/me` and `Promise.all`s docs+assets+comments (a 404 → an error
> screen, not the forest). The "minimal route table" described below is **replaced** by that
> boot set; the re-compose-don't-import boundary call STANDS. The read router is headlessly provable (so
> its green flips like any capability); the Electron sidecar-spawn + proxy is the operator-attested leg.

ADR-0113 §1 phrases the thick client as "the Electron main process runs the real studio backend
(`apps/studio/server`)." Taken literally that is a **surface→surface source import** — and it is
forbidden: `apps/desktop/electron/static-server.ts` already states "the desktop must NOT import across
the surface boundary," `apps/studio` is `private` with no server `exports`, and ADR-0100 models a
surface as a sink "consumed by nothing" (two surfaces importing each other's source is an undeclarable,
unrendered coupling the boundary gate cannot see). The honest realization that preserves the boundary —
and matches ADR-0113's actual INTENT ("maximal reuse: the local backend is the existing organism
drivers the studio backend is built from") — is:

> **The desktop main process RE-COMPOSES the local backend from the ORGANISM packages**, exactly the way
> `apps/studio/server/devApi.ts` composes them — wiring `@storytree/drive`'s build/orchestrate drivers
> (`routedBuildRunner`-equivalent over `nodeBuild`/`storyBuild`/`adoptStory`/`orchestrate`) and
> `@storytree/library/store`'s reads behind a `node:http` `/api/*` router the **desktop owns**. It does
> NOT import `apps/studio/server`.

This keeps every cross-surface edge a **declared, forest-rendered organism edge** (the `depends_on`
above), keeps the SDK behind the single-import-site (ADR-0004), and keeps the desktop a peer surface to
the studio rather than a consumer of it. The route table the desktop mounts is **minimal-to-journey**
(slow growth): the library/tree/activity reads + the build trigger + the chat SSE — NOT the hosted
concerns the desktop has no use for (IAP / guestPolicy / members / invites / db-control / hosted
db-wake). If the studio route table later proves worth sharing verbatim between both surfaces, extracting
it into a shared organism is a clean follow-on (it would touch the `studio` story) — deliberately NOT
pulled into this story, to keep the thick-client journey small.

> **ADR-0119 update (two integration corrections — the boundary call STANDS).** Wiring the
> `local-backend-boot` factory (PR #394) into the real Electron shell + the real studio frontend surfaced
> two findings the owner directed be landed as a decision (ADR-0119, born accepted per ADR-0110):
>
> 1. **The drivers run as a `tsx` SIDECAR the Electron main spawns and proxies `/api/*` to — not bundled
>    into the main.** `apps/desktop` builds the main as CJS (`esbuild --format=cjs`) and runs it under
>    Electron's plain Node with NO `tsx`. Bundling the raw-TS drivers in was tested directly: esbuild
>    "succeeds" but silently empties `import.meta.url` (corpus paths, `schema.sql`) and
>    `import.meta.resolve("tsx")` (the build path's own tsx resolution) under CJS, quietly breaking the
>    read AND build paths. So the main spawns a child Node process via `tsx`
>    (`ELECTRON_RUN_AS_NODE=1 --import tsx`) that hosts the re-composed backend and listens on a
>    `127.0.0.1` port; `static-server.ts` PROXIES `/api/*` to it and reaps it on quit. This is the honest
>    realization of "the Electron main serves a local backend" — *serves via a sidecar it owns* — and the
>    agent boundary (ADR-0004) is preserved by topology (the sidecar is a main-owned Node process; the
>    renderer never imports `@storytree/agent`).
> 2. **The desktop serves the studio's BOOT read set, not just `health`/`tree`/`assets`.** The studio
>    frontend (`App.tsx`) **boot-gates on `/api/me`** (`meStatus` must reach `ready` with `member: true`)
>    and its initial load is `Promise.all([/api/docs, /api/assets, /api/comments])` — ANY `404` rejects
>    the whole load → an error screen, not the forest. So the boot READ set is
>    `me`/`health`/`docs`/`tree`/`assets`/`comments`. The "minimal route table" above is therefore
>    **replaced** by this boot set (historically ADR-0119 §2; carried forward by ADR-0176 §4); the new
>    [`boot-read-routes`](boot-read-routes.md) capability adds the three `local-backend-boot` did not
>    (`me`/`docs`/`comments`). **The re-compose-don't-import boundary call is UNCHANGED** — the desktop
>    OWNS a read router that re-composes the organism drivers (and re-reads `<repo>/docs` over `node:fs`)
>    exactly as `devApi.ts` does; it never imports `apps/studio/server`. Verbatim full route-table
>    sharing stays deferred (a shared read-route organism touching the `studio` story is the clean
>    follow-on, ADR-0119 "Bad / accepted costs").

## Capabilities (9)

Listed roots-first (a capability appears after everything it depends on).

| # | capability | outcome | proof | depends on |
|---|------------|---------|-------|------------|
| 1 | [`credential-broker`](credential-broker.md) | The member stores, checks presence of, and removes each of the two runtime credentials through a desktop-only Credentials panel; the main-process broker round-trips the OS keychain and never returns a stored value to the renderer. | contract-test (main-process contracts green) + contract-test (panel component tests) + operator-attested (real OS keychain via panel) | — |
| 2 | [`electron-shell`](electron-shell.md) | The desktop shell loads the compiled studio bundle and wires the real OS-keychain adapter to the credential broker behind context-isolated `desktopAuth` for the Credentials panel. | operator-attested (ADR-0070) | `credential-broker` |
| 3 | [`local-backend-boot`](local-backend-boot.md) | The Electron main process composes a local studio backend from the organism drivers and serves it on `127.0.0.1` `/api/*`, replacing the `static-server.ts` 503 stub. | contract-test (CI red→green) | — |
| 4 | [`boot-read-routes`](boot-read-routes.md) | The local backend adds the studio's remaining BOOT read routes — `me` (a local member identity), `docs` (read from the member's checkout), `comments` (an injected store seam) — re-composed from the organism drivers (never importing the studio server), so the frontend boots and renders the forest instead of an access/error screen (ADR-0119 §2). | contract-test (CI red→green) | `local-backend-boot` |
| 5 | [`chat-sse-mount`](chat-sse-mount.md) | The local backend adds a `POST /api/chat` route that starts an `orchestrate`-driven session (the CONSUMED headless-orchestrator `chat-session-stream` core, `startChatStream`) and streams its events to the renderer as SSE — re-composed from `@storytree/drive` (never importing the studio server), read/propose only (no signing, no build, no PR; ADR-0091). | contract-test (CI red→green) | `local-backend-boot` |
| 6 | [`local-credential-wiring`](local-credential-wiring.md) | The keychain-brokered credential is fed to the in-process local backend's build/orchestrate drivers (no TLS hop), and the renderer never receives the raw token. | contract-test (CI red→green) | `credential-broker`, `local-backend-boot` |
| 7 | [`shared-forest-connection`](shared-forest-connection.md) | The local backend BROKERS its verdict/presence writes to the hosted studio's members-gated write-broker (no local DB connection; ADR-0117), with a readiness probe that fails closed (and clear guidance) when the broker is unreachable or the member is not an authorized `builder`. | contract-test (CI red→green) + operator-attested live broker/builder-grant | `local-backend-boot` |
| 8 | [`brokered-local-uat-signing`](brokered-local-uat-signing.md) | A local human's observation of a declared human-witness UAT leg becomes a real operator-attested verdict pinned to a clean git HEAD and persisted through the injected forest broker writer; machine legs, blank/agent signers, dirty/malformed state, unknown tests, and broker refusals fail closed. | integration-test (CI red→green) | `shared-forest-connection`, `boot-read-routes` |
| 9 | [`desktop-launch-preconditions`](desktop-launch-preconditions.md) | Before the sidecar wires ANY backend, a pure gate proves two launch preconditions — an available git checkout and a reachable live store (auto-waking it if asleep, bounded) — and refuses with a clear reason naming the unmet precondition, so the sidecar wires the ONE full backend or refuses cleanly, never degrading to a partial read shell (ADR-0176). | contract-test (CI red→green) + operator-attested refuse UX | — (independent root; front-runs the backend boot) |

The **chat surface** the member talks to has THREE layers, split across two stories:
- its provable streaming **BACKEND** (the SSE/intake core that drives `orchestrate`, `startChatStream`)
  is **headless-orchestrator's Phase 2** (ADR-0108, BUILT/green), CONSUMED by this desktop;
- the desktop-side **MOUNT** of that core — the `POST /api/chat` route on the local backend that
  serialises the core's event stream as SSE — IS a desktop capability ([`chat-sse-mount`](chat-sse-mount.md),
  #5 above), the thin glue [`chat-session-stream`](../headless-orchestrator/chat-session-stream.md)'s
  Guidance names ("the HTTP MOUNTING … is the consuming surface's thin glue, the desktop's local-backend");
- the renderer chat **PANEL** (the thin client that POSTs the intake and renders the SSE stream) is a
  **`studio` frontend component** (consumed compiled, ADR-0090 d.4 / ADR-0108 d.1), **not a capability
  here** (see "Renderer chat panel placement" + the Cross-story boundary section); its *appearance* is
  part of this story's operator-attested UAT (leg 7 below).

## Within-story dependency graph

Authored from the intended data-flow; re-derive from the real imports/calls when the units are built
(ADR-0010 §3) and correct if the code disagrees. The graph is acyclic; `credential-broker`,
`local-backend-boot`, and `desktop-launch-preconditions` are the roots (`desktop-launch-preconditions`,
the ADR-0176 launch gate, has no in-story edge — it front-runs the sidecar's launch, deciding whether
any backend is wired at all, and consumes only `@storytree/drive`'s `ensureLiveDb` + `code-stamp.ts`'s
`gitHead` as injected effects).

- `electron-shell` → `credential-broker` (the shell supplies the real keychain adapter to the broker port).
- `boot-read-routes` → `local-backend-boot` (it EXTENDS the keystone's `/api/*` backend with the studio's
  remaining boot read routes — the Electron main mounts both dispatchers on the same surface, ADR-0119 §2).
- `chat-sse-mount` → `local-backend-boot` (it EXTENDS the keystone's `/api/*` backend with the
  `POST /api/chat` route — a THIRD sibling dispatcher the Electron main mounts on the same `/api/*`
  surface alongside boot-read-routes and the local-backend handler). It also CONSUMES
  `headless-orchestrator`'s `chat-session-stream` core cross-story (`startChatStream` from
  `@storytree/drive`) — see the Cross-story boundary section; that is a cross-story edge, already in
  `depends_on`, not a within-story one.
- `local-credential-wiring` → `credential-broker`, `local-backend-boot` (it feeds the broker's credential
  into the backend the boot capability stands up — so it couples to both).
- `shared-forest-connection` → `local-backend-boot` (the connection/readiness is the backend's store seam).
- `brokered-local-uat-signing` → `shared-forest-connection`, `boot-read-routes` (it consumes the
  brokered `ForestWriter` persistence boundary and the declared local UAT test context; `LOCAL_ME`
  remains deliberately `member`, while the signer is a separately injected local operator identity).

`credential-broker` (Step 1's CI-proven core) and `local-backend-boot` (the thick keystone) share no
edge — Step 1's safety boundary and Step 2's backend boot are independent roots that
`local-credential-wiring` joins.

## Cross-story boundary (ADR-0010 §4 / ADR-0074)

Authored from the intended consumed seams (re-verify against the real imports when built). All are
CONSUMED, not absorbed — this story owns the desktop shell + the local backend COMPOSITION (the
`/api/*` router, the in-process credential wiring, the readiness probe), never the drive drivers, the
agent/SDK seam, the library schema, the studio frontend, or the headless-orchestrator runtime.

- **`studio`** — the **compiled frontend** (including the renderer chat PANEL). The renderer loads
  studio's compiled dist (ADR-0090 d.4); it is studio's delivered outcome the desktop's UAT needs. The
  renderer chat panel that POSTs `/api/chat` and renders the SSE stream is a `studio` frontend component
  (`apps/studio/src`) — its provable geometry/behaviour is a `studio`-story contract (frontend-builder
  two-stage, ADR-0070), consumed here compiled; its *appearance inside the native shell* is THIS story's
  operator-attested UAT leg 7. The desktop does NOT import studio's SERVER source (the surface boundary,
  above).
- **`drive-machinery`** — the **build/orchestrate drivers + spec discovery**. The local backend
  composes `@storytree/drive` (`nodeBuild`/`storyBuild`/`adoptStory`/`orchestrate` + `loadLocalSecrets`,
  the same lazy-import shape `devApi.ts` uses) and `@storytree/orchestrator` (`findNodeSpecFile`/
  `loadNodeSpec`/`isStoryBuildable`/`resolveBuildConfig`). `@storytree/agent` is reached TRANSITIVELY
  through drive's `orchestrate` — the desktop never names the SDK (ADR-0004 single-import-site).
- **`library`** — the **knowledge surface + prompt render**. The local backend's library/tree reads and
  the orchestrate composition consume `@storytree/library/store` (`renderAgentPrompt(store,
  "session-orchestrator")` — the ONE loop definition, ADR-0051 — and `loadCorpus`).
- **`headless-orchestrator`** — the **chat/loop streaming CORE (its Phase 2)**. The chat SSE streaming
  backend + the orchestrate-driven session that ship inside this desktop are headless-orchestrator's
  Phase 2 ([`chat-session-stream`](../headless-orchestrator/chat-session-stream.md), `startChatStream`,
  ADR-0108, BUILT/green). The desktop CONSUMES that core (imported as `startChatStream` from
  `@storytree/drive` by package name — its source sits physically in drive, the studio-build precedent)
  and MOUNTS it as a `POST /api/chat` SSE route in this story's own [`chat-sse-mount`](chat-sse-mount.md)
  capability — the thin HTTP/SSE glue chat-session-stream's Guidance explicitly assigns to the consuming
  surface. The mount is OWNED here; the streaming core is NOT re-owned. The desktop does NOT import
  `apps/studio/server` (the surface boundary, ADR-0100) — `startChatStream` is reached by package name,
  and `@storytree/drive` is already a declared dep, so `check:boundaries` is satisfied by the existing
  `headless-orchestrator` edge in `depends_on` (the ADR-0074 "declare the edge" pattern). The renderer
  chat panel (the thin client over the route) is a `studio` frontend component, consumed compiled — see
  the next bullet + "Renderer chat panel placement".
- **`studio-cloud`** — the **members-gated write-broker (ADR-0117)**. The local backend's forest writes
  are BROKERED, not direct: it POSTs the locally-signed `Verdict` / `PresenceDeclaration` to studio-cloud's
  [`write-broker`](../studio-cloud/write-broker.md) over HTTPS, and the server persists them (the friend
  holds no DB identity). This is a **runtime HTTP edge** — a configured broker URL + a `fetch` POST client
  in [`shared-forest-connection`](shared-forest-connection.md) — NOT a source import: the desktop does NOT
  import `apps/studio/server` (the surface boundary, ADR-0100). The friend's in-app `builder` role
  (studio-members, consumed transitively through the broker's gate) is what authorizes the POST.
- **`proof-protocol`, `notice-board`** — the **wire SHAPES** the broker client POSTs.
  [`shared-forest-connection`](shared-forest-connection.md)'s write client imports
  `@storytree/proof-protocol` (`Verdict`) and `@storytree/notice-board` (`PresenceDeclaration`) to type —
  and the test to construct — the bytes it sends (contract `fr-write-brokers-not-direct`). They are pure-zod
  protocol packages (no `pg`, no server), so brokers-not-direct holds; but they are **not** reachable
  transitively (this repo's pnpm strict isolation has no hoisting), so they are DECLARED deps in
  `apps/desktop/package.json` and the cross-story edges are declared in `depends_on` above — exactly the
  ADR-0074 / ADR-0113 §8 "declare the edge, never work around it" pattern the drive-machinery / studio /
  library edges follow.

## Story UAT

The integrated acceptance walkthrough that proves the whole thick-local desktop meets its outcome
end-to-end. Minimal-first (one coherent journey: launch → sign in → the loop runs locally → it blooms
in the shared forest), defect-driven thereafter (each real failure earns a permanent regression case,
never speculative breadth).

> **Per-leg witness (ADR-0106).** The CI-honest mechanics legs are `witness: machine` — the package
> suites (`apps/desktop` + the drivers) cover them. The experiential legs — a built native shell, a real
> OS keychain, a real subscription `query()` running the live loop, the "feels like one app" appearance,
> the live brokered write to the hosted studio, and the member's in-app `builder` grant (ADR-0117 —
> replacing the old per-friend Cloud SQL IAM grant) — are `witness: human` (operator-attested, ADR-0070):
> an automated CI run cannot drive a native shell, a real keychain, the paid SDK leaf, a live hosted
> broker, or judge the look.
> The story-level `uat_witness` is absent → human (the ADR-0040 fail-closed signpost), so the
> machine-driven whole-story UAT node stays withheld; the crown derives from the per-leg roll-up plus
> the operator's attestations.

**Goal —** A trusted member launches the native app, signs in with their Claude subscription (held in
the OS keychain), drives a real build through the local backend, and watches it reach a signed verdict
that blooms in the shared forest — the renderer never holding the credential or importing the agent, the
credential never leaving the machine.

1. **Launch.** _(witness: human)_ The member opens the desktop app; it loads the compiled studio UI
   inside the native shell (no Vite, no source on the renderer). **Success —** the studio renders.
2. **Configure credentials in the panel, stored in the keychain.** _(witness: machine for panel
   contracts 5–9; human for real OS-keychain round-trip)_ The member opens the desktop-only Credentials
   panel (settings/control surface), enters each credential kind independently (Claude subscription
   `oauth`, Anthropic `api-key`), stores through Store/Replace, observes
   boolean-only saved status, and removes through Sign out/Remove — the raw credential never pre-fills,
   never reads back, and never appears in `localStorage` or plaintext on disk; on a real desktop app the
   operator attests a replacement token survives restart then removes cleanly. (The CI-honest core —
   two-kind broker independence, typed IPC, operation-bridge lifetime, and the panel's one-way store/
   feature gate — is `credential-broker`'s contracts 1–9.)
3. **The local backend is live (no 503).** _(witness: machine)_ With the desktop main process running,
   a `GET /api/*` read route (library/tree/activity) returns a real envelope body — NOT the
   `static-server.ts` 503 stub. **Success —** the backend booted in-process and `/api/*` serves the
   composed organism drivers. (`local-backend-boot`'s contract test asserts the live route over the
   stub.)
4. **The credential reaches the in-process backend.** _(witness: machine)_ A build/orchestrate driver
   invocation in the local backend receives the brokered credential in-process (no TLS hop), and the
   renderer is never handed the raw token. (`local-credential-wiring`'s contract test asserts the
   in-process hand-off + the renderer isolation.)
5. **A real build reaches a signed verdict locally and blooms in the shared forest VIA THE BROKER.**
   _(witness: human)_ The member triggers a build from the UI; the local backend drives the real `story
   build --real` (or a node `--live` smoke) on their machine — a real checkout + git + pnpm + worktrees —
   the spine observes RED then GREEN from real exit codes and SIGNS LOCALLY, then the local backend **POSTs
   the signed verdict to the studio's write-broker** (ADR-0117), the SERVER persists it to the SHARED
   `events.verdict`, and the build blooms in the forest the owner watches. **Success —** a signed verdict
   from a real local build, brokered to the shared forest under the friend's `builder` role (no DB identity
   on his machine), the agent having signed nothing itself and the broker having re-signed nothing
   (ADR-0091) — and CI later re-proves it independently. *(operator-attested — a real `--real`/`--live`
   build is subscription-billed and the brokered write needs the live hosted studio; an agent should not
   burn the spend unattended.)*
6. **The brokered-forest connection is honest when the broker is unreachable / the member is not a builder.**
   _(witness: machine for the probe; human for the live broker+grant)_ Before the member is marked a
   `builder` (or when the broker is down), the readiness probe fails CLOSED with clear guidance (you are
   not yet an authorized builder — ask the owner / the broker is unreachable — is the studio up?) rather
   than hanging or forging success; after the owner marks the member a **builder** in the Members panel (an
   in-app grant — no `gcloud`, no Cloud SQL IAM grant; ADR-0117 d.2), the brokered write path connects.
   (`shared-forest-connection`'s contract test proves the fail-closed probe over an injected broker-POST
   seam; the live broker + the `builder` grant are operator-attested.)
7. **It feels like one app, chat included.** _(witness: human)_ Launch, sign-in, the live loop, the chat
   panel (the consumed headless-orchestrator Phase-2 surface), and the approval-to-land gate read as one
   coherent native application. **Success —** the owner's two-stage visual verdict (ADR-0070 / ADR-0113
   §9): the appearance is witnessed, not machine-asserted.
8. **Launch refuses cleanly when a precondition is unmet — no half-wired shell (ADR-0176).**
   _(witness: machine for the gate outcome; human for the splash / refuse+retry window)_ Before the
   sidecar wires any backend, the launch-precondition gate runs: with no git checkout it refuses
   IMMEDIATELY naming the unmet precondition and NEVER wakes the DB; with a checkout it reuses
   `ensureLiveDb` to probe and bounded-auto-wake the live store, proceeding to the ONE fully-wired
   backend only when both hold, else refusing with the DB reason surfaced unchanged. **Success —** the
   sidecar either wires the single full backend or refuses with a clear reason (through the Electron
   splash → refuse+retry window); it NEVER serves the retired degraded read shell
   (`serveDegraded` / `degradedBackend` deleted), so the *"UAT tests unavailable: unknown endpoint"*
   half-wired-forest failure cannot recur. (`desktop-launch-preconditions`'s contract test proves the
   git-first refusal + the never-wake fence + the DB passthrough over injected git/DB doubles; the
   splash + refuse+retry window flow is operator-attested, ADR-0070 / ADR-0176 §5.) *(This is the
   defect-driven regression case ADR-0176 was root-caused from — the Story UAT grows by appending a
   permanent case per real failure, never speculative breadth.)*

End state — a trusted member ran the whole storytree loop on their own machine through a native app,
their credential held in the OS keychain and never leaving the machine, their builds signed locally from
real exit codes and BROKERED to the shared forest (POSTed to the studio's members-gated write-broker under
their in-app `builder` role, no DB identity on their machine; ADR-0117), the renderer never crossing the
agent boundary.

## Reliability Gates

[`credential-broker`](credential-broker.md) LANDED green — the main-process broker contracts (1–4:
two-kind keychain independence, typed-IPC-never-discloses, operation-env-lifetime,
runtime-credential-partition) pass their `apps/desktop` `node:test` suite, and the desktop-only
Credentials panel contracts (5–9: feature-gated, two independent rows, one-way store, blank refusal,
per-kind sign-out; ADR-0179) pass their `apps/studio` vitest/jsdom suite
(`apps/studio/src/components/CredentialsPanel.test.tsx`). But storytree's own prove-it-gate never DROVE
that green to a persisted verdict: the panel `real:` arm was **hand-landed** (commit `0d389da`), not
driven through the spine, so the `--real --store pg` signing was skipped and the code is
**tested-but-UNREGISTERED** (crown `–`, `build=unregistered`). On a GREEN base a fresh `--real` build
HALTS — there is no red→green left to earn, and *halt is never a pass*
([ADR-0130](../../docs/decisions/0130-remove-the-inner-loop-usd-budget-ceilings-subscription-funde.md));
forcing a red on already-built code is proof theater
([ADR-0159](../../docs/decisions/0159-frontend-builder-proves-stage-1-through-the-inner-loop-visua.md)).
So the honest path off unregistered is NOT a manufactured build over mature tested code — it is the
author-declared **reliability gate** below, observe-and-signed to an `adopted` verdict
([ADR-0085](../../docs/decisions/0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md),
resolving [ADR-0083](../../docs/decisions/0083-author-defined-story-green-declared-obligations-machine-per.md)
Fork B). This is the `mapped → healthy` = **Adopt** transition
[ADR-0094](../../docs/decisions/0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md) /
[ADR-0097](../../docs/decisions/0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md)
names — greening the covered capability via the `(covers:)` coverage ADR-0097 §5/§2 defines, WITHOUT a
manufactured red. (The story stays `proposed`; this gate is a `proposed` story carrying an observe gate,
exactly the desktop-build-mount precedent — the gate greens a capability, not the authored status.)

`credential-broker` is a SINGLE capability whose one journey spans TWO owning package suites — the
main-process broker in `apps/desktop` (`node:test`) and the renderer Credentials panel in `apps/studio`
(vitest jsdom, ADR-0179) — so ONE observe gate names BOTH, running them through a single executable
command. The coverage is real, not declared-only: each suite is the cap's OWN contract suite over its
real collaborators (ADR-0097 §2) — the broker contracts over the real `InMemoryKeychain` + an injected
environment, the panel contracts over an injected `desktopAuth` fake. This gate is DISTINCT from
`## Story UAT` above (the integrated acceptance journey, part machine-witnessed and part
operator-attested): it is the author's **expandable reliability floor** — it starts by adopting the
existing green suites and GROWS a `_(gate: build-tests)_` gate (a genuine red→green regression leg) the
moment observation proves insufficient — a real broker- or panel-contract defect slips the existing
suites.

1. **The credential-broker suites are green — the broker contracts and the Credentials panel** _(gate: observe)_ _(covers: credential-broker)_ `pnpm --filter desktop --filter studio test`. The
   spine runs it at a clean committed HEAD and OBSERVES both owning suites green — the main-process
   broker (contracts 1–4: two-kind keychain independence, typed-IPC-never-discloses,
   operation-env-lifetime, runtime-credential-partition; `apps/desktop`, node:test) AND the desktop-only
   Credentials panel (contracts 5–9: feature-gated, two independent rows, one-way store, blank refusal,
   per-kind sign-out; `apps/studio/src/components/CredentialsPanel.test.tsx`, ADR-0179, vitest jsdom) —
   then signs an `adopted` verdict. `credential-broker` greens via this gate's `(covers:)` (ADR-0097 §5).
   The real `@napi-rs/keyring` OS-keychain round-trip through the panel is NOT observed here — it is the
   operator-attested leg (ADR-0070 / ADR-0179 §5, Story UAT leg 2's human half), which an agent can never
   self-attest.

Adopting this gate greens ONLY `credential-broker` — its DERIVED crown, via the `(covers:)` above. It
does NOT green the story and does NOT touch the authored `status:` (which stays `proposed`): the desktop
crown still awaits its OTHER capabilities and its operator-attested Story UAT legs — the built native
shell, the real OS-keychain round-trip, the live subscription loop, the brokered forest write, the
in-app `builder` grant, and the "feels like one app" appearance (legs 1, 2, 5, 6-grant, 7) — which an
agent can never self-attest. `healthy` stays non-authorable
([ADR-0020](../../docs/decisions/0020-red-green-enforcement-on-the-owned-loop.md)) — the authored
`status:` is never `healthy`; the world's crown DERIVES green from the signed verdict
([ADR-0040](../../docs/decisions/0040-verdict-derived-green-and-the-human-witness-signpost.md)), and only
when every capability is `healthy` AND every own-proof obligation is signed. This gate adds ONE honest
signed verdict toward that roll-up; it is not the crown.

## Proof

The story is proven when that walkthrough passes — the mechanics legs (3, 4, the probe half of 6) green
under the package suites with the capabilities' contracts green underneath, and the experiential legs
(1, 2, 5, the live-grant half of 6, and 7) operator-attested. Per ADR-0020, `healthy` is only ever
DERIVED from signed verdicts; nothing here is authored healthy. The three thick-client capabilities are
proof-wired (each carries a `proof:` block with a `real:` arm — a NET-NEW red→green) so the spine can
drive their offline suites red→green under its own gate; the story's machine-driven UAT node is WITHHELD
(its `uat_witness` is absent → human, ADR-0040), so driving those capabilities to signed verdicts is
what makes the thick-client layer buildable, and the crown additionally awaits the operator's
attestations (legs 1, 2, 5, 6-grant, 7).

## Open modeling calls (for the owner)

One GENUINELY OPEN fork at the story-shape level (recorded below, escalated — not pre-decided), plus two
decided-and-surfaced items. ADR-0113 settled the desktop's overall shape (thick-local, the inner-circle
premise, the shared forest, minimal packaging); the local-backend boundary call (re-compose the organism
drivers vs import the studio server) is a **dependency-graph/layout decision the story-author owns** (owner
correction 2026-06-26) and is DECIDED above (re-compose), not escalated.

### OPEN — the live chat's orientation `runner` needs a boundary decision (escalated to the owner)

`chat-sse-mount` (PR #439) landed read/propose chat: a member chats to a real orient+propose agent over
the rendered `session-orchestrator` prompt. But the live chat **cannot orient on live state**. A live
`orchestrate`/`startChatStream` session needs an `OrientationRunner` for real orientation (else the agent
gets the `(orientation runner not configured)` no-op stub and is blind to the live tree / library / notice
board — see [`chat-sse-mount`](chat-sse-mount.md) "The deferred mount-deps extension is GLUE"). The runner
is the CLI `run()` in `@storytree/cli`, which the desktop does **not** depend on (and arguably shouldn't,
the ADR-0004 single-import-site posture), and `@storytree/drive` carries a HARD INVARIANT that it imports
nothing from `@storytree/cli` (no cycle). So a boundary-preserving live runner needs a DESIGN DECISION the
existing decisions do NOT settle — candidate shapes (not pre-chosen here):
- **Extract the read-only orientation dispatch** into a package BOTH `cli` and the desktop sidecar can
  import (the orientation tools are read-only — tree/library/notice-board reads — so a shared
  orientation-dispatch organism would not drag the build/PR machinery across the boundary); OR
- **Declare a new `desktop` → `cli` cross-story edge** (re-weighing the ADR-0004 posture for the
  thick-local trusted-member phase, the way ADR-0113 already re-weighed ADR-0090 d.4); OR
- something else.

This is **NOT decided** — it is a real architectural fork the unit surfaced but did not resolve, escalated
to the owner (it touches the ADR-0004 boundary posture, so it is above the story-author's pure
layout domain). Until it is resolved, the landed chat is honest as a *prompt-grounded* orient+propose
surface; live-state orientation is the next increment, gated on this call. (The mechanical mount-deps
forwarding — `runner`/`model`/`maxTurns`/`maxBudgetUsd` through `ChatSseMountDeps` — is already recorded as
operator-attested GLUE in item 1 below and in `chat-sse-mount.md`; THIS open item is the prior question of
*what runner there is to forward* without breaching the boundary.)

### Recorded as decided-and-surfaced (forced by existing decisions, reversible, internal — not re-litigated per the owner-fork bar):

1. **The chat surface's STREAMING CORE is consumed from `headless-orchestrator`; its desktop-side MOUNT
   is a desktop capability; its renderer PANEL is a `studio` component (decided — the cap-vs-glue +
   panel-placement call, the story-author's layout domain).** Three layers, three homes:
   - The provable streaming **backend** (`startChatStream` driving `orchestrate`) is
     headless-orchestrator's Phase 2 ([`chat-session-stream`](../headless-orchestrator/chat-session-stream.md),
     ADR-0108, green) — CONSUMED, not re-owned.
   - The desktop-side **mount** — the `POST /api/chat` route on the local backend that drives that core
     and serialises its event stream as SSE — is a NEW desktop capability
     ([`chat-sse-mount`](chat-sse-mount.md)), NOT glue folded under `local-backend-boot`. The
     splitting-rule (ADR-0010) makes the call: it shares the mounted-`/api/*`-dispatcher precondition
     with `local-backend-boot`/`boot-read-routes` but proves a DIFFERENT observable (a POST intake +
     a *streaming* SSE response, with the consumed `orchestrate` as the live collaborator and the
     terminal `error`/`refused` branches load-bearing), and it has its own isolatable net-new red→green
     (a `node:test` driving the real `startChatStream` with an injected scripted `queryFn`, no live SDK
     — proof scope `apps/desktop`). Exactly the precedent `boot-read-routes` set as a sibling. The thin
     glue chat-session-stream's Guidance assigns to "the consuming surface" lands HERE, proven.
   - The renderer chat **panel** (the thin client that POSTs the intake and renders the SSE stream) is a
     `studio` frontend component (`apps/studio/src`) — the desktop renders the COMPILED studio dist, so a
     renderer panel is studio's surface, not the desktop's. **Now AUTHORED as the `studio`-story
     [`chat-panel`](../studio/chat-panel.md) capability** (story-author 2026-06-27). Its provable
     geometry/behaviour (POSTs intent once + busy state; renders the streamed `done`/`error`/`refused`
     distinctly; degrades honestly to a disabled "no backend" state where the route is absent) is a
     `studio`-story contract proven by `node:test`'s studio analog — vitest jsdom, the `BuildSection`
     precedent (frontend-builder two-stage, ADR-0070); it imports NO agent/drive/model code and parses
     SSE `data:` frames as plain JSON against a locally-declared type (so it adds no cross-story edge —
     see chat-panel.md "No new cross-story edge"). Its *appearance inside the native shell* is THIS
     story's already-declared operator-attested UAT leg 7 (the look is witnessed, never a machine visual
     verdict — the panel author signs no visual verdict). The panel is owned by `studio` — deliberately
     NOT a desktop capability (slow growth: the desktop's net-new is the mount; the panel rides studio's
     frontend discipline).
   - The **sidecar wiring** that chains `createChatSseMount` as a third dispatcher in
     `apps/desktop/electron/backend-entry.ts` (alongside `createBootReadRoutes` + `createLocalBackend`)
     is **operator-attested GLUE, NOT a capability** (story-author 2026-06-27 — the same call the
     splitting-rule already made for boot-read-routes' and local-backend's wiring). The dispatcher is the
     provable cap (`chat-sse-mount`, green); `electron/` is the operator-attested binding the
     CI-provable core is deliberately electron-free of ("THE CI-PROVABLE CORE IS ELECTRON-FREE",
     chat-sse-mount.md). There is no isolatable red→green seam in chaining a third already-proven
     dispatcher into the Electron main — it is witnessed under UAT leg 7, not asserted in CI. The
     **mount-deps extension** (forwarding `startChatStream`'s live `runner`/`model`/etc. so the live chat
     actually ORIENTS) is **also operator-attested glue, not an offline-provable contract** — the
     `OrientationRunner` is reachable ONLY via a real SDK tool-dispatch, which a scripted `queryFn` never
     triggers, so a forwarded sentinel runner has no offline observable (full reasoning in chat-sse-mount.md
     "The deferred mount-deps extension is GLUE"). The orchestrator executes both operator-attested under
     leg 7.
2. **The desktop serves the studio's BOOT read set; verbatim full route-table sharing stays deferred
   (decided, ADR-0119 §2).** The desktop mounts the studio's BOOT read routes
   (`me`/`health`/`docs`/`tree`/`assets`/`comments`) — composed from the organism drivers and a read-only
   `<repo>/docs` walk, NOT imported from the studio server — because the frontend boot-gates on `/api/me`
   and `Promise.all`s docs+assets+comments (a minimal table that omitted these boots to an error screen,
   ADR-0119 finding 2, carried forward by ADR-0176 §4). This REPLACES ADR-0113's "minimal route table" ([`boot-read-routes`](boot-read-routes.md)
   adds the three `local-backend-boot` did not). The backend itself runs as a **tsx sidecar** the Electron
   main spawns and proxies `/api/*` to (bundling raw-TS drivers into the CJS main breaks `import.meta`,
   ADR-0119 finding 1 / §1). Extracting the studio's FULL route table into a shared read-route organism
   (which would touch the `studio` story) is still a clean follow-on, not pulled into this journey to keep
   it small.

The only **owner-level** item is operational, not modeling, and ADR-0117 SIMPLIFIED it: it is no longer
an attended Cloud SQL IAM `gcloud` grant but an **in-app `builder` mark in the Members panel** (ADR-0117
d.2 — the friend holds no DB identity; the server is the single DB authority). A privileged action the
human performs, now fully in-app, surfaced in `shared-forest-connection` and UAT leg 6. *(A third item is
RECORDED as decided-and-surfaced, forced by ADR-0117, reversible, internal — not re-litigated:* **the
friend's forest writes are brokered to studio-cloud's `write-broker`, not direct** *— the local backend
opens no DB connection. The cross-story edge desktop → studio-cloud is a runtime HTTP edge, declared in
`depends_on`; the broker endpoint itself is `studio-cloud`'s capability, not re-owned here.)*
