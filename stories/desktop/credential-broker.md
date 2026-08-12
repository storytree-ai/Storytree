---
id: "credential-broker"
tier: capability
story: desktop
title: "The credential broker and desktop-only Credentials panel let the member store, check, and remove each runtime credential without renderer recovery"
outcome: "The member configures each independently namespaced runtime credential through a desktop-only settings panel and the main-process broker stores it in the OS keychain for only its authorized operation without the renderer ever recovering a stored value or retaining process-lifetime residue."
status: proposed
proof_mode: contract-test
depends_on: []
decisions: [109, 111, 179, 198]
# Node-borne proof config (ADR-0057 keystone): the broker's main-process contracts (1–4) are already
# green in apps/desktop. THIS block authors the NET-NEW renderer Credentials panel — a studio frontend
# component feature-gated on `window.desktopAuth` (ADR-0179). FRONTEND-BUILDER TWO-STAGE (ADR-0070):
# the `real:` arm proves GEOMETRY/BEHAVIOUR ONLY (feature gate, two rows, one-way store, boolean
# status, per-kind sign-out, blank refusal) over an injected `desktopAuth` fake; the real OS-keychain
# round-trip in a running desktop app is operator-attested below, not machine-asserted here.
# ADR-0198 (supersedes ADR-0177, amends ADR-0179): the Cursor leaf is retired, so the credential
# surface is TWO kinds only — `oauth` and `api-key`; `cursor-api-key` / CURSOR_API_KEY is dropped.
# CRITICAL — apps/studio is VITEST + jsdom, NOT node:test → `real.proofCommand` runs the ONE file under
# vitest (the chat-panel precedent).
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  # ADR-0353 — the READ-ONLY coverage surface: where THIS capability's contract tests actually live.
  # The `real:` arm below authors the NET-NEW renderer Credentials panel, so it is scoped to ONE
  # studio component — that is contracts 5–9 only. Contracts 1, 3 and 4 are the MAIN-PROCESS broker
  # half, which the frontmatter above already states was "already green in apps/desktop": the broker,
  # the per-operation bridge, and the credentialed runner. Those tests exist, run offline, and pass;
  # the sweep simply never read them, because a studio-scoped WRITE fence is not a statement about
  # where a desktop capability's proof lives. Contract 2 is deliberately absent from this list — the
  # spec proves it by the package TYPECHECK and claims no dedicated test, so no glob can credit it.
  coverage:
    testGlobs:
      - "apps/desktop/src/credential/broker.test.ts"
      - "apps/desktop/src/backend/credential-bridge.test.ts"
      - "apps/desktop/src/backend/credentialed-build-runner.test.ts"
  real:
    testFile: "apps/studio/src/components/CredentialsPanel.test.tsx"
    sourceFile: "apps/studio/src/components/CredentialsPanel.tsx"
    scope:
      testGlobs: ["apps/studio/src/components/CredentialsPanel.test.tsx"]
      sourceGlobs: ["apps/studio/src/components/CredentialsPanel.tsx"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    proofCommand:
      file: pnpm
      args:
        - "--filter"
        - "studio"
        - "exec"
        - "vitest"
        - "run"
        - "src/components/CredentialsPanel.test.tsx"
---

# The credential broker and desktop-only Credentials panel let the member store, check, and remove each runtime credential without renderer recovery

**Outcome —** The member configures each independently namespaced runtime credential through a
desktop-only settings panel and the main-process broker stores it in the OS keychain for only its
authorized operation without the renderer ever recovering a stored value or retaining process-lifetime
residue.

This remains **one capability** for the first minimum-green desktop credential surface (ADR-0179). Its
single walkthrough proves the transient-entry boundary end to end: each kind is independently
stored through the panel, checked by boolean-only status, removable per kind, brokered to only its
authorized operation for only that operation's lifetime, and never read back into the renderer. The
two-kind broker core (PR #662) and the Credentials panel (ADR-0179) are the same journey — secure
plumbing without an application affordance cannot complete credential hosting.

The main-process broker speaks to a narrow **`KeychainPort`** (`set` / `get` / `delete` verbs) rather
than to any concrete secret store. CI uses `InMemoryKeychain` plus an injected environment for
contracts 1–4, and an injected `window.desktopAuth` fake for contracts 5–9 — every automated contract
is offline and cannot touch a real credential. The thin `@napi-rs/keyring` binding and a real
OS-keychain round-trip through the panel remain operator-attested (ADR-0070 / ADR-0179 §5); the shell
binding lives on [`electron-shell`](electron-shell.md), the panel's real OS-keychain leg is attested
below.

## Proof walkthrough — contract-test

Using `InMemoryKeychain`, an injected environment object, the existing typed IPC/preload API shape,
and stubbed operation runners:

1. Store both credential kinds through the broker, then read and clear them by kind; observe that
   each kind maps to exactly one environment variable and that changing or clearing one kind cannot
   affect the other kind.
2. Run the package typecheck across the existing main/preload store, status, and sign-out signatures:
   all accept the `CredentialKind` union (`oauth` | `api-key`); status and sign-out return only
   booleans, while store returns `void`, so no response shape can carry a raw value.
3. Invoke a generic operation bridge for each kind; observe precedence
   **explicit environment > requested-operation keychain > secrets file**, the selected mapping only
   during the operation, and exact restoration in `finally` after success or failure. An injected
   variable that did not exist before the operation is scrubbed rather than retained.
4. Invoke a Claude build with neither credential kind stored; observe that Claude selection considers
   only `oauth` or `api-key` and fails closed. Keep sidecar startup outside credential selection: it
   performs no keychain read.
5. Render the Credentials panel with an injected `desktopAuth` fake: when `window.desktopAuth` is
   absent the panel is not mounted (hosted/browser studio shows no non-functional keychain controls);
   when present, two independent rows appear — Claude subscription token (`oauth`), Anthropic API
   key (`api-key`) — each with boolean saved/not-saved status, an
   ephemeral password input, Store/Replace, and Sign out/Remove.
6. Store through each row: `desktopAuth.store(kind, value)` is called once, the input and renderer
   state clear in `finally` on both success and failure, status refreshes via `desktopAuth.status(kind)`
   only, blank submissions are refused with value-free errors, and sign-out calls
   `desktopAuth.signOut(kind)` per kind without cross-kind effect.

## Guidance

- **The `KeychainPort` seam is what makes these contracts CI-runnable.** Define the port as a narrow
  interface (`set(account, secret)`, `get(account)`, `delete(account)`), inject it into the broker,
  and pass `InMemoryKeychain` in tests. The broker has no dependency on `@napi-rs/keyring` or any OS
  API — only on the port.
- **Exactly two independently namespaced kinds.** The tagged vocabulary is:
  - `oauth` → `CLAUDE_CODE_OAUTH_TOKEN`
  - `api-key` → `ANTHROPIC_API_KEY`

  Each kind owns a distinct keychain account key. Reads, writes, and clears are selected by kind;
  there is no shared/default account and no cross-kind fallback.
- **A Claude build selects one of the Claude kinds.** A Claude build may select `oauth` or
  `api-key`, and fails closed when neither is stored. There is no non-Claude runtime credential in
  the keychain — the metered Cursor kind was retired (ADR-0198, superseding ADR-0177).
- **The generic bridge grants a credential for one operation only.** Given the requested kind, it
  resolves the mapped variable with precedence **explicit environment > requested-operation keychain
  > secrets file**, injects only that variable into the operation environment, and restores the
  previous state in `finally` on both success and failure. If the bridge introduced the variable, it
  deletes/scrubs it afterward. It never mutates an unrelated credential variable.
- **Sidecar startup performs no keychain read.** A runtime credential enters a process environment
  only through the generic per-operation bridge for a requested operation, which then scrubs/restores
  the injected environment; no credential is read into the sidecar startup environment.
- **Renderer status is boolean-only; raw-value IPC is store-only.** Typed IPC and preload surfaces may
  accept a raw credential only on the renderer-to-main store call. Status returns only
  `boolean` per requested kind, sign-out returns only `boolean`, and store returns `void`; no response
  shape returns a raw value.
- **The keychain port is the ONLY storage path — this is the safety boundary.** The broker writes the
  credential to nothing else: it holds no `localStorage` reference and writes the token to no file.
- **Desktop-only Credentials panel (ADR-0179).** The panel lands in the shared studio bundle
  (`apps/studio/src`) but renders only when `window.desktopAuth` is present — reachable from the
  settings/control surface. Each row owns one kind; rows never share a value or fall back into one
  another. The panel never reads, reveals, copies, exports, or pre-fills a stored credential; it
  never touches `localStorage` or `~/.storytree/secrets.json`.
- **Transient-entry boundary on the renderer side.** A raw value exists only while the operator types
  it in the password input. Store sends it once through `desktopAuth.store(kind, value)`, then clears
  the input and any renderer-held copy in `finally`. Status is boolean-only via `desktopAuth.status(kind)`.
  Sign-out is `desktopAuth.signOut(kind)` with a boolean-only refresh. Error messages are value-free.
- **The panel's seam is `window.desktopAuth` only.** The component holds no `fetch` and imports no
  `@storytree/agent` / `@storytree/drive` / desktop main-process code. Tests inject a fake implementing
  `store`, `status`, and `signOut` — the `BuildSection` / `chat-panel` discipline (`vi.mock` or
  `vi.hoisted` on the seam, `@testing-library/react`, jsdom).
- **The renderer-side bridge MODULE — `apps/studio/src/lib/desktopAuth.ts` — is owned by THIS
  capability** (made explicit 2026-08-07, capability-layer-coverage-arc increment 2; ADR-0179). It is
  not incidental studio plumbing: it is the seam the contracts above are *defined over*. `CredentialKind`
  and `CREDENTIAL_KINDS` are the two-kind vocabulary of contract 1 (`oauth` | `api-key`, ADR-0198);
  `DesktopAuthBridge` is where the renderer half of contract 2 is TYPED — `store` is the only member
  taking a raw value, and `status` / `signOut` return `Promise<boolean>`, so no response shape can carry
  a stored credential back; and `getDesktopAuth()` returning `undefined` in a plain browser is exactly
  the feature gate contract 5 asserts, which is what keeps non-functional keychain controls out of the
  hosted studio. Both credential consumers are already this capability's —
  `CredentialsPanel.tsx` and `DesktopCredentialsDock.tsx`. The module carries no colocated test of its
  own and needs none: it is 3 lines of behaviour proven through those component suites (contracts 5–9),
  and its type surface is proven by the studio typecheck (contract 2).
- **Honest caveat — two consumers use this bridge for something OTHER than credentials.** `App.tsx:206`
  and `Hud.tsx:64` call `getDesktopAuth()` purely as a *"am I running inside the desktop app?"* probe,
  to pick a `HudPosture` — no credential is stored, read, or removed on those paths. That is a use this
  capability's outcome does not cover, and it means the credential bridge's mere PRESENCE has become a
  de-facto desktop-host detector. It is recorded, not adopted: those two call sites are not claimed by
  any contract here, and if a dedicated host-detect seam is ever wanted, that is a `studio`-side
  refactor (`one-way-to-do-things`), not an expansion of the credential broker's journey.
- **Typecheck is part of the boundary proof.** Contract `typed-ipc-never-discloses` already pins the
  main/preload signatures; the studio typecheck must declare a matching renderer-side
  `DesktopAuth` / `window.desktopAuth` type with the same kind union and boolean-only read surfaces.
- **What is NOT proven here (honest scope).** The real `@napi-rs/keyring` adapter — actually writing
  into Keychain / Credential Manager / libsecret — is thin glue proven by **operator attestation**
  (ADR-0070), not by CI; it round-trips the real OS keychain that CI cannot drive. The shell binding
  attestation lives on [`electron-shell`](electron-shell.md); the panel's real OS-keychain store/remove
  leg is operator-attested below (ADR-0179 §5). Automated proof never reads or migrates any
  user-level secrets file; `credentialedBuildRunner` tests represent the file tier with an
  already-hydrated injected environment.

## Contracts (9)

1. **`two-kind-keychain-independence`** — both kinds round-trip, map, and clear independently
   - **asserts —** through `InMemoryKeychain`, each tagged kind maps exactly to its declared environment
     variable and distinct account key; reading one kind never returns the other; clearing one leaves
     the other intact.
   - **proven by —** a parameterized broker contract test over the two kinds, including pairwise
     independence and exact mapping assertions.

2. **`typed-ipc-never-discloses`** — renderer status is boolean-only and raw-value IPC is store-only
   - **asserts —** typed main/preload contracts admit a raw value only as store-call input; status is
     a per-kind boolean, sign-out returns only a boolean, and store returns `void`.
   - **proven by —** the package typecheck proving the existing main/preload store, status, and
     sign-out signatures accept the `CredentialKind` union (`oauth` | `api-key`); their
     existing return types prove no raw-valued response surface. No dedicated IPC/preload test is
     required or claimed.

3. **`operation-env-lifetime`** — bridge precedence, namespace isolation, and `finally` scrubbing hold
   - **asserts —** the generic bridge injects only the requested kind's mapped variable; explicit
     environment beats keychain, which beats the already-hydrated environment representing the file
     tier; success and thrown failure both restore the exact prior environment, deleting a newly
     introduced variable.
   - **proven by —** `CredentialBridge` tests cover requested-kind mapping plus success/failure
     restoration, scrubbing, and unrelated-variable isolation; `credentialedBuildRunner` tests cover
     the Claude precedence chain of explicit environment over keychain over the already-hydrated
     environment representing the file tier.

4. **`runtime-credential-partition`** — a Claude build selects only the Claude kinds and startup performs no keychain read
   - **asserts —** the Claude runner considers only `oauth` and `api-key`, then fails
     closed when neither kind is stored; sidecar startup performs no keychain read, so a runtime
     credential can enter the environment only inside a requested operation's bridge lifetime.
   - **proven by —** runner tests with `InMemoryKeychain` and injected environments cover the
     no-credential/Claude fail-closed case and per-operation selection. The startup half is the
     composition boundary itself: sidecar startup has no keychain read; no dedicated startup snapshot
     test is required or claimed.

5. **`credentials-ui-feature-gated`** — the panel mounts only when `window.desktopAuth` is present
   - **asserts —** with no `window.desktopAuth`, the Credentials panel is absent from the settings/
     control surface (hosted/browser studio shows no non-functional keychain controls).
   - **proven by —** `CredentialsPanel.test.tsx` rendering the settings surface without the global;
     query asserts the panel/rows are not in the document.

6. **`credentials-ui-two-independent-rows`** — two kinds, independent boolean status
   - **asserts —** when `desktopAuth` is present, two rows render for `oauth` and
     `api-key`; each row's saved/not-saved status comes only from `desktopAuth.status(kind)` and
     changing one kind's status does not affect the other.
   - **proven by —** component test with a fake whose per-kind `status` resolves independently.

7. **`credentials-ui-one-way-store`** — store once, clear input in `finally`, never read back
   - **asserts —** Store/Replace calls `desktopAuth.store(kind, value)` exactly once with the typed
     value; the password input clears in `finally` on both success and thrown failure; no code path
     reads a stored value back into the input or application state.
   - **proven by —** component test scripting `store` resolve/reject and asserting input cleared and
     no `get`/read call exists on the fake.

8. **`credentials-ui-blank-refusal`** — blank submissions refused with value-free errors
   - **asserts —** Store/Replace with an empty/whitespace-only input does not call `store`; a
     value-free error is shown and the prior status is unchanged.
   - **proven by —** component test firing Store on empty input; `store` not called; error copy present
     and contains no user-typed secret.

9. **`credentials-ui-per-kind-sign-out`** — sign-out is per kind only
   - **asserts —** Sign out/Remove on one row calls `desktopAuth.signOut(thatKind)` only, refreshes
     that row's boolean status, and leaves the other kinds' status untouched.
   - **proven by —** component test with two kinds saved; sign-out one; assert `signOut` arity/kind and
     independent status refresh.

## Proof — operator-attested (ADR-0070 / ADR-0179 §5)

Contracts 1–4 and the shell's first OAuth round-trip are CI-honest or attested on
[`electron-shell`](electron-shell.md). The **real desktop Credentials panel** leg is operator-attested:
a human runs the built desktop app, opens the Credentials panel, enters a replacement Claude
subscription token (`oauth`) without any disclosure of a prior value, observes saved status, restarts
and observes status persist, then removes it and observes unsigned status. That witnessed
attestation is the signed verdict for the panel's real-keychain leg (an agent can never self-attest it).
