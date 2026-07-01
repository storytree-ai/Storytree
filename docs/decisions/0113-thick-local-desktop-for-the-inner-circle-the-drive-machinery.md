---
status: accepted
decided: 2026-06-26
amends: [90, 108, 109]
load_bearing: true
---
# ADR-0113: Thick-local desktop for the inner circle — the drive machinery runs on the trusted member's machine

## Status

accepted (2026-06-26) — decided/directed by the owner in conversation on 2026-06-26, choosing **thick-local
over thin-hosted** for the inner-circle delivery, on the explicit premise that the source is shared with the
circle. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask. The desktop client's
APPEARANCE / feel is operator-attested under ADR-0070 when built.

## Context

The end goal is to get a working, reliable storytree loop into the hands of the **inner circle** — today a single
trusted co-builder. The shipped plan routed this through a **thin client + hosted worker**: ADR-0090 split
orchestration into a thin UI and a server-side build-capable worker, with **d.4 "source stays server-side in every
phase — no client ever receives the monorepo, the agent, or the stories, only the compiled UI"** as a load-bearing
guard. ADR-0090 explicitly *rejected* the engine-bundling desktop app, on one ground: *"an app that bundles the build
engine + the private source SHIPS the source — an `.asar` unpacks trivially; packaging is not source protection."*
ADR-0109 then shipped a **thin** Electron client whose only job over the browser is credential hosting (the OS
keychain), with its Step 2 ("wire to the worker") pointed at a *hosted* worker, and ADR-0108 placed the hosted
chat-orchestration runtime at its Phase 5.

Two forces make thin-hosted the wrong shape for the inner-circle step:

1. **The source-protection rationale only bites for UNTRUSTED clients.** ADR-0090 d.4 resolves "the private-source
   concern by construction" — but the concern exists *because* the recipient is untrusted. The inner circle is one
   trusted co-builder, someone the owner shares the repo with anyway. With the source shared, d.4's load-bearing
   reason does not apply to him, and the entire justification for keeping the engine off his machine evaporates.

2. **The drive machinery is local-first by design, and the hosted runtime is the biggest, scariest surface.** Builds
   want a real checkout + git + pnpm + worktrees (ADR-0031) — that is their native habitat. ADR-0108 itself names the
   *hosted* runtime as *"the biggest new surface… containment, a minimal-privilege service account, and locked egress
   matter even more,"* precisely because it runs an agent that writes code and opens PRs. Hosting that for one person
   buys multi-tenant-grade infrastructure (Cloud Run runtime, IAP, egress policy, isolation) to solve a problem one
   trusted laptop does not have.

The seam for going thick is **already cut**. The desktop's Electron main process already boots a local `127.0.0.1`
server (`apps/desktop/electron/static-server.ts`) serving the compiled studio dist, and already stubs the backend with
a labelled placeholder: `/api/*` returns `503 {"error":"no backend in the desktop shell (Step 1; worker wiring is
Step 2)"}`, with the renderer falling back to its store-unavailable banner. Going thick is not a new architecture — it
is making that `/api/*` route serve the **real local studio backend** (`apps/studio/server`: the apiRouter, the build
worker, and the headless-orchestrator runtime) instead of a hosted one.

## Decision

1. **For the inner-circle phase, the desktop is a THICK client.** The Electron **main** process serves a local backend
   on `127.0.0.1` `/api/*` (replacing the `static-server.ts` 503 stub); the renderer is the same studio frontend,
   talking to it over `/api` exactly as it talks to a hosted backend today. The backend is **re-composed from the
   shared organism drivers** — `@storytree/drive` + `@storytree/orchestrator` + `@storytree/library/store`, the SAME
   drivers `apps/studio/server/devApi.ts` wires — NOT a source import of `apps/studio/server` (a private surface that
   exports nothing; ADR-0100 / the boundary gate forbid it, and the SDK stays behind ADR-0004's single-import-site).
   Both the studio worker and the desktop backend mount one shared `@storytree/drive` core (ADR-0112). This is the
   redefinition of **ADR-0109 Step 2**: "wire to the worker" becomes "boot the worker locally," not "call a hosted
   worker over TLS."

2. **The ADR-0004 agent boundary is preserved by topology, not abandoned.** The Electron main process IS the single
   orchestrator/agent boundary; the renderer never imports `@storytree/agent` and holds no model path (ADR-0090 d.2 /
   ADR-0004 stand verbatim). What changes is *where the boundary process runs* — the trusted member's own machine
   instead of a hosted box — not that the boundary exists.

3. **Amends ADR-0090 d.4 for the inner-circle phase only.** "Source stays server-side in every phase" is relaxed to
   "source may run on a **trusted circle member's** machine." The guard's intent (the source is never exposed to an
   untrusted recipient) is preserved by the trust precondition; it is the *premise*, not the mechanism, that changed.
   ADR-0090's client/worker split, BYO-credential posture, and no-agent-on-the-renderer guard all stand. When the
   circle grows past "trusted with the source," the thin-hosted path (ADR-0090 Phase 3 / ADR-0108 Phase 5) is the
   answer again — this ADR **defers hosting, it does not delete it.**

