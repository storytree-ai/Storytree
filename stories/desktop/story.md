---
id: "desktop"
tier: story
title: "Desktop client — a trusted member runs the whole storytree loop on their own machine, credential in the OS keychain"
outcome: "A trusted inner-circle member launches a native desktop app that runs the real storytree loop locally — the studio UI over a backend booted in the Electron main process — signs in with their Claude credential held in the OS keychain, and their builds bloom in the shared forest, with the renderer never importing the agent and the credential never leaving their machine."
status: proposed
proof_mode: UAT
# Capabilities, roots-first. The first two are ADR-0109 Step 1 (the credential-host shell, BUILT/
# operator-attested); the next three are the ADR-0113 thick-client step (the local backend, the
# in-process credential wiring, the shared-forest connection). The chat surface that ships INSIDE
# this desktop is NOT a desktop capability — it is headless-orchestrator's Phase 2 (ADR-0108),
# CONSUMED here (see depends_on + the Cross-story boundary section).
capabilities: [credential-broker, electron-shell, local-backend-boot, local-credential-wiring, shared-forest-connection]
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
#   - headless-orchestrator — the chat/loop runtime that ships INSIDE this desktop is its Phase 2
#                       (ADR-0108): the SSE route + the orchestrate-driven session. The desktop CONSUMES
#                       it (the renderer chat panel is a thin client over it, ADR-0108 d.1); it is NOT a
#                       desktop capability.
depends_on: [studio, drive-machinery, library, headless-orchestrator]
# Deciding ADRs (ADR-0037 §2): 0109 sanctions the credential-host Electron client; 0111 fixes Step 1's
# placement (apps/desktop + this story); 0113 redefines Step 2 as booting the worker LOCALLY (the thick
# client) and amends ADR-0090 d.4 for the trusted inner-circle phase; 0090 the client/worker split +
# d.4 source guard (amended); 0091 the proof-off-tether sanction the local backend rides; 0004 the
# orchestrator/agent boundary preserved by topology (main IS the boundary); 0108 the chat surface that
# ships here; 0021 the member's keyless Cloud SQL IAM grant; 0070 the operator-attested appearance.
decisions: [109, 111, 113, 90, 91, 4, 108, 21, 70]
---

# Desktop client — a trusted member runs the whole storytree loop on their own machine

**Outcome —** A trusted inner-circle member launches a native desktop app that runs the real storytree
loop locally — the studio UI over a backend booted in the Electron **main** process — signs in with
their Claude credential held in the OS keychain, and their builds bloom in the **shared forest**, with
the renderer never importing the agent and the credential never leaving their machine.

This story has **two layers, decided by two ADRs**:

1. **The credential-host shell (ADR-0109 Step 1, BUILT).** An Electron shell that loads the compiled
   studio bundle and keeps the member's Claude credential in the **OS keychain** — never in the browser,
   never in plaintext on disk. Its provable core (the broker's keychain round-trip, dual-credential, and
   no-leak boundary through an injected `KeychainPort`) is green in CI; the real-OS-keychain round-trip
   + the native shell's appearance are operator-attested (ADR-0070). This is the
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
- **Shared Cloud SQL, one living forest (ADR-0017 / ADR-0023).** The member's builds, verdicts, and
  presence write to the SHARED Cloud SQL Postgres, so his work blooms in the same forest the owner
  watches. This requires granting his Google identity Cloud SQL IAM access (ADR-0021 keyless) — an
  **attended privileged action performed at delivery**, not a local-store fork (a per-member local store
  is explicitly NOT chosen; it would fragment the shared forest).
