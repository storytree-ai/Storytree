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
# `startChatStream`) was headless-orchestrator's Phase 2 (ADR-0108) and is now OWNED by `app-guide` (the
# ADR-0175 absorb, 2026-07-17 — headless-orchestrator retired), CONSUMED here; but the desktop-side
# MOUNT of that core — the `POST /api/chat` route on the local backend that serialises its event stream
# as SSE — IS a desktop capability (`chat-sse-mount`), the thin glue the consuming surface owns. The
# renderer chat PANEL is a `studio` frontend component (consumed compiled), not a capability
# here (see the Cross-story boundary section + "Renderer chat panel placement").
# The last two are BROWNFIELD capabilities authored over already-built, already-tested code by
# capability-layer-coverage-arc increment 2 (2026-08-07), both `status: mapped` with a spec-borne
# `proof:` block and deliberately NO `real:` arm (ADR-0094): `pinned-runtime-apply` (the ADR-0164/
# ADR-0181 apply-a-landed-fix loop — resolve a pinned-`main` runtime, report the running version,
# fast-forward onto merged `main` or refuse) and `advisory-overlay-reads` (the ADR-0033 advisory-read
# helper the sidecar's five overlay reads share). Both are independent ROOTS in the code sense; the
# second declares a `local-backend-boot` edge because its route-level proof composes the real backend.
# Row 12 is the same arc's increment 3 (2026-08-07), also brownfield: `mirrored-route-conformance`, the
# ADR-0251 cross-surface conformance harness that proves this story's re-composed `/api/*` payloads
# still equal the studio's. It is the one unit here whose code spans THREE buildings (packages/cli,
# apps/studio, apps/desktop) and whose proof is a standing GATE rather than a package suite — see its
# spec for the placement call and for why a per-surface split would have been illegal, not merely
# undesirable.
capabilities: [credential-broker, electron-shell, local-backend-boot, boot-read-routes, chat-sse-mount, local-credential-wiring, shared-forest-connection, brokered-local-uat-signing, desktop-launch-preconditions, pinned-runtime-apply, advisory-overlay-reads, mirrored-route-conformance]
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
#   - library         — @storytree/library/store (renderAgentPrompt + loadFixtureCorpus) for the local backend's
#                       library/tree reads and the orchestrate composition's prompt render (ADR-0051).
#   - app-guide — the chat/loop streaming CORE that ships INSIDE this desktop (the orchestrate-driven
#                       session + its SSE-shaped event stream `startChatStream`, physically in
#                       @storytree/drive). This core was headless-orchestrator's Phase 2 (ADR-0108); as of
#                       the ADR-0175 absorb (2026-07-17) it is OWNED by `app-guide` (headless-orchestrator is
#                       retired, its dormant substrate absorbed there). The desktop CONSUMES that core; it is
#                       NOT a desktop capability (edge inverts to desktop → app-guide). The desktop-side
#                       MOUNT of it — the `POST /api/chat` SSE route on the local backend — REMAINS a desktop
#                       capability (`chat-sse-mount`), the thin glue the consuming surface owns. The renderer
#                       chat PANEL is a `studio` frontend component (a thin client over the route, ADR-0108
#                       d.1), also not a capability here. (Import is by package name into @storytree/drive —
#                       already declared — so this app-guide edge is an artifact_edge, non-import ownership.)
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
#   - arc            — @storytree/arc, the arc → children join `loadArcRollups` re-composes. Until
#                       2026-08-14 this rode the existing drive edge (the join lived in
#                       @storytree/drive for reach); ADR-0369 D1/D2 gave the arc domain its own
#                       package and fixed the arrow at arc → drive, so drive's barrel dropped the
#                       re-export and this backend imports @storytree/arc directly. A RE-POINTING of
#                       the same code edge onto a narrower package (the ADR-0112 precedent), not a new
#                       coupling — and NOT an artifact edge: it is a real declared dep in
#                       apps/desktop/package.json, pulled through a lazy `loadArc()` memo mirroring
#                       `loadDrive()` for the vite config-load reason documented at the call site.
depends_on: [studio, drive-machinery, library, app-guide, studio-cloud, proof-protocol, notice-board, arc]
# ADR-0166 artifact edges: the deliberate NON-IMPORT seams among the depends_on above (build-artifact /
# write-target / hosted-seam consumption, narrated per-edge in the comments/body of this spec) — the
# declared-edge honesty gate accepts these without a code import; remove an entry if the seam ever
# becomes a real package import.
artifact_edges: [studio, app-guide, studio-cloud]
# Deciding ADRs (ADR-0037 §2): 0109 sanctions the credential-host Electron client; 0111 fixes Step 1's
# placement (apps/desktop + this story); 0113 redefines Step 2 as booting the worker LOCALLY (the thick
# client) and amends ADR-0090 d.4 for the trusted inner-circle phase; 0117 amends ADR-0113 §6 — the
# friend's forest writes are BROKERED to studio-cloud's write-broker (no per-friend Cloud SQL IAM grant,
# an in-app `builder` role instead); 0090 the client/worker split + d.4 source guard (amended); 0091 the
# proof-off-tether sanction the local backend rides (and the broker holds no signing key); 0004 the
# orchestrator/agent boundary preserved by topology (main IS the boundary); 0108 the chat surface that
# ships here; 0175 re-points the consumed chat streaming CORE's ownership from the retired
# headless-orchestrator to `app-guide` (the absorb) — desktop consumes it (desktop → app-guide), the
# chat-sse-mount MOUNT stays desktop's; 0021 keyless Cloud SQL IAM (the per-friend grant ADR-0117 REMOVES for friends); 0070 the
# operator-attested appearance (and the live `builder` grant); 0176 supersedes 0119 and is the complete
# current sidecar decision: tsx-sidecar + studio boot reads + re-compose boundary, with DB/git launch
# preconditions and no degraded shell.
decisions: [109, 111, 113, 117, 176, 90, 91, 4, 108, 175, 21, 70, 179, 180, 232]
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
- **Design intent for the felt surface — carried here, deliberately NOT a UAT leg (ADR-0348 D6).** Two
  experience intents used to be story UAT legs (the old legs 9 and 11) and were DELETED on 2026-08-11:
  a user EXPERIENCE property is not a user ACCEPTANCE criterion, and the owner's feedback on it comes
  from USING the app, not from a gate. The intents themselves stand and are recorded here so they are
  not lost with their legs. **(a) It should feel like ONE app, chat included** — launch, sign-in, the
  live loop, the consumed `app-guide` chat panel (ADR-0175) and the approval-to-land gate should read
  as one coherent native application rather than as a shell with parts bolted into it. **(b) The
  splash and the refuse+retry window should read clearly** — a launch that refuses a precondition
  (ADR-0176 §5) should land the member on a window they can read and retry from, not a dead end. Leg 1
  machine-pins that the compiled studio actually renders and leg 10 machine-pins that the refusal
  happened and what it said; neither is the felt claim, and the felt claim now has no gate.
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

## Capabilities (12)

Listed roots-first (a capability appears after everything it depends on). Rows 10–12 are BROWNFIELD
(`status: mapped`, authored over already-built and already-tested code by capability-layer-coverage-arc
increments 2 and 3, 2026-08-07): their proof is a spec-borne `proof:` block over REAL passing offline
tests, with deliberately no `real:` arm — the green path for `mapped` is Adopt (ADR-0085 / ADR-0094),
never a manufactured red on mature code (ADR-0159).

Row 12 differs from its two predecessors in one way worth reading before its spec: its `proof.command`
is a standing GATE STEP (`pnpm check:mirror-conformance`), not a `--filter … test`. That is not a
stylistic choice — the `@storytree/cli` suite runs its judge's rules but never spawns a probe, so it
cannot go red when this story's re-composed copy drifts, and binding the outcome to it would be the
rubber-stamp ADR-0097 §2 forbids.

