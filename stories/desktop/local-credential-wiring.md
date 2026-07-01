---
id: "local-credential-wiring"
tier: capability
story: desktop
title: "The keychain-brokered credential is fed to the in-process local backend, never to the renderer"
outcome: "The keychain-brokered credential is fed to the in-process local backend's build/orchestrate drivers (no TLS hop), and the renderer never receives the raw token."
status: proposed
proof_mode: integration-test
depends_on: [credential-broker, local-backend-boot]
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. NET-NEW (no editsExisting): the leaf authors an
# integration test that imports a NOT-YET-EXISTING symbol from a NEW source file under apps/desktop/src
# (red = module-not-found against the source that does not exist at HEAD), then writes that one new
# source file (green). The new module is the in-process credential bridge — it reads the broker (the
# existing src/credential/ port) and supplies the token to the backend's drivers, asserting it never
# returns the raw token to a renderer-reachable surface. `install: true` + a typecheck wall because the
# module imports the broker + backend types across the package's own modules and @storytree/drive's
# secrets seam (the proof runs in a fresh worktree — tsx + tsc need the lockfile-only install,
# ADR-0031 §2). Single LITERAL source file (no `*`), so the default node:test proof on the one test file
# is legal — no `proofCommand`.
proof:
  command:
    file: pnpm
    args: ["--filter", "desktop", "test"]
  scope:
    testGlobs: ["apps/desktop/src/**/*.test.ts"]
    sourceGlobs: ["apps/desktop/src/**/*.ts"]
  real:
    testFile: "apps/desktop/src/backend/credential-bridge.test.ts"
    sourceFile: "apps/desktop/src/backend/credential-bridge.ts"
    scope:
      testGlobs: ["apps/desktop/src/backend/credential-bridge.test.ts"]
      sourceGlobs: ["apps/desktop/src/backend/credential-bridge.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "desktop", "typecheck"]
---

# The keychain-brokered credential is fed to the in-process local backend, never to the renderer

**Outcome —** The keychain-brokered credential is fed to the in-process local backend's build/orchestrate
drivers (no TLS hop), and the renderer never receives the raw token.

**Depends on —**
- [`credential-broker`](credential-broker.md) — the bridge reads the credential from the broker's
  `KeychainPort` (the existing Step-1 core), so it couples to the broker's read surface.
- [`local-backend-boot`](local-backend-boot.md) — it feeds the credential INTO the backend that
  capability stands up, so it couples to the backend's driver-invocation seam.

> **Proof status (honest) — code BUILT, still `proposed` (no signed verdict yet).** The net-new bridge
> module + test exist (`apps/desktop/src/backend/credential-bridge.ts` / `.test.ts`), and the sidecar
> composition glue is wired (`credentialed-build-runner.ts` composes the bridge around the routed build
> runner; `apps/desktop/electron/backend-entry.ts` mounts it) — CI-proven at the wrapper tier. Since
> ADR-0119 the backend is a main-OWNED sidecar process, so the keychain read happens per-build in that
> sidecar (still no TLS hop, no server-side persistence; ADR-0113 §5 as corrected). The capability keeps
> `proposed` until a signed verdict lands through the gate. It remains the redefinition of **ADR-0109
> Step 2** made LOCAL; the collaborators: the broker (`apps/desktop/src/credential/`, Step 1) and the
> secrets-hydration seam `@storytree/drive`'s build path uses (`loadLocalSecrets` reads
> `CLAUDE_CODE_OAUTH_TOKEN` from the environment the SDK leaf consumes).

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the credential HAND-OFF AS A WHOLE — the
brokered credential reaches the in-process backend's driver invocation (so a real build can authenticate
the SDK leaf), AND the raw token is never returned to a renderer-reachable surface. That spans the broker
read AND the backend's driver path, so it is an integration test against the real broker + the real
backend seam, not a single isolated assertion.

THE HAND-OFF IS IN-PROCESS, NOT OVER TLS (ADR-0113 §5 — the simplification of ADR-0109 Step 2): the
credential flows broker → in-process backend drivers within the Electron MAIN process. There is NO HTTP
request carrying the token, NO server-side persistence, NO TLS hop. This is a STRONGER BYO posture than
brokering to a hosted box — the credential never leaves the member's machine. The SDK leaf reads the
token from its environment (the `loadLocalSecrets` path `@storytree/drive`'s build drivers already use);
the bridge's job is to make the brokered token available on THAT path in-process, never to ship it
anywhere.

THE RENDERER NEVER RECEIVES THE RAW TOKEN (the safety boundary, ADR-0109 d.4 preserved): the bridge runs
in the main process; it supplies the credential to the backend drivers and exposes NO path that returns
the raw token to the renderer (the studio UI). The existing `main.ts` IPC already enforces this for
storage (`auth:status` answers only a boolean; the token never flows back to the renderer) — the bridge
extends the SAME isolation to the build/orchestrate path: the renderer triggers a build as an INTENT, and
the credential is attached in the main process, never handed to the renderer.

OFFLINE-TESTABLE BY INJECTION: the bridge takes the broker (a `KeychainPort`-backed read) and the
driver-invocation seam as injected callbacks. The integration test drives it with the real broker over an
in-memory `KeychainPort` fake (a stored token) and a stub driver invocation that records what credential
it received — asserting the token reached the driver path in-process and that no renderer-reachable getter
returns it. No real keychain, no live SDK, no DB.

## Integration test

**Goal —** Prove that a credential stored through the broker is fed to the in-process backend's
driver invocation (no TLS hop), and that no renderer-reachable surface returns the raw token.

The integration test exercises this capability against its **real in-story collaborators** — the real
`credential-broker` over an in-memory `KeychainPort` fake + the backend's driver-invocation seam (a stub
that records the credential it received). No stubs within the desktop's own composition.