- **Minimal packaging for v1 (ADR-0109's "minimal first").** The trusted member runs a dev-mode desktop
  build with the toolchain present (Node / pnpm / git). Code-signing, notarization, and auto-update stay
  deferred (revisited when the circle widens past hands-on devs).
- **The boundary gate sanctions the new edge (ADR-0074 / ADR-0113 §8).** `check:boundaries` must record
  the desktop → drive-machinery (and the studio/library) edges as sanctioned organism dependencies for
  the desktop surface — the `depends_on` above declares them. Adding the `@storytree/*` deps to
  `apps/desktop/package.json` WITHOUT these declared edges fails the gate; the edge is legitimate by
  ADR-0113, so the gate is satisfied by declaring it, never worked around.

## Local-backend boundary call (decided here — the dependency-graph/layout call is the story-author's, not the owner's)

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

## Capabilities (5)

Listed roots-first (a capability appears after everything it depends on).

| # | capability | outcome | proof | depends on |
|---|------------|---------|-------|------------|
| 1 | [`credential-broker`](credential-broker.md) | The member's Claude credential round-trips the OS keychain through a narrow port and is never written to localStorage or to plaintext disk. | contract-test (CI red→green) | — |
| 2 | [`electron-shell`](electron-shell.md) | The desktop shell loads the compiled studio bundle and wires the real OS-keychain adapter to the credential broker behind a sign-in affordance. | operator-attested (ADR-0070) | `credential-broker` |
| 3 | [`local-backend-boot`](local-backend-boot.md) | The Electron main process composes a local studio backend from the organism drivers and serves it on `127.0.0.1` `/api/*`, replacing the `static-server.ts` 503 stub. | contract-test (CI red→green) | — |
| 4 | [`local-credential-wiring`](local-credential-wiring.md) | The keychain-brokered credential is fed to the in-process local backend's build/orchestrate drivers (no TLS hop), and the renderer never receives the raw token. | contract-test (CI red→green) | `credential-broker`, `local-backend-boot` |
| 5 | [`shared-forest-connection`](shared-forest-connection.md) | The local backend's verdict/presence writes reach the SHARED Cloud SQL, with a readiness probe that fails closed (and clear guidance) when the member lacks the IAM grant or the DB is down. | contract-test (CI red→green) + operator-attested live grant | `local-backend-boot` |

The **chat surface** the member talks to (the renderer chat panel + the live loop stream) is **not a
capability here** — its provable backend (the SSE route riding `orchestrate`) is
**headless-orchestrator's Phase 2** (ADR-0108), CONSUMED by this desktop; the renderer chat panel is a
thin client over it (ADR-0108 d.1) and its *appearance* is part of this story's operator-attested UAT
(leg 7 below).

## Within-story dependency graph

Authored from the intended data-flow; re-derive from the real imports/calls when the units are built
(ADR-0010 §3) and correct if the code disagrees. The graph is acyclic; `credential-broker` and
`local-backend-boot` are the two roots.

- `electron-shell` → `credential-broker` (the shell supplies the real keychain adapter to the broker port).
- `local-credential-wiring` → `credential-broker`, `local-backend-boot` (it feeds the broker's credential
  into the backend the boot capability stands up — so it couples to both).
- `shared-forest-connection` → `local-backend-boot` (the connection/readiness is the backend's store seam).

`credential-broker` (Step 1's CI-proven core) and `local-backend-boot` (the thick keystone) share no
edge — Step 1's safety boundary and Step 2's backend boot are independent roots that
`local-credential-wiring` joins.

## Cross-story boundary (ADR-0010 §4 / ADR-0074)

Authored from the intended consumed seams (re-verify against the real imports when built). All are
CONSUMED, not absorbed — this story owns the desktop shell + the local backend COMPOSITION (the
`/api/*` router, the in-process credential wiring, the readiness probe), never the drive drivers, the
agent/SDK seam, the library schema, the studio frontend, or the headless-orchestrator runtime.

- **`studio`** — the **compiled frontend**. The renderer loads studio's compiled dist (ADR-0090 d.4);
  it is studio's delivered outcome the desktop's UAT needs. The desktop does NOT import studio's SERVER
  source (the surface boundary, above).
- **`drive-machinery`** — the **build/orchestrate drivers + spec discovery**. The local backend
  composes `@storytree/drive` (`nodeBuild`/`storyBuild`/`adoptStory`/`orchestrate` + `loadLocalSecrets`,
  the same lazy-import shape `devApi.ts` uses) and `@storytree/orchestrator` (`findNodeSpecFile`/
  `loadNodeSpec`/`isStoryBuildable`/`resolveBuildConfig`). `@storytree/agent` is reached TRANSITIVELY
  through drive's `orchestrate` — the desktop never names the SDK (ADR-0004 single-import-site).
- **`library`** — the **knowledge surface + prompt render**. The local backend's library/tree reads and
  the orchestrate composition consume `@storytree/library/store` (`renderAgentPrompt(store,
  "session-orchestrator")` — the ONE loop definition, ADR-0051 — and `loadCorpus`).
- **`headless-orchestrator`** — the **chat/loop runtime (its Phase 2)**. The chat SSE backend + the
  orchestrate-driven session that ship inside this desktop are headless-orchestrator's Phase 2
  (ADR-0108); the desktop CONSUMES that capability and mounts its route. The renderer chat panel is the
  thin client over it.

## Story UAT

The integrated acceptance walkthrough that proves the whole thick-local desktop meets its outcome
end-to-end. Minimal-first (one coherent journey: launch → sign in → the loop runs locally → it blooms
in the shared forest), defect-driven thereafter (each real failure earns a permanent regression case,
never speculative breadth).

> **Per-leg witness (ADR-0106).** The CI-honest mechanics legs are `witness: machine` — the package
> suites (`apps/desktop` + the drivers) cover them. The experiential legs — a built native shell, a real
> OS keychain, a real subscription `query()` running the live loop, the "feels like one app" appearance,
> and the member's live Cloud SQL IAM grant — are `witness: human` (operator-attested, ADR-0070): an
> automated CI run cannot drive a native shell, a real keychain, the paid SDK leaf, or judge the look.
> The story-level `uat_witness` is absent → human (the ADR-0040 fail-closed signpost), so the
> machine-driven whole-story UAT node stays withheld; the crown derives from the per-leg roll-up plus
> the operator's attestations.

**Goal —** A trusted member launches the native app, signs in with their Claude subscription (held in
the OS keychain), drives a real build through the local backend, and watches it reach a signed verdict
that blooms in the shared forest — the renderer never holding the credential or importing the agent, the
credential never leaving the machine.

1. **Launch.** _(witness: human)_ The member opens the desktop app; it loads the compiled studio UI
   inside the native shell (no Vite, no source on the renderer). **Success —** the studio renders.
2. **Sign in, credential in the keychain.** _(witness: human)_ The member completes the Claude
   subscription login; the `CLAUDE_CODE_OAUTH_TOKEN` is captured by the **main** process and stored
   through the broker into the real OS keychain, never surfaced to the renderer; it survives an app
   restart, and the raw credential appears in NEITHER `localStorage` NOR any plaintext on-disk file.
   (The CI-honest core of this — round-trip + dual-credential + no-leak through the injected port — is
   `credential-broker`'s contract tests.)
3. **The local backend is live (no 503).** _(witness: machine)_ With the desktop main process running,
   a `GET /api/*` read route (library/tree/activity) returns a real envelope body — NOT the
   `static-server.ts` 503 stub. **Success —** the backend booted in-process and `/api/*` serves the
   composed organism drivers. (`local-backend-boot`'s contract test asserts the live route over the
   stub.)
4. **The credential reaches the in-process backend.** _(witness: machine)_ A build/orchestrate driver
   invocation in the local backend receives the brokered credential in-process (no TLS hop), and the
   renderer is never handed the raw token. (`local-credential-wiring`'s contract test asserts the
   in-process hand-off + the renderer isolation.)
5. **A real build reaches a signed verdict locally and blooms in the shared forest.** _(witness: human)_
   The member triggers a build from the UI; the local backend drives the real `story build --real` (or a
   node `--live` smoke) on their machine — a real checkout + git + pnpm + worktrees — the spine observes
   RED then GREEN from real exit codes and SIGNS, the verdict persists to the SHARED Cloud SQL
   (`events.verdict`), and the build blooms in the forest the owner watches. **Success —** a signed
   verdict from a real local build, written to the shared forest, the agent having signed nothing itself
   (ADR-0091) — and CI later re-proves it independently. *(operator-attested — a real `--real`/`--live`
   build is subscription-billed; an agent should not burn the spend unattended.)*
6. **The shared-forest connection is honest when ungranted/down.** _(witness: machine for the probe;
   human for the live grant)_ Before the grant, the readiness probe fails CLOSED with clear guidance
   (the member needs the Cloud SQL IAM grant / the DB is down) rather than hanging or forging success;
   after the **attended** IAM grant of the member's Google identity (ADR-0021 keyless, a privileged
   action performed at delivery), the live write path connects. (`shared-forest-connection`'s contract
   test proves the fail-closed probe over an injected connector; the live grant is operator-attested.)
7. **It feels like one app, chat included.** _(witness: human)_ Launch, sign-in, the live loop, the chat
   panel (the consumed headless-orchestrator Phase-2 surface), and the approval-to-land gate read as one
   coherent native application. **Success —** the owner's two-stage visual verdict (ADR-0070 / ADR-0113
   §9): the appearance is witnessed, not machine-asserted.

End state — a trusted member ran the whole storytree loop on their own machine through a native app,
their credential held in the OS keychain and never leaving the machine, their builds signed from real
exit codes and blooming in the shared forest, the renderer never crossing the agent boundary.

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

None at the story-shape level — ADR-0113 settled the shape (thick-local, the inner-circle premise, the
shared forest, minimal packaging). The local-backend boundary call (re-compose the organism drivers vs
import the studio server) is a **dependency-graph/layout decision the story-author owns** (owner
correction 2026-06-26) and is DECIDED above (re-compose), not escalated. Two items are RECORDED as
decided-and-surfaced (forced by existing decisions, reversible, internal — not re-litigated per the
owner-fork bar):

1. **The chat surface is consumed from `headless-orchestrator`, not re-owned here (decided).** Its
   provable SSE backend is that story's Phase 2 (ADR-0108); the renderer chat panel is a thin client
   over it. Surfaced so the boundary is visible.
2. **Verbatim studio route-table sharing is deferred (decided).** The desktop mounts a minimal-to-journey
   route table composed from the organism drivers; extracting the studio's full route table into a shared
   organism (which would touch the `studio` story) is a clean follow-on, not pulled into this journey to
   keep it small.

The only **owner-level** item is operational, not modeling: the **attended Cloud SQL IAM grant** of the
trusted member's Google identity at delivery (ADR-0021 keyless) — a privileged action the human performs,
surfaced in `shared-forest-connection` and UAT leg 6.