| # | capability | outcome | proof | depends on |
|---|------------|---------|-------|------------|
| 1 | [`credential-broker`](credential-broker.md) | The member stores, checks presence of, and removes each of the two runtime credentials through a desktop-only Credentials panel; the main-process broker round-trips the OS keychain and never returns a stored value to the renderer. | contract-test (main-process contracts green) + contract-test (panel component tests) + operator-attested (real OS keychain via panel) | — |
| 2 | [`electron-shell`](electron-shell.md) | The desktop shell loads the compiled studio bundle and wires the real OS-keychain adapter to the credential broker behind context-isolated `desktopAuth` for the Credentials panel. | operator-attested (ADR-0070) | `credential-broker` |
| 3 | [`local-backend-boot`](local-backend-boot.md) | The Electron main process composes a local studio backend from the organism drivers and serves it on `127.0.0.1` `/api/*`, replacing the `static-server.ts` 503 stub. | contract-test (CI red→green) | — |
| 4 | [`boot-read-routes`](boot-read-routes.md) | The local backend adds the studio's remaining BOOT read routes — `me` (a local member identity), `docs` (read from the member's checkout), `comments` (an injected store seam) — re-composed from the organism drivers (never importing the studio server), so the frontend boots and renders the forest instead of an access/error screen (ADR-0119 §2). | contract-test (CI red→green) | `local-backend-boot` |
| 5 | [`chat-sse-mount`](chat-sse-mount.md) | The local backend adds a `POST /api/chat` route that starts an `orchestrate`-driven session (the CONSUMED chat streaming core `startChatStream` — app-guide's absorbed substrate, ADR-0175, formerly headless-orchestrator's `chat-session-stream`) and streams its events to the renderer as SSE — re-composed from `@storytree/drive` (never importing the studio server), read/propose only (no signing, no build, no PR; ADR-0091). | contract-test (CI red→green) | `local-backend-boot` |
| 6 | [`local-credential-wiring`](local-credential-wiring.md) | The keychain-brokered credential is fed to the in-process local backend's build/orchestrate drivers (no TLS hop), and the renderer never receives the raw token. | contract-test (CI red→green) | `credential-broker`, `local-backend-boot` |
| 7 | [`shared-forest-connection`](shared-forest-connection.md) | The local backend BROKERS its verdict/presence writes to the hosted studio's members-gated write-broker (no local DB connection; ADR-0117), with a readiness probe that fails closed (and clear guidance) when the broker is unreachable or the member is not an authorized `builder`. | contract-test (CI red→green) + operator-attested live broker/builder-grant | `local-backend-boot` |
| 8 | [`brokered-local-uat-signing`](brokered-local-uat-signing.md) | A local human's observation of a declared human-witness UAT leg becomes a real operator-attested verdict pinned to a clean git HEAD and persisted through the injected forest broker writer; machine legs, blank/agent signers, dirty/malformed state, unknown tests, and broker refusals fail closed. | integration-test (CI red→green) | `shared-forest-connection`, `boot-read-routes` |
| 9 | [`desktop-launch-preconditions`](desktop-launch-preconditions.md) | Before the sidecar wires ANY backend, a pure gate proves two launch preconditions — an available git checkout and a reachable live store (auto-waking it if asleep, bounded) — and refuses with a clear reason naming the unmet precondition, so the sidecar wires the ONE full backend or refuses cleanly, never degrading to a partial read shell (ADR-0176). | contract-test (CI red→green) + operator-attested refuse UX | — (independent root; front-runs the backend boot) |
| 10 | [`pinned-runtime-apply`](pinned-runtime-apply.md) | A landed fix reaches the running desktop app only by a fast-forward of its pinned-`main` runtime worktree — the app reporting the code it is actually running, and refusing a runtime that is not pinned rather than serving a stray branch (ADR-0164 / ADR-0181). | integration-test, `mapped` (real passing offline tests across the `desktop` + `studio` suites; observational, NOT driven red→green) | — (independent root; consumed BY the health composition and the Electron main, which are glue) |
| 11 | [`advisory-overlay-reads`](advisory-overlay-reads.md) | Every overlay read the sidecar makes fails to a bounded, logged null rather than to a throw or a hang, so a down store leaves the forest under-claiming instead of hanging `/api/tree` (ADR-0033). | integration-test, `mapped` (real passing offline tests; observational, NOT driven red→green) | `local-backend-boot` |
| 12 | [`mirrored-route-conformance`](mirrored-route-conformance.md) | Every `/api/*` payload this story re-composes is proven equal to the studio's reference payload — the same entries, the same order, the same field values — with neither surface importing the other (ADR-0251 / ADR-0176). | integration-test, `mapped` (a real STANDING GATE, `pnpm check:mirror-conformance`; observational, NOT driven red→green) | `local-backend-boot`, `boot-read-routes` |

The **chat surface** the member talks to has THREE layers, split across two stories:
- its provable streaming **BACKEND** (the SSE/intake core that drives `orchestrate`, `startChatStream`)
  was **headless-orchestrator's Phase 2** (ADR-0108, BUILT/green) and is now **owned by `app-guide`** (the
  ADR-0175 absorb — headless-orchestrator retired), CONSUMED by this desktop;
- the desktop-side **MOUNT** of that core — the `POST /api/chat` route on the local backend that
  serialises the core's event stream as SSE — IS a desktop capability ([`chat-sse-mount`](chat-sse-mount.md),
  #5 above), the thin glue [`chat-session-stream`](../headless-orchestrator/chat-session-stream.md)'s
  Guidance names ("the HTTP MOUNTING … is the consuming surface's thin glue, the desktop's local-backend");
- the renderer chat **PANEL** (the thin client that POSTs the intake and renders the SSE stream) is a
  **`studio` frontend component** (consumed compiled, ADR-0090 d.4 / ADR-0108 d.1), **not a capability
  here** (see "Renderer chat panel placement" + the Cross-story boundary section); its *appearance* is
  no longer carried by any UAT leg at all — the old operator-attested appearance leg was DELETED by
  ADR-0348 D6 (a user EXPERIENCE property is not a user ACCEPTANCE criterion), and the intent it
  stated now lives in "Design floor" above as owner feedback gathered through use.

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
  surface alongside boot-read-routes and the local-backend handler). It also CONSUMES the absorbed
  chat streaming core cross-story — `app-guide`'s `startChatStream` (from `@storytree/drive`; formerly
  headless-orchestrator's `chat-session-stream`, absorbed by ADR-0175) — see the Cross-story boundary
  section; that is a cross-story edge, already in `depends_on`, not a within-story one.
- `local-credential-wiring` → `credential-broker`, `local-backend-boot` (it feeds the broker's credential
  into the backend the boot capability stands up — so it couples to both).