4. **Proof integrity is unchanged (ADR-0091).** The local backend is a sanctioned off-tether worker: the spine
   observes RED then GREEN from real exit codes and SIGNS; the agent holds no signing key and hands in no verdict; CI
   independently re-proves green before the trunk (ADR-0022). The damage ceiling stays a briefly-wrong hue corrected
   by CI — the ADR-0091 argument carries over verbatim, and is if anything stronger (a single-operator local worker,
   not a shared hosted one).

5. **Credential brokering is in-process and local (ADR-0109 preserved, simplified).** The keychain-held credential
   (`CredentialBroker`, `apps/desktop/src/credential`) is brokered to the local backend in the SAME (main) process —
   no TLS hop, no server-side persistence, the credential never leaves the member's machine. This is a *stronger* BYO
   posture than brokering to a hosted box, and it keeps the renderer/keychain isolation ADR-0109 d.4 requires.

   **Correction (2026-07-02, per
   [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):** "the SAME (main)
   process" is overtaken by the [ADR-0119](0119-thick-local-desktop-backend-a-tsx-sidecar-serving-the-studio.md)
   topology — the backend runs as a backend **sidecar**, a child Node process the Electron main OWNS (same
   Electron binary, `ELECTRON_RUN_AS_NODE`) — so the keychain read now happens **per-build inside that
   main-owned sidecar** (`apps/desktop/src/backend/credentialed-build-runner.ts` composes the credential
   bridge around the routed build runner; wired in `apps/desktop/electron/backend-entry.ts`). Everything
   this item decides holds unchanged: same machine, no TLS hop, no server-side persistence, and the
   renderer never sees the token (ADR-0109 d.4).

6. **Shared Cloud SQL stays the source of truth — one living forest.** The member's builds, verdicts, and presence
   write to the SHARED Cloud SQL Postgres (ADR-0017 / ADR-0023), so his work blooms in the same forest the owner
   watches — the whole point of sharing with the circle. This requires granting his Google identity Cloud SQL IAM
   access (ADR-0021 keyless), an **attended privileged action performed at delivery**, not a local-store fork. A
   per-member local store is explicitly NOT chosen (it would fragment the shared forest); it remains a future option
   if disconnected operation is ever needed.

7. **Minimal packaging for v1 (lean, ADR-0109's "minimal first").** The trusted member runs a dev-mode desktop build
   with the toolchain present (Node / pnpm / git) — acceptable for a co-builder. Code-signing, notarization, and
   auto-update stay deferred (ADR-0109's open calls), revisited when the circle widens past hands-on devs.

8. **The boundary gate sanctions the new edges (ADR-0074).** The desktop surface declares organism `depends_on` edges
   on `drive`, `orchestrator`, and `library` (the re-composed backend's drivers) plus `headless-orchestrator` (the
   chat core) — NOT on the `studio` surface (which exports nothing). `check:boundaries` stays green because every
   cross-surface edge is a declared organism dependency; adding the package deps to `apps/desktop/package.json`
   WITHOUT those declared edges is what would fail the gate.

9. **Appearance is operator-attested (ADR-0070).** Whether the thick desktop *feels* like one app — launch, sign-in,
   the live loop, the approval gate — is the owner's two-stage visual verdict; the mechanics (backend boots, a build
   reaches a signed verdict, the loop runs end-to-end on the member's machine) are machine-witnessed.

## Consequences

**Good**
- The fastest route to a reliable end-to-end loop on the member's machine: the build/orchestrate machinery runs in its
  native habitat (real checkout, git, pnpm, worktrees), not inside a containment-hardened hosted runtime.
- Sidesteps the entire hosted-runtime surface for the circle-of-one — no Cloud Run orchestration runtime, no IAP, no
  egress policy, no multi-tenant isolation (ADR-0108's "biggest new surface" worry).
- Maximal reuse: the local backend is the existing `apps/studio/server`; the ADR-0108 Phase-2 chat surface ships
  *inside* the desktop on the same code that would have run hosted; the keychain broker (ADR-0109) is already built.
- The credential never leaves the member's machine — a stronger BYO posture than a hosted broker.
- One shared forest preserved (shared Cloud SQL): the owner watches the member's builds grow live.

**Bad / accepted costs**
- Reverses ADR-0090 d.4 for the circle: the source DOES land on the member's machine. Mitigated entirely by the trust
  precondition (a co-builder, not a stranger); this ADR is explicitly scoped to that precondition and reverts to
  thin-hosted when it no longer holds.
- The member needs the toolchain and shared-DB access (an attended IAM grant). Operational onboarding, not a one-click
  install — accepted for a hands-on inner circle.
- The desktop becomes a genuinely thicker surface to package and secure (Electron RCE surface, ADR-0109); the renderer
  must still hold no credential, and now the main process holds the engine.

**Neutral**
- Hosting is deferred, not foreclosed — when the circle outgrows "trusted with the source," ADR-0090 Phase 3 /
  ADR-0108 Phase 5 return, and the same chat surface + worker run hosted behind IAP with BYO-credential over TLS.
- The browser thin client and the terminal session stay fully valid; this adds a thick desktop surface, it retires
  nothing.

## References

- [ADR-0090](0090-ui-driven-orchestration-hosted-build-capable-backend-thin-cl.md) — thin client + server-side
  worker; **amended** (d.4 "source stays server-side" relaxed for the trusted inner-circle phase; its split,
  BYO-credential, and no-agent-on-renderer guards stand).
- [ADR-0109](0109-a-native-credential-host-desktop-client-electron-for-byo-cre.md) — the desktop credential-host
  client; **amended** (Step 2 "wire to the worker" redefined as booting the worker locally in the Electron main
  process; the keychain posture stands, the TLS hop drops to in-process).
- [ADR-0108](0108-chat-driven-orchestration-a-server-side-session-orchestrator.md) — the chat-orchestration runtime;
  its Phase-2 chat surface now ships inside the thick desktop, its Phase-5 hosting deferred for the circle.
- [ADR-0091](0091-proof-bearing-builds-may-run-in-a-hosted-self-contained-work.md) — proof-off-tether sanction; its
  integrity argument carries over verbatim to a local backend.
- [ADR-0004](0004-orchestrator-agent-boundary.md) — the orchestrator/agent boundary; preserved by topology (Electron
  main is the boundary; the renderer never crosses it).
- [ADR-0074](0074-enforce-the-organism-boundary-gate-the-cross-story-dependenc.md) — the boundary gate; the desktop
  declares organism edges on drive / orchestrator / library / headless-orchestrator.
- [ADR-0100](0100-bring-consuming-surfaces-apps-and-the-public-website-subrepo.md) — the surface model; `studio` is a
  private surface that exports nothing, so the desktop re-composes the shared drivers rather than importing it.
- [ADR-0112](0112-extract-the-build-orchestrate-drivers-into-packages-drive.md) — the `@storytree/drive` extraction;
  the one shared core both the studio worker and the desktop backend mount.
- [ADR-0031](0031-real-pass-promotion-and-worktree-deps.md) — worktree-based builds, the local machinery's habitat.
- [ADR-0017](0017-cross-cutting-knowledge-tier.md) / [ADR-0023](0023-library-cli-choose-your-own-adventure.md) —
  the shared Cloud SQL source of truth the member writes to.
- [ADR-0021](0021-keyless-agent-session-auth-and-db-bootstrap.md) — keyless Cloud SQL IAM; the member's identity grant.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — the desktop appearance is
  operator-attested.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — owner-directed → born accepted.
</content>
</invoke>