The integration test would:

1. Store a `CLAUDE_CODE_OAUTH_TOKEN` through the real broker (in-memory `KeychainPort` fake).
2. Trigger a build/orchestrate driver invocation through the bridge → assert the driver-invocation seam
   received the brokered credential **in-process** (on the env/secrets path the SDK leaf reads), with no
   HTTP/TLS hop in the path (the bridge made no outbound request).
3. Assert there is NO renderer-reachable getter that returns the raw token — the bridge exposes the
   credential only to the in-process driver path, mirroring the `auth:status` boolean-only IPC.
4. With no credential stored (the broker returns null), the bridge surfaces an honest "not signed in"
   state to the build path (fail-closed), never a forged/empty token silently accepted.
5. The metered `ANTHROPIC_API_KEY` kind is fed the same way (the broker supports both kinds, each tagged)
   — the bridge is credential-kind-agnostic on the in-process path.

## Contracts (3)

The test-proven leaf behaviours — each one isolated automated test (`node:test`, the `desktop` suite),
collaborators stubbed. The bridge module and its test file are built
(`apps/desktop/src/backend/credential-bridge.ts` / `.test.ts`); the paths below are the real module
(line refs kept coarse — file-level).

1. **`cb-feeds-credential-in-process`** — the brokered token reaches the driver path in-process
   - **asserts —** given a token stored via the broker, the bridge supplies it to the injected
     driver-invocation seam on the in-process secrets/env path (the path the SDK leaf reads), with no
     outbound HTTP/TLS request in the hand-off.
   - **covers —** `apps/desktop/src/backend/credential-bridge.ts` (the in-process feed)
2. **`cb-renderer-never-gets-raw-token`** — no renderer-reachable getter returns the raw credential
   - **asserts —** the bridge exposes no path that returns the raw token to a renderer-reachable surface
     — the credential reaches only the in-process driver path (ADR-0109 d.4 preserved).
   - **covers —** `apps/desktop/src/backend/credential-bridge.ts` (the isolation boundary)
3. **`cb-fails-closed-when-unsigned`** — no credential is an honest not-signed-in, never a forged token
   - **asserts —** when the broker returns null (nothing stored), the bridge surfaces a fail-closed
     not-signed-in state to the build path — never an empty/forged token silently accepted.
   - **covers —** `apps/desktop/src/backend/credential-bridge.ts` (the fail-closed path)

## Guidance — the net-new slice that earns the signed verdict

The brownfield bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the credential bridge as a
new module, test-first.

- **The new test —** `apps/desktop/src/backend/credential-bridge.test.ts` (`node:test` +
  `node:assert/strict`). Import `{ bridgeCredentialToBackend }` (or the chosen name) from
  `"./credential-bridge.js"`. Build the real broker over an in-memory `KeychainPort` fake and a stub
  driver-invocation seam that records the credential it received.
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING — `credential-bridge.ts`
  does not exist at HEAD, so the test fails module-not-found (the net-new missing-symbol red). Assert the
  in-process feed, the renderer isolation, and the fail-closed unsigned path.
- **The GREEN —** write `apps/desktop/src/backend/credential-bridge.ts`: a function that reads the broker
  and makes the token available to the in-process driver path (the `loadLocalSecrets`/env path the SDK
  leaf reads), exposing NO renderer-reachable token getter and failing closed when nothing is stored.
  After it, the import resolves, the assertions hold, and the package suite + typecheck stay green.

Rules:

- **In-process only, no TLS hop** — the credential reaches the driver path within the main process; the
  bridge makes no outbound request carrying the token (ADR-0113 §5). The test pins this
  (`cb-feeds-credential-in-process`).
- **Renderer isolation holds** — no renderer-reachable getter returns the raw token (ADR-0109 d.4). The
  test pins this (`cb-renderer-never-gets-raw-token`).
- **Fail closed when unsigned** — null broker read → an honest not-signed-in state, never a forged token.
- **Credential-kind-agnostic** — both `CLAUDE_CODE_OAUTH_TOKEN` and `ANTHROPIC_API_KEY` feed the same
  in-process path (the broker tags each kind).