- `shared-forest-connection` → `local-backend-boot` (the connection/readiness is the backend's store seam).
- `brokered-local-uat-signing` → `shared-forest-connection`, `boot-read-routes` (it consumes the
  brokered `ForestWriter` persistence boundary and the declared local UAT test context; `LOCAL_ME`
  remains deliberately `member`, while the signer is a separately injected local operator identity).

- `pinned-runtime-apply` — a root (added 2026-08-07, brownfield). Its five modules import no other
  in-story capability; everything that touches them is a CONSUMER, not an upstream. `backend-entry.ts`
  mounts its two probes into `/api/health` and `main.ts` drives its resolve + rebuild, and both are
  operator-attested glue. Note the near-miss with `desktop-launch-preconditions`: the graph text above
  says that gate "consumes `code-stamp.ts`'s `gitHead`", but the gate imports NOTHING from it — it takes
  `probeGitRepo` as an injected effect, and the GLUE (`backend-entry.ts:337`) happens to satisfy that
  effect with `gitHead`. A shared glue call site is not a capability edge, and the gate's own proof
  injects a double, so no `depends_on` is drawn in either direction.
- `advisory-overlay-reads` → `local-backend-boot` (added 2026-08-07, brownfield). The only in-story edge
  among the two increment-2 units, and it is earned by the PROOF rather than by an import: the helper's
  route-level test composes the REAL `createLocalBackend` over a real `node:http` server to assert that
  a failing overlay read reaches the client as an under-claiming `200 { builds: null }` rather than a
  500. The direction does not invert — `local-backend-boot` receives its seams already advisory-wrapped
  by `backend-entry.ts`, so it needs nothing from this unit.
- `mirrored-route-conformance` → `local-backend-boot`, `boot-read-routes` (added 2026-08-07,
  brownfield). Both edges are earned by real IMPORTS, read off the three desktop probes:
  `docs-mirror-probe.ts:21` imports `listDocs` from `./boot-read-routes.js`, and
  `activity-mirror-probe.ts:43` / `arcs-mirror-probe.ts:45` import `createLocalBackend` from
  `./local-backend.js`. The desktop half of the harness cannot emit a payload until those routes
  exist, which is the dependency test; run the other way it is clean — neither route needs anything
  from the harness, and a gate that observes a route is not an upstream of it. It is the only unit in
  this story with TWO in-story edges, because it is the only one that drives the whole assembled
  `/api/*` dispatcher rather than one seam of it.
  > **One same-package edge deliberately NOT drawn, recorded so it is not re-derived as an omission.**
  > `activity-mirror-probe.ts:42` also imports `claimRowsToActivity` from `./claim-activity.js`, a file
  > `repo-manifest.json` homes to `render-claim-as-wisp` — a capability of the **`wisp-as-story-claim`**
  > story, not this one. No edge is drawn for two reasons: `depends_on` is within-story only
  > (`topoOrderStoryNodes`, `packages/orchestrator/src/story-build.ts:161-168`, mechanically refuses an
  > id outside the owning story's capability set), and the import is same-package relative, so
  > `check:boundaries`' cross-package relative-import rule does not fire either. Flagged as an
  > observation for whoever next revisits this story's cross-story edge set; not repaired here.

`credential-broker` (Step 1's CI-proven core) and `local-backend-boot` (the thick keystone) share no
edge — Step 1's safety boundary and Step 2's backend boot are independent roots that
`local-credential-wiring` joins.

## Cross-story boundary (ADR-0010 §4 / ADR-0074)

Authored from the intended consumed seams (re-verify against the real imports when built). All are
CONSUMED, not absorbed — this story owns the desktop shell + the local backend COMPOSITION (the
`/api/*` router, the in-process credential wiring, the readiness probe), never the drive drivers, the
agent/SDK seam, the library schema, the studio frontend, or the app-guide-owned chat streaming runtime.

- **`studio`** — the **compiled frontend** (including the renderer chat PANEL). The renderer loads
  studio's compiled dist (ADR-0090 d.4); it is studio's delivered outcome the desktop's UAT needs. The
  renderer chat panel that POSTs `/api/chat` and renders the SSE stream is a `studio` frontend component
  (`apps/studio/src`) — its provable geometry/behaviour is a `studio`-story contract (frontend-builder
  two-stage, ADR-0070), consumed here compiled; its *appearance inside the native shell* is carried by
  NO UAT leg since ADR-0348 D6 deleted this story's two experience legs — it is design intent recorded
  in "Design floor", answered by the owner using the app. The desktop does NOT import studio's SERVER
  source (the surface boundary, above).
- **`drive-machinery`** — the **build/orchestrate drivers + spec discovery**. The local backend
  composes `@storytree/drive` (`nodeBuild`/`storyBuild`/`adoptStory`/`orchestrate` + `loadLocalSecrets`,
  the same lazy-import shape `devApi.ts` uses) and `@storytree/orchestrator` (`findNodeSpecFile`/
  `loadNodeSpec`/`isStoryBuildable`/`resolveBuildConfig`). `@storytree/agent` is reached TRANSITIVELY
  through drive's `orchestrate` — the desktop never names the SDK (ADR-0004 single-import-site).
- **`library`** — the **knowledge surface + prompt render**. The local backend's library/tree reads and
  the orchestrate composition consume `@storytree/library/store` (`renderAgentPrompt(store,
  "session-orchestrator")` — the ONE loop definition, ADR-0051 — and `loadFixtureCorpus`).
- **`app-guide`** — the **chat/loop streaming CORE (the absorbed substrate, ADR-0175)**. The chat SSE
  streaming backend + the orchestrate-driven session that ship inside this desktop were
  headless-orchestrator's Phase 2 (`chat-session-stream`, `startChatStream`, ADR-0108, BUILT/green); as of
  the ADR-0175 absorb (2026-07-17) that dormant substrate is OWNED by
  [`app-guide`](../app-guide/story.md) (headless-orchestrator is retired). The desktop CONSUMES that core
  (imported as `startChatStream` from `@storytree/drive` by package name — its source sits physically in
  drive, the studio-build precedent) and MOUNTS it as a `POST /api/chat` SSE route in this story's own
  [`chat-sse-mount`](chat-sse-mount.md) capability — the thin HTTP/SSE glue the consuming surface owns.
  The mount is OWNED here; the streaming core is NOT re-owned. The desktop does NOT import
  `apps/studio/server` (the surface boundary, ADR-0100) — `startChatStream` is reached by package name,
  and `@storytree/drive` is already a declared dep, so `check:boundaries` is satisfied by the `app-guide`
  edge in `depends_on` (declared as an `artifact_edge` — the consumed core is reached through the
  @storytree/drive package import, not an app-guide package import; the ADR-0074 "declare the edge"
  pattern). The renderer chat panel (the thin client over the route) is a `studio` frontend component,
  consumed compiled — see the next bullet + "Renderer chat panel placement".
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

## UAT Test Criteria

The integrated acceptance walkthrough that proves the whole thick-local desktop meets its outcome
end-to-end. Minimal-first (one coherent journey: launch → sign in → the loop runs locally → it blooms
in the shared forest), defect-driven thereafter (each real failure earns a permanent regression case,
never speculative breadth).

> **Per-leg witness (ADR-0209 §1 / ADR-0106 / ADR-0070).** **RE-ADJUDICATED 2026-07-25** under the
> ADR-0209 §8 corpus-wide witness migration. The previous pass tagged **all eight** legs `witness:
> human` — the largest human pool in the corpus. That was conservative over-tagging, not eight
> irreducible judgment gaps: `human-witness-is-a-judgment-gap-not-cost` reserves the human rung for a
> success condition that has **no compiler**, and a success that is machine-observable but merely
> live, expensive, or NOT-YET-HARNESSED is `machine`. Re-adjudicating leg by leg resolved this story to
> six `machine` legs and five `human` legs (eleven, up from eight — see the splits below).
>
> **NARROWED AGAIN 2026-08-11 (ADR-0348 D6): the two EXPERIENCE legs are DELETED, so the story now
> carries six `machine` legs and three `human` legs (nine).** The deleted pair — *"it feels like one
> app, chat included"* (old leg 9) and *"the splash → refuse+retry window reads right"* (old leg 11) —
> asked whether this surface is any GOOD, not whether the journey achieved its goal. That is continuous
> owner feedback gathered through use, not a discrete pass/fail obligation the story must clear to be
> green, so blocking the crown on it priced a standing conversation as a gate. Their design intent is
> NOT discarded: it is carried in "Design floor" above (a). Ordinals are BURNED, not renumbered —
> positions 9 and 11 are simply absent, so every surviving leg keeps the number it has always had and
> no signed verdict or `(proof-gate:)` binding is silently re-pointed.
>
> **RE-TRIAGED 2026-08-13 (ADR-0357), so the story carried SEVEN `machine` legs and TWO `human`
> legs from that date.** *(This read "so the story NOW carries SEVEN `machine` legs"; the ADR-0294
> D2/D4 pass below then deleted leg 6, leaving SIX machine legs and the same two human ones. Corrected
> in place 2026-08-20 per ADR-0139 — the 2026-08-13 re-triage itself is unchanged.)* This paragraph
> previously ended by calling legs 3, 7 and 8 "genuine no-compiler ACCEPTANCE
> claims: a real OS-keychain round-trip, a subscription-billed real build, and the owner's own in-app
> privilege grant" — corrected in place per ADR-0139, because none of those three descriptions survives
> its own decision. Leg 3's basis was a CI statement, not a harness statement, and it is now `machine`
> bound to gate 2. "Subscription-billed" (leg 7) and "the owner's own privilege grant" (leg 8) were
> withdrawn as bases by ADR-0348 D2 and D3 respectively. Both legs nonetheless stay `human`, on the
> DIFFERENT and newly-available basis ADR-0357 D1 opened — mechanical, but outside every harness the
> spine owns — and each states that basis and what would retire it in its own prose, as ADR-0357 D2
> requires. The mechanism is the same for both and it is one line of code:
> `ensureHostedIdentity` (`apps/desktop/electron/main.ts:180`) blocks on an INTERACTIVE Google sign-in
> behind IAP, and no identity the factory holds can mint an IAP-audience token (ADR-0254 D4).
>
> **Five criteria FUSED an irreducible operator claim onto a provable one; each was SPLIT rather than
> laundered** (the honest source of the drainage — the leg count GROWS). Two of those human halves have
> since been deleted as experience:
>
> | old leg | machine half | human half |
> | --- | --- | --- |
> | 2 (credentials) | 2 — the panel/bridge surface holds no read-back and the renderer stores nothing | 3 — the REAL OS-keychain round-trip surviving a restart |
> | 6 (brokered forest) | ~~6 — the fail-closed probe + its guidance~~ (deleted 2026-08-20, ADR-0294 D2) | 8 — the owner's in-app `builder` grant opening the write path |
> | 8 (launch refusal) | 10 — git-first refusal, the never-wake fence, the DB-reason passthrough | ~~11 — the splash → refuse+retry window's appearance~~ (deleted, ADR-0348 D6) |
>
> Legs **1, 4, 5** moved wholesale `human` → `machine`: nothing in "the compiled studio renders", "the
> route returns a real envelope, not the 503 stub", or "the credential reached the backend in-process and
> the renderer never held it" turns on judgment — each is a byte-level observable. They were tagged
> human only because no harness drove them, which is precisely the mis-tag the rule above forbids.
>
> **The harness that is expected to judge the machine legs.** `apps/desktop/e2e/` drives the REAL packaged
> Electron app through Playwright's `_electron` (`pnpm --filter desktop test:e2e`), with
> `session-survival.e2e.mjs` as the worked precedent — it launches the real app, pre-writes `userData`
> state, relaunches, and asserts across the restart. Leg 1 and leg 2 sit inside that harness's EXISTING
> offline mode (`STORYTREE_DESKTOP_E2E=1`). Legs 4, 5 and 10 do **not**: that mode deliberately never
> spawns the backend sidecar and stubs every `/api/*` call, so those three need a **second, live-gated**
> spec that launches WITHOUT e2e mode — see "Open modeling calls" item 3. Plain headless Chrome is a
> FALSE PASS for all of them; only `_electron` exercises the real main process.
>
> **Nothing here is green.** Per ADR-0209 §6 a re-adjudicated leg returns to UNSTAMPED and earns green
> only under its newly-declared witness. The machine legs below are **declared, not proven** — no spec
> discharges legs 4, 5 or 10 today, and the owner signs nothing as a result of this re-adjudication. The
> story-level `uat_witness` stays absent → human (the ADR-0040 fail-closed signpost), so the
> machine-driven whole-story UAT node stays WITHHELD; the crown derives from the per-leg roll-up plus the
> operator's three remaining attestations. Legs 2, 4, 5 and 10 carry seed-canonical `uat-criterion` detail
> artifacts (ADR-0209 §5, under the owner's 2026-07-25 narrower bar: a detail ONLY where the one-line
> title is too thin to judge against, never one per leg) because their observables and their
> stub/fake boundaries cannot survive compression to a sentence.
>
> **ADR-0294 D2/D4 pass, 2026-08-20 — leg 6 is DELETED; legs 1, 2, 4, 5 and 10 are declared UNBOUND.**
> The third and final slice of the D4 pass over live stories (predecessors: PR #1444, the desktop
> terminal cluster; PR #1448, the studio/claim cluster). This story is unusually easy to adjudicate,
> because five of its six unbound legs SAY where their proof already lives and then name what they add
> on top — and under ADR-0294 D2 a partial duplicate is not a duplicate, so a named residual is what
> KEEPS a leg.
>
> **Leg 6 (the brokered-forest probe fails closed) is DELETED.** Its success clause was literally
> *"[`shared-forest-connection`](shared-forest-connection.md)'s signed verdict over its injected
> broker-POST seam"* — it pointed at the capability rather than at an observable, which is the exact
> shape ADR-0294 D2 exists to remove. That capability's declared `proof.real.testFile`,
> `apps/desktop/src/backend/forest-readiness.test.ts`, carries both of the leg's named branches and its
> never-hang clause verbatim: "forest-readiness: a 403-forbidden broker fails closed with builder-role
> guidance" (not-a-builder, with guidance), "forest-readiness: an unreachable broker fails closed with
> studio-reachability guidance" (broker down, with guidance) and "forest-readiness: a hanging broker
> fails closed within the supplied timeout" (never hangs), alongside the write client's matching
> fail-closed arms. Checked against that file's ACTUAL assertions, not its file existence (ADR-0294
> D2's honesty wall). CITATION CAVEAT: the capability's four declared contract ids (`fr-…`) appear in
> NO test title — the file names its tests "forest-readiness: …" and "write client: …" — so the
> assertions are cited directly rather than through a contract id, the same discipline PR #1444 reached
> on `repo-selection`. The proof runs on every `pnpm -r test` either way. The capability's own prose
> already recorded the discharge from its side ("this test's fail-closed assertions discharge machine
> Story UAT leg 6"), which is now re-pointed in place per ADR-0139.
>
> **The five survivors stay unbound, and each clause below names the node that covers its duplicated
> half.** Legs 2, 4, 5 and 10 each carry a real capability suite plus an explicit *"this leg adds …"*
> residual that no component test can reach (the REAL `contextBridge`, the REAL spawned sidecar, the
> REAL Electron main's wiring, the REAL launch honouring the gate). Leg 1 has no lower-tier node at all:
> [`electron-shell`](electron-shell.md) is `operator-attested` with no `proof:` block, and the
> `apps/desktop/e2e/` harness that drives the launch is declared by no capability, is not a `pnpm gate`
> step, and asserts nothing about the carries-no-source guard the leg actually turns on. **No gate is
> minted for any of the five** — answering an unbound leg with a freshly minted check is the rubber
> stamp ADR-0097 §2 forbids and the reflex ADR-0294's end state point 4 names. Gate 2 stays bound to leg
> 3, unchanged.
>
> Ordinal **6** is BURNED, not renumbered; no surviving ordinal collides with a `superseded` key for
> this story in `stories/uat-legacy-dispositions.json` (the burned set is now 6, 9, 11). Verified on the
> live store before deleting: leg 6 read `proven=–`, so no signed verdict was destroyed, and it carried
> no `(detail:)` pointer, so no `uat-criterion` artifact was orphaned.

**Goal —** A trusted member launches the native app, signs in with their Claude subscription (held in
the OS keychain), drives a real build through the local backend, and watches it reach a signed verdict
that blooms in the shared forest — the renderer never holding the credential or importing the agent, the
credential never leaving the machine.

1. **Launch — the native shell renders the COMPILED studio, no Vite, no source.** _(witness: machine)_ _(criterion-id: uatc_9e9d308422ea6863a6bcee98)_ _(revision-id: uatr1:c2880a7567541903)_ _(previous-revision-id: uatr1:4694ad452c83f892)_
   The packaged app opens; the Electron main serves the compiled studio dist over `127.0.0.1` and
   navigates the window there off its launch page, and the renderer mounts the real studio SPA.
   **Success —** in the `_electron` harness the window reaches an `http://127.0.0.1:<port>` origin with
   `document.readyState === "complete"` and the forest paints, while the loaded document references ONLY
   the built hashed `/assets/*.js` bundle — NO `/@vite/client`, no dev-server module graph, no
   `/src/**` request (ADR-0090 d.4's carries-no-source guard, observably). *(Machine, not human: "the
   studio renders" is a DOM/URL/network observable, and the existing harness already drives exactly this
   launch. Whether the result LOOKS like one coherent app is no longer a leg at all — ADR-0348 D6
   deleted that experience criterion; the intent lives in "Design floor".)*
   **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20).** No `(proof-gate:)`, and no lower-tier node
   proves it. [`electron-shell`](electron-shell.md) is `proof_mode: operator-attested` and registers no
   `proof.real.testFile`, so there is no capability test to name. The harness the leg names does drive
   the launch — `apps/desktop/e2e/harness.mjs` reaches the served `http://127.0.0.1:<port>` origin and
   evaluates `document.readyState === 'complete'` — but that is a HARNESS, not a spec: no capability
   declares `apps/desktop/e2e/**` as its `proof.real.testFile` (the one corpus reference to that
   directory is `studio`'s `map-route-retention` testGlobs, for a different claim), the suite is not a
   `pnpm gate` step, and grepping it for the carries-no-source guard the leg actually turns on —
   `/@vite/client`, a `/src/**` request, the hashed `/assets/*.js` bundle — returns nothing. So
   `resolveWitness` refuses it (`coverage: "refused"`) and no gate is minted (ADR-0097 §2). What binds
   it is a real instrument: an `_electron` spec asserting the ADR-0090 d.4 guard, plus a standing
   command that runs it.
2. **The credentials surface is one-way — nothing reads back, the renderer stores nothing.** _(criterion-id: uatc_47241898f5714f414284c9f0)_ _(revision-id: uatr1:0ba7c113921fd4f1)_ _(previous-revision-id: uatr1:0d70140121ce0e78)_
   _(witness: machine)(detail: desktop#uat-2)_ In the running Electron app the member's credential surface exposes no recovery
   path: `window.desktopAuth` offers `status`/`store`/`signOut` and NO getter, `status(kind)` resolves a
   BOOLEAN, the panel's inputs never pre-fill from a stored value, and after a store attempt no raw
   credential byte is reachable from the renderer — nothing in `localStorage`, `sessionStorage`, or any
   IPC reply. **Success —** the real preload bridge's shape and the renderer's storage are both clean,
   asserted over the real `contextBridge` (not a jsdom fake). The CI-honest component core —
   two-kind broker independence, typed IPC, operation-bridge lifetime, and the panel's one-way store /
   feature gate — is `credential-broker`'s contracts 1–9; this leg adds the integrated claim that the
   REAL bridge exposes no read-back.
   **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20), and it is a PARTIAL duplicate that is therefore
   KEPT.** The component core IS proven one rung down by
   [`credential-broker`](credential-broker.md) at `apps/studio/src/components/CredentialsPanel.test.tsx`
   — the leg names those nine contracts itself — but the sentence beginning *"this leg adds"* is the
   whole of the residual: the REAL `contextBridge` exposing no getter, and the renderer's real storage
   being clean after a store attempt, are not what a jsdom component test can observe. A partial
   duplicate is not a duplicate (ADR-0294 D2), so the leg stands; `resolveWitness` refuses it
   (`coverage: "refused"`), and no gate is minted (ADR-0097 §2) — binding it to the panel suite would
   sign the covered half and silently claim the half the leg exists to add.
3. **A credential survives a real restart in the OS keychain, then removes cleanly.** _(witness: machine)_ _(proof-gate: desktop#gate-2)_ _(criterion-id: uatc_f017c21eae754d091713d18f)_ _(revision-id: uatr1:02a892cce2db6189)_ _(previous-revision-id: uatr1:a8bb3332f308b058)_
   On a real desktop app the operator stores each kind independently (Claude subscription `oauth`,
   Anthropic `api-key`), REPLACES one, quits and relaunches, confirms the replacement is still held, and
   removes it through Sign out/Remove leaving no plaintext on disk. **Success —** the real OS-keychain
   round-trip observed end to end across a genuine process restart. *(FLIPPED `human` → `machine`
   2026-08-13 under ADR-0348 D1, by the source-reading triage ADR-0357 mandates. The old note said the
   round-trip runs against a real OS keychain "which a headless runner has no equivalent of" — that is a
   CI statement, not a harness statement, and ADR-0348's census already listed this leg as
   LEGACY-INERTIA for exactly that reason. The harness this leg is judged by does not run on a headless
   runner: `apps/desktop/e2e/` launches the REAL packaged app on a real machine whose OS keychain is
   real. Two facts settle it from code. `electron/main.ts:131` constructs the broker over
   `NapiKeychain` UNCONDITIONALLY — there is no `STORYTREE_DESKTOP_E2E` swap and no in-memory fallback
   on that path — so an `_electron` launch already reads and writes the real Windows Credential Manager
   through `@napi-rs/keyring`; and a "quits and relaunches" is `electron.launch()` twice, where
   `session-survival.e2e.mjs` calls it once and closes cleanly in its `finally`. *(Stated precisely,
   because ADR-0357's own Consequences said the `_electron` suite "already relaunches across a restart"
   and it does not — that spec does a renderer `win.reload()` and a SPA route change within ONE launched
   process. The conclusion is unaffected: nothing stops a spec launching twice, and the harness's
   `userData` handling is already written for exactly that kind of cross-launch assertion.)*
   **A note for whoever drives it, because it is the
   journey and not a defect:** the walk's own last step REMOVES the stored credentials, and
   `main.ts:131` takes the default `storytree-desktop` service namespace, so a drive ends with the
   operator's real desktop credentials cleared and needing re-entry. That is what the authored journey
   asks for; it is the same end state the operator reaches performing it by hand.)*
4. **The local backend is live (no 503).** _(witness: machine)(detail: desktop#uat-4)_ With the desktop main process running _(criterion-id: uatc_c41cb0d4c1bf3a45c39312a6)_ _(revision-id: uatr1:88f5c3bb4158daee)_ _(previous-revision-id: uatr1:057291595a474651)_
   for real — the sidecar spawned, NOT the harness's e2e mode — a `GET /api/*` read route
   (`tree`/`docs`/`activity`) returns a real envelope body. **Success —** the response is the composed
   organism drivers' envelope and NOT `static-server.ts`'s `503 {"error":"no backend in the desktop
   shell …"}` fallback. *(Machine, not human: a 503 stub versus a real envelope is a byte comparison with
   no judgment in it. It is live-gated — the sidecar's fail-closed boot needs a git checkout and a
   reachable store — which makes it expensive, not irreducible.)*
   **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20), and it is a PARTIAL duplicate that is therefore
   KEPT.** The envelope-not-503 comparison IS proven one rung down by
   [`local-backend-boot`](local-backend-boot.md) at `apps/desktop/src/backend/local-backend.test.ts` —
   "local-backend: GET /api/health returns a real { store, db } envelope — not a 503", "GET /api/tree
   returns { stories: [] } from real discovery over empty dir", "GET /api/activity returns the
   in-flight-build overlay { builds } from the seam" — and the sibling read routes by
   [`boot-read-routes`](boot-read-routes.md) at `apps/desktop/src/backend/boot-read-routes.test.ts`.
   What neither reaches is this leg's own precondition: *"with the desktop main process running for
   real — the sidecar SPAWNED, not the harness's e2e mode"*. Both suites compose the drivers in-process;
   nothing observes the real spawn. A partial duplicate is not a duplicate (ADR-0294 D2), so the leg
   stands; `resolveWitness` refuses it (`coverage: "refused"`), and no gate is minted (ADR-0097 §2).
5. **The credential reaches the in-process backend; the renderer never holds the raw token.** _(criterion-id: uatc_eb82eaac877cccb9a9beea4f)_ _(revision-id: uatr1:d430d0b031982283)_ _(previous-revision-id: uatr1:92c090fcf68e68ce)_
   _(witness: machine)(detail: desktop#uat-5)_ A build/orchestrate driver invocation in the running local backend receives the
   brokered credential in-process — no TLS hop — while no `/api/*` response body and no
   renderer-reachable surface ever carries that value. **Success —** with a FAKE credential held for the
   run, the driver invocation observes it and every renderer-visible byte stream does not.
   (`local-credential-wiring`'s contract test asserts the same hand-off + isolation at the component
   boundary; this leg adds that the real Electron main actually wired it.) *(Machine, not human: "the
   token appears in this byte stream" is decidable, and a FAKE credential means no spend and no live
   studio.)*
   **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20), and it is a PARTIAL duplicate that is therefore
   KEPT.** The hand-off and the isolation ARE proven one rung down by
   [`local-credential-wiring`](local-credential-wiring.md) at
   `apps/desktop/src/backend/credential-bridge.test.ts` — the leg's own parenthesis says exactly that —
   and the clause immediately after it, *"this leg adds that the real Electron main actually wired
   it"*, is the residual a component test cannot reach. A partial duplicate is not a duplicate
   (ADR-0294 D2), so the leg stands; `resolveWitness` refuses it (`coverage: "refused"`), and no gate is
   minted (ADR-0097 §2).
7. **A real build reaches a signed verdict locally and blooms in the shared forest VIA THE BROKER.** _(criterion-id: uatc_da3559fd2874e2df93362733)_ _(revision-id: uatr1:61042eb66b4e4a06)_ _(previous-revision-id: uatr1:1903082aec93aac0)_
   _(witness: human)_
   _(witness-basis: the brokered POST is gated on ensureHostedIdentity at
   apps/desktop/electron/main.ts:180, which opens a BrowserWindow and polls until an INTERACTIVE
   Google sign-in completes behind IAP. No harness can supply that credential: IAP wants an OIDC
   token audienced to its own OAuth client, and ADR-0254 D4 retired the last non-human identity the
   factory held. Retires the day a harness can mint an IAP-audience token — the costed options and
   the OIDC-issuer probe live on remote-session-access-arc.)_ The member triggers a build from the UI; the local backend drives the real `story
   build --real` (or a node `--live` smoke) on their machine — a real checkout + git + pnpm + worktrees —
   the spine observes RED then GREEN from real exit codes and SIGNS LOCALLY, then the local backend **POSTs
   the signed verdict to the studio's write-broker** (ADR-0117), the SERVER persists it to the SHARED
   `events.verdict`, and the build blooms in the forest the owner watches. **Success —** a signed verdict
   from a real local build, brokered to the shared forest under the friend's `builder` role (no DB identity
   on his machine), the agent having signed nothing itself and the broker having re-signed nothing
   (ADR-0091) — and CI later re-proves it independently. *(HUMAN on **ADR-0357 D1's second basis** —
   the success condition is mechanical, but sits outside every harness the proof spine owns. The old
   note rested on SPEND and OUTWARD-FACING; ADR-0348 D2/D3 withdrew both and neither is restated here.
   **(a) The mechanism, named rather than asserted.** The brokered leg is gated on
   `ensureHostedIdentity` (`apps/desktop/electron/main.ts:180`): before any `/api/write-broker` POST the
   main process opens a `BrowserWindow` on the hosted studio and POLLS `/api/me` until an INTERACTIVE
   Google sign-in completes behind IAP, failing after 120 s or when the window is closed. No harness can
   supply that credential — IAP wants an OIDC token audienced to its own OAuth client, and ADR-0254 D4
   retired the only non-human identity the factory held (measured 2026-08-04: unauthenticated → `302`
   to Google sign-in; a `gcloud auth print-identity-token` bearer → `401 Invalid JWT audience`; both
   stamped `x-goog-iap-generated-response`, i.e. refused at the edge with the app never reached). The
   one non-interactive path that exists is a session cookie already sitting in the app's `userData`,
   which a human established by signing in — the human IS the credential. Repointing
   `STORYTREE_STUDIO_URL` at a local `studio serve` would drive a DIFFERENT broker than the one this leg
   names ("the forest the owner watches"), so it would witness this leg only by weakening it.
   **(b) What retires it.** A non-interactive IAP credential the factory can hold; the four costed
   options and the OIDC-issuer probe that is step one live on `remote-session-access-arc`. The day a
   harness can mint an IAP-audience token this leg is `machine` and binds a model-driven gate like any
   other — nothing else in it is a judgment call.)*
8. **The owner's in-app `builder` grant opens the brokered write path.** _(witness: human)_
   _(witness-basis: both ends sit behind IAP — the grant is performed as an ADMIN in the HOSTED
   studio's Members panel, and the write path it opens is then exercised through ensureHostedIdentity
   at apps/desktop/electron/main.ts:180, an interactive Google sign-in inside an Electron
   BrowserWindow. No identity the factory holds can mint an IAP-audience OIDC token since ADR-0254 D4,
   and a locally-identified studio serve would witness a DIFFERENT claim rather than this one. Retires
   with the same IAP-credential fork as leg 7, on remote-session-access-arc; the role predicate itself
   is already compiled by writeBroker.test.ts.)_ After the _(criterion-id: uatc_1207e89e3a5adfdc8c21359f)_ _(revision-id: uatr1:e3225ae8f5169a2d)_ _(previous-revision-id: uatr1:d6b0fa603e751678)_
   owner marks the member a **builder** in the live Members panel (an in-app grant — no `gcloud`, no
   Cloud SQL IAM grant; ADR-0117 d.2), the member's brokered write path connects against the real hosted
   broker. **Success —** the owner's attestation that the grant they performed authorized the write.
   *(HUMAN on **ADR-0357 D1's second basis**. ADR-0348 D3 names "grants an in-app privilege" as
   explicitly NOT a basis for a human witness, so the old note's privileged-action argument is withdrawn
   and is not restated. **(a) The mechanism** is the one leg 7 names, and here it binds at BOTH ends:
   the grant is performed in the Members panel of the HOSTED studio (Cloud Run behind direct IAP — no
   load balancer, no domain) as an ADMIN, and the write path it opens is then exercised through
   `ensureHostedIdentity` (`apps/desktop/electron/main.ts:180`), an interactive Google sign-in inside an
   Electron `BrowserWindow`. Neither end is reachable without an OIDC token audienced to IAP's own OAuth
   client, which no identity the factory holds can mint since ADR-0254 D4 retired `storytree-remote-dev`
   (measured 2026-08-04: `302` unauthenticated, `401 Invalid JWT audience` with a gcloud identity
   token). A local `studio serve` under `STORYTREE_STUDIO_DEV_IDENTITY` can host both surfaces — which
   is precisely why it does not witness this leg: the claim is about the HOSTED grant, and a
   locally-identified studio proves a different one. **(b) What retires it:** the same IAP-credential
   fork as leg 7 (`remote-session-access-arc`). The leg is otherwise mechanical — `writeBroker.test.ts`
   already compiles the `mayBrokerWrite` role predicate over admin/builder/member — so it flips to
   `machine` the day a harness can authenticate as a member.)*
10. **Launch refuses cleanly when a precondition is unmet — no half-wired shell (ADR-0176).** _(criterion-id: uatc_ed15427cfebc9e03b298775e)_ _(revision-id: uatr1:d4a292539af93266)_ _(previous-revision-id: uatr1:bda598cbcb4d97cd)_
    _(witness: machine)(detail: desktop#uat-10)_ Before the sidecar wires any backend, the launch-precondition gate runs: with no
    git checkout it refuses IMMEDIATELY naming the unmet precondition and NEVER wakes the DB; with a
    checkout it reuses `ensureLiveDb` to probe and bounded-auto-wake the live store, proceeding to the ONE
    fully-wired backend only when both hold, else refusing with the DB reason surfaced UNCHANGED.
    **Success —** the sidecar either wires the single full backend or refuses naming the reason, and it
    NEVER serves the retired degraded read shell (`serveDegraded` / `degradedBackend` deleted), so the
    *"UAT test criteria unavailable: unknown endpoint"* half-wired-forest failure cannot recur.
    (`desktop-launch-preconditions`'s contract test proves the same three branches over injected git/DB
    doubles; this leg adds that the real Electron launch honours them — including the never-wake fence,
    observable as the absence of any store-wake call on the no-git path.) *(Machine, not human: "it
    refused, naming this precondition, without waking the DB" is a decidable observable; the window's
    APPEARANCE while doing so is carried by no leg — ADR-0348 D6 deleted that experience criterion and
    "Design floor" (b) records the intent.)* *(This is the defect-driven regression case ADR-0176 was
    root-caused from — the Story UAT grows by appending a permanent case per real failure, never
    speculative breadth.)*
    **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20), and it is a PARTIAL duplicate that is therefore
    KEPT.** All three branches ARE proven one rung down by
    [`desktop-launch-preconditions`](desktop-launch-preconditions.md) at
    `apps/desktop/src/backend/launch-preconditions.test.ts` — "ensureLaunchPreconditions: no git
    checkout refuses immediately and NEVER calls ensureDb" (including the never-wake fence), "git
    present + db reachable (no cold start) resolves ok with startedDb=false", "git present + db had to
    cold-start resolves ok with startedDb=true", "git present + db unreachable carries the drive refusal
    reason through unchanged", plus the two `describeLaunchRefusal` copy assertions. What that suite
    never reaches is the clause the leg names as its own addition: *"this leg adds that the real
    Electron launch honours them"*, over injected doubles rather than the real sidecar. A partial
    duplicate is not a duplicate (ADR-0294 D2), so the leg stands; `resolveWitness` refuses it
    (`coverage: "refused"`), and no gate is minted (ADR-0097 §2).
End state — a trusted member ran the whole storytree loop on their own machine through a native app,
their credential held in the OS keychain and never leaving the machine, their builds signed locally from
real exit codes and BROKERED to the shared forest (POSTed to the studio's members-gated write-broker under
their in-app `builder` role, no DB identity on their machine; ADR-0117), the renderer never crossing the
agent boundary — the launch, the one-way credential surface, the live backend, the in-process credential
hand-off and the clean launch refusal all machine-witnessed at the story tier (the fail-closed broker
probe is witnessed one rung down, by [`shared-forest-connection`](shared-forest-connection.md); the story
leg that restated it was deleted 2026-08-20 by the ADR-0294 D2/D4 pass), and only the
real keychain round-trip, the billed build and the owner's `builder` grant attested by the operator. How
the result LOOKS and FEELS is no longer an acceptance obligation here (ADR-0348 D6) — that intent is
recorded in "Design floor" and answered by the owner using the app.

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
`## UAT Test Criteria` above (the integrated, operator-attested acceptance journey): it is the author's
**expandable reliability floor** — it starts by adopting the
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
   The real `@napi-rs/keyring` OS-keychain round-trip through the panel is NOT observed here — it is
   Story UAT leg 3, which since 2026-08-13 is `machine` and carries its OWN gate below (gate 2). *(This
   clause read "it is the operator-attested leg (ADR-0070 / ADR-0179 §5, Story UAT leg 3), which an
   agent can never self-attest"; corrected in place per ADR-0139 when ADR-0348 D1's triage flipped that
   leg. What stays true is the SCOPE statement: this gate does not observe the real keychain.)*

**Gate 2 is NEW (2026-08-13, ADR-0348 D1 / ADR-0357) and was APPENDED — gate 1 kept its ordinal.** Gate
ids are positional (`asset:edit-story-uat-criteria` step 2), so inserting or renumbering would silently
re-point already-signed verdicts and surviving `(proof-gate:)` bindings. It carries no `(covers:)`: it
proves a JOURNEY, not a capability, and adding it to a `(covers:)` list would let an observe-and-sign
`adopt` pass green a capability that never went red (ADR-0085 / ADR-0097). It neither drives nor spends
— the drive is deliberately out-of-band (`uat-drive.run.ts`, ADR-0010 §5) and this gate is the cheap
standing WITNESS of the record that drive persists, so the spine still mints the verdict over an exit
code IT watched and ADR-0295 D2 holds unchanged. It goes red — honestly — when no `pass` record exists
for the criterion's CURRENT `revision-id`, when the driven commit is not in HEAD's ancestry, or when
the newest record is older than 90 days (the ADR-0016 ageing floor).

2. **UAT leg 3 — "a credential survives a real restart in the OS keychain, then removes cleanly" was driven end to end** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts desktop uatc_f017c21eae754d091713d18f`.
   Witnesses that a model launched the REAL packaged app, stored both credential kinds through the
   Credentials panel into the real OS keychain (`electron/main.ts:131` constructs the broker over
   `NapiKeychain` unconditionally — there is no E2E swap), replaced one, QUIT AND RELAUNCHED the app,
   confirmed the replacement was still held, and removed it leaving no plaintext on disk.

Adopting gate 1 greens ONLY `credential-broker` — its DERIVED crown, via the `(covers:)` above. It
does NOT green the story and does NOT touch the authored `status:` (which stays `proposed`): the desktop
crown still awaits its OTHER capabilities and all EIGHT surviving Story UAT legs, in the two kinds the
2026-08-13 ADR-0357 triage resolved them into: **six machine legs** awaiting signed verdicts (the
compiled-studio launch, the one-way credential surface, the real OS-keychain round-trip, the
Electron-main backend boot, the in-process credential hand-off, and the
clean launch refusal) and **two human legs** (the subscription-billed brokered build, and the in-app
`builder` grant) — both of the latter on ADR-0357 D1's second basis, the interactive IAP sign-in
`ensureHostedIdentity` performs, and neither an agent can authenticate as. *(This paragraph said
ELEVEN legs, six machine and five operator-attested — the 2026-07-25 counts. ADR-0348 D6 deleted the
one-app-feel and refuse+retry-window legs, and ADR-0348 D1's triage flipped the keychain round-trip;
corrected in place per ADR-0139. It then said NINE legs, seven machine — corrected again 2026-08-20 for
the same reason: the ADR-0294 D2/D4 pass deleted the fail-closed-broker-probe leg as a restatement of
`shared-forest-connection`'s own assertions.)* `healthy` stays non-authorable
([ADR-0020](../../docs/decisions/0020-red-green-enforcement-on-the-owned-loop.md)) — the authored
`status:` is never `healthy`; the world's crown DERIVES green from the signed verdict
([ADR-0040](../../docs/decisions/0040-verdict-derived-green-and-the-human-witness-signpost.md)), and only
when every capability is `healthy` AND every own-proof obligation is signed. This gate adds ONE honest
signed verdict toward that roll-up; it is not the crown.

## Proof

The story is proven when the nine legs above pass under their **re-adjudicated** witnesses (2026-07-25,
ADR-0209 §8; narrowed 2026-08-11 by ADR-0348 D6, which deleted the two EXPERIENCE legs that stood at
positions 9 and 11 — the ordinals are burned, not reused; and re-triaged 2026-08-13 under ADR-0357,
which flipped leg 3): seven machine legs (1, 2, 3, 4, 5, 6, 10) green under a signed verdict, and two
legs (7, 8) human on ADR-0357 D1's second basis. Leg 6 is discharged by
[`shared-forest-connection`](shared-forest-connection.md)'s own signed verdict over its injected seam;
legs 1 and 2 by the EXISTING offline `_electron` harness; leg 3 by the model-driven UAT gate 2 above;
legs 4, 5 and 10 by a live-gated `_electron`
spec that does **not** yet exist (open modeling call 3). The deterministic credential-broker,
local-backend, credential-bridge, forest-readiness, and launch-precondition suites remain supporting
component evidence — they prove the same logic over doubles, which is why the integrated legs stay
distinct obligations rather than being folded into the caps. Per ADR-0020, `healthy` is only ever
DERIVED from signed verdicts; nothing here is authored healthy. The three thick-client capabilities are
proof-wired (each carries a `proof:` block with a `real:` arm — a NET-NEW red→green) so the spine can
drive their offline suites red→green under its own gate; the story's machine-driven UAT node is WITHHELD
(its `uat_witness` is absent → human, ADR-0040), so driving those capabilities to signed verdicts is
what makes the thick-client layer buildable, and the crown additionally awaits the seven machine legs'
verdicts and the operator's two attestations.

**The machine legs are a build obligation, not a claim of existing coverage.** Per ADR-0209 §6 this
re-adjudication returned EVERY leg to UNSTAMPED: the seven machine legs declare the witness kind that is
RIGHT for them, and five of them (1, 3, 4, 5, 10) have no spec discharging them at HEAD — leg 3's gate 2
is BOUND but goes red until the out-of-band drive that produces its record has run. They are newly
eligible to BE proven, not proven. The specs live in `apps/desktop/e2e/**` — OUTSIDE the story-author's
`stories/**` fence — so they are flagged under "Open modeling calls" to land with whoever builds them.

## Open modeling calls (for the owner)

One GENUINELY OPEN fork at the story-shape level (recorded below, escalated — not pre-decided), plus two
decided-and-surfaced items and one item surfaced by the 2026-07-25 witness re-adjudication (3 below —
the specs that discharge the reclassified machine legs). ADR-0113 settled the desktop's overall shape (thick-local, the inner-circle
premise, the shared forest, minimal packaging); the local-backend boundary call (re-compose the organism
drivers vs import the studio server) is a **dependency-graph/layout decision the story-author owns** (owner
correction 2026-06-26) and is DECIDED above (re-compose), not escalated.

### 3. The `_electron` specs that discharge machine legs 1, 4, 5 and 10 (REQUIRED, outside `stories/**`)

The 2026-07-25 ADR-0209 §8 re-adjudication reclassified these legs from `human` to `machine`. **No spec
discharges them at HEAD** — recorded here as an obligation, never claimed as coverage. Two distinct
harness shapes are needed, and the split matters:

- **Leg 1 (and leg 2) fit the EXISTING offline harness.** A new spec under `apps/desktop/e2e/` following
  `session-survival.e2e.mjs` runs in `STORYTREE_DESKTOP_E2E=1` mode: leg 1 asserts the
  `http://127.0.0.1:<port>` origin plus a script-tag/network sweep showing only hashed `/assets/*.js` and
  no `/@vite/client`; leg 2 asserts the real `window.desktopAuth` surface (three methods, no getter, a
  boolean `status`) and a clean `localStorage`/`sessionStorage`. Leg 2 must NOT drive a store of a real
  secret — `NapiKeychain.set` has no offline fallback, and THIS spec is the one shape that also runs on
  a headless CI runner with no keychain at all. Reading `status(kind)` IS safe (the adapter's `get`
  normalises a missing/unavailable entry to `null`). *(This bullet ended "which is exactly why the
  round-trip stayed human as leg 3"; corrected in place per ADR-0139 on 2026-08-13, when ADR-0348 D1's
  triage flipped leg 3 to `machine`. The constraint on leg 2 is unchanged and is about THIS spec's
  headless-CI shape — leg 3's round-trip is driven on a real machine, out-of-band under gate 2, and
  never on a CI runner.)*
- **Legs 4, 5 and 10 need a SECOND, LIVE-GATED spec that launches WITHOUT e2e mode.** `STORYTREE_DESKTOP_E2E=1`
  deliberately never spawns the sidecar and the harness stubs every `/api/*` call
  (`electron/main.ts` L450, `harness.mjs`), so the existing mode structurally cannot observe a real
  envelope, a real credential hand-off, or the real launch-precondition gate. A live-gated spec must let
  the sidecar boot for real (git checkout + reachable store; the `live-store test traps` skip-when-offline
  pattern keeps CI honest), inject a FAKE credential for leg 5 rather than a real one, and drive leg 10's
  no-git branch — where the observable includes the ABSENCE of a store-wake call, so the spec needs a
  seam or log to witness the never-wake fence, not just the refusal text. **Whether that seam already
  exists is an implementation question for the builder, not a story-shape call** — but if the fence turns
  out to be unobservable from outside the sidecar, leg 10's machine tag should be revisited rather than
  discharged loosely.

These are `apps/desktop/**` edits — outside the story-author's fence — flagged so they land with the legs
they prove. Until they land, legs 1, 4, 5 and 10 are honestly UNSTAMPED: declared machine, not yet
machine-proven.

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

1. **The chat surface's STREAMING CORE is consumed from `app-guide` (the ADR-0175 absorb; formerly
   `headless-orchestrator`); its desktop-side MOUNT is a desktop capability; its renderer PANEL is a
   `studio` component (decided — the cap-vs-glue + panel-placement call, the story-author's layout
   domain).** Three layers, three homes:
   - The provable streaming **backend** (`startChatStream` driving `orchestrate`) was
     headless-orchestrator's Phase 2 (`chat-session-stream`, ADR-0108, green) and is now OWNED by
     [`app-guide`](../app-guide/story.md) (ADR-0175 absorb — headless-orchestrator retired) — CONSUMED, not
     re-owned.
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
     see chat-panel.md "No new cross-story edge"). Its *appearance inside the native shell* was carried
     by this story's operator-attested UAT leg 9 until ADR-0348 D6 DELETED that leg as an experience
     rather than an acceptance claim; the look is now design intent ("Design floor" (a)), answered by
     the owner using the app, and is still never a machine visual verdict — the panel author signs no
     visual verdict either way. The panel is owned by `studio` — deliberately
     NOT a desktop capability (slow growth: the desktop's net-new is the mount; the panel rides studio's
     frontend discipline).
   - The **sidecar wiring** that chains `createChatSseMount` as a third dispatcher in
     `apps/desktop/electron/backend-entry.ts` (alongside `createBootReadRoutes` + `createLocalBackend`)
     is **operator-attested GLUE, NOT a capability** (story-author 2026-06-27 — the same call the
     splitting-rule already made for boot-read-routes' and local-backend's wiring). The dispatcher is the
     provable cap (`chat-sse-mount`, green); `electron/` is the operator-attested binding the
     CI-provable core is deliberately electron-free of ("THE CI-PROVABLE CORE IS ELECTRON-FREE",
     chat-sse-mount.md). There is no isolatable red→green seam in chaining a third already-proven
     dispatcher into the Electron main — it is witnessed by the owner in use, not asserted in CI.
     *(Until 2026-08-11 that witness was UAT leg 9; ADR-0348 D6 deleted the leg, so this glue is
     operator-attested in the ADR-0158 sense — un-asserted connective code — with no story UAT leg
     recording the sign-off. Whether glue that named a now-deleted experience leg as its only witness
     needs a different vehicle is a real question this deletion surfaces and does not answer.)* The
     **mount-deps extension** (forwarding `startChatStream`'s live `runner`/`model`/etc. so the live chat
     actually ORIENTS) is **also operator-attested glue, not an offline-provable contract** — the
     `OrientationRunner` is reachable ONLY via a real SDK tool-dispatch, which a scripted `queryFn` never
     triggers, so a forwarded sentinel runner has no offline observable (full reasoning in chat-sse-mount.md
     "The deferred mount-deps extension is GLUE"). The orchestrator executes both as operator-attested
     glue.
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
3. **Two modules stay at STORY grain as one-competence residue — deliberately NOT capabilities**
   (story-author 2026-08-07, capability-layer-coverage-arc increment 2). Both are pure single-purpose
   functions whose only honest proof is a handful of ISOLATED unit tests with no collaborators at all —
   contract-shaped, not organ-shaped. Neither can state a capability-tier proof (an integration test
   against real in-story collaborators), and `a capability that cannot state its proof must not be
   authored`: authoring one anyway would drive a declaration count down while leaving an unprovable node
   behind, which is invisible afterwards. Recorded here so the decision is legible rather than an
   unexplained gap. The `doctrine.ts` precedent from that arc's increment 1.
   - **`apps/desktop/src/backend/orchestrator-turns.ts`** (35 ln, ADR-0151) — one pure function
     resolving the desktop chat's orchestrator-session turn ceiling from
     `STORYTREE_ORCHESTRATOR_MAX_TURNS` (unbounded by default, an env-only re-imposed cap), proven by 4
     isolated unit tests. Its only plausible host is [`chat-sse-mount`](chat-sse-mount.md), which
     EXPLICITLY excludes this seam from its contract in a `story-author 2026-06-27` decision block: the
     landed `ChatSseMountDeps` does not forward `maxTurns`, and extending it is "operator-attested glue,
     NOT an offline-provable contract". The module's own header agrees — the `backend-entry.ts` glue
     that reads `process.env` and threads the result into `createChatSseMount` is attested, because a
     `node:test` over it would spawn a subscription-billed SDK session. Confirmed, not overturned.
   - **`apps/desktop/src/backend/open-link-policy.ts`** (37 ln) — the scheme allowlist applied in the
     Electron main immediately before `shell.openExternal`, proven by 3 isolated unit tests over a pure
     predicate. **It stays with `desktop`, and this OVERTURNS the reading that its honest owner is the
     `embedded-terminal` story.** It ORIGINATED in that story's patterns survey (increment D) and its
     header still frames it as terminal-scoped, but at HEAD only ONE of its three call sites is:
     `main.ts:748` (`terminal:open-link`). The other two — `main.ts:502` (`will-navigate`) and `:508`
     (`setWindowOpenHandler`) — are the **top-frame navigation lockdown for the whole Electron window**,
     ADR-0109 §Decision 4 hardening that exists to stop a hostile navigation inheriting the
     `desktopApply` / `desktopAuth` / `desktopTerminal` preload bridges. That is a `desktop` shell
     concern, and `embedded-terminal` is a virtual story that draws no edge to the shell and states it
     "builds a terminal, not an observer". Re-homing it there would put the shell's navigation lockdown
     under a story that disclaims the shell. Folding it into [`electron-shell`](electron-shell.md) is
     also refused: that capability is `operator-attested`, and hiding a headlessly-provable predicate
     behind a human witness is exactly the mis-tag `human-witness-is-a-judgment-gap-not-cost` forbids.
     Folding it into `embedded-terminal`'s [`pty-session-manager`](../embedded-terminal/pty-session-manager.md)
     is refused too — that unit is BUILT & SIGNED with a `real:` arm, the fused outcome would need a
     conjunction, and the two share neither precondition (an injected `PtyPort` and a live session
     registry, versus a string) nor observable.

The only **owner-level** item is operational, not modeling, and ADR-0117 SIMPLIFIED it: it is no longer
an attended Cloud SQL IAM `gcloud` grant but an **in-app `builder` mark in the Members panel** (ADR-0117
d.2 — the friend holds no DB identity; the server is the single DB authority). A privileged action the
human performs, now fully in-app, surfaced in `shared-forest-connection` and UAT leg 8 (the grant leg the
2026-07-25 re-adjudication split out of old leg 6; that split's other half stood as machine leg 6 until
the ADR-0294 D2/D4 pass deleted it on 2026-08-20 — it restated `shared-forest-connection`'s own
fail-closed assertions — so the capability is now the single home of that claim). *(A third item is
RECORDED as decided-and-surfaced, forced by ADR-0117, reversible, internal — not re-litigated:* **the
friend's forest writes are brokered to studio-cloud's `write-broker`, not direct** *— the local backend
opens no DB connection. The cross-story edge desktop → studio-cloud is a runtime HTTP edge, declared in
`depends_on`; the broker endpoint itself is `studio-cloud`'s capability, not re-owned here.)*
