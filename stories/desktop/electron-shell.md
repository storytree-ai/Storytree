---
id: "electron-shell"
tier: capability
story: desktop
title: "The Electron shell loads the compiled studio and wires the real OS-keychain adapter to the broker"
outcome: "The desktop shell loads the compiled studio bundle, wires the real OS-keychain adapter to the credential broker, and exposes the context-isolated `desktopAuth` preload the Credentials panel consumes."
status: proposed
proof_mode: operator-attested
depends_on: [credential-broker]
decisions: [109, 111, 179]
---

# The Electron shell loads the compiled studio and wires the real OS-keychain adapter to the broker

**Outcome —** The desktop shell loads the compiled studio bundle, wires the real OS-keychain adapter to
the credential broker, and exposes the context-isolated `desktopAuth` preload the Credentials panel
consumes.

This is the **glue that makes the desktop story real** (ADR-0109 Step 1): an Electron shell that (a)
renders the compiled studio UI and (b) supplies the real OS-keychain adapter to the
[`credential-broker`](credential-broker.md) port plus the `window.desktopAuth` preload surface the
broker's desktop-only Credentials panel calls (ADR-0179). Its proof is **operator-attested** (ADR-0070):
the native shell appearance and the real-OS-keychain adapter binding are witnessed by a human running a
built app — CI cannot drive a real keychain or judge the native shell headlessly. The CI-honest core —
broker contracts, typed IPC shapes, and the panel's geometry/behaviour — is already proven on
`credential-broker`; this capability is the thin real-adapter binding plus the rendered shell.

## Guidance

- **Loads the compiled studio dist ONLY (ADR-0090 d.4).** The shell points Electron at the
  **compiled** studio frontend bundle — NO source, NO build engine, NO stories travel with it. It
  carries nothing private; an `.asar` of this app reveals only the already-public compiled UI.
- **Wires the real adapter to the broker port.** It implements the `KeychainPort` (`set` / `get` /
  `delete`) against `@napi-rs/keyring` (the real Keychain / Credential Manager / libsecret), and hands
  that adapter to the broker. The broker logic is unchanged — only the concrete port differs from the
  in-memory fake the contracts use.
- **Exposes `window.desktopAuth` for the Credentials panel (ADR-0179).** The preload bridges
  context-isolated `store` / boolean-only `status` / `signOut` IPC to the main-process broker. The
  panel's store/check/remove journey — two independent rows, one-way store, boolean status — is
  authored and proven on [`credential-broker`](credential-broker.md); the shell only supplies the real
  adapter and the IPC surface the panel consumes.
- **Renderer boundary is transient-entry, not zero-touch (ADR-0179).** A raw credential is never
  persisted in, returned to, or recoverable from the renderer. It may exist **transiently** while the
  operator types it into the panel's password input and may cross the context-isolated
  `desktopAuth.store(kind, value)` IPC once on submission; the input and renderer-held copy clear in
  `finally`, status is boolean-only, and the stored value lives in the OS keychain only.
- **Never imports the agent, holds no model path (ADR-0004 / ADR-0090 d.2).** The shell requests a
  build only as an INTENT over the gated API (Step 2 work, out of scope here); it never crosses the
  orchestrator/agent boundary.

## Proof — operator-attested (ADR-0070)

There is no isolatable red→green CI test for a built native shell talking to a real OS keychain, so
this capability is proven by **operator attestation**: the look and the real adapter binding are
witnessed, not machine-asserted. The Credentials panel's one-way store geometry and boolean-only
status are already contract-tested on `credential-broker`; this proof covers only what the shell owns —
the native appearance and the real `@napi-rs/keyring` adapter round-trip behind `desktopAuth`. The
build-behind-it / surface-it / owner-nod shape (ADR-0070):

- **Build behind the app —** the Electron shell loads the compiled studio dist; the
  `@napi-rs/keyring` adapter implements the broker's `KeychainPort`; the preload exposes
  `window.desktopAuth` so the Credentials panel can reach the real keychain through the broker.
- **Surface it —** a runnable build a human can launch on a real OS (Keychain / Credential Manager /
  libsecret present) with the Credentials panel reachable from the settings/control surface.
- **Owner nod = the verdict —** the operator runs the app and witnesses: the studio renders in the
  native shell; storing through the panel lands a credential in the real OS keychain via the shell's
  adapter binding; boolean saved status survives an app restart; sign-out clears it; and the stored
  credential is never persisted in, returned to, or recoverable from the renderer (transient password
  input + one-way store IPC only). That witnessed attestation is the signed verdict for this
  capability (an agent can never self-attest it). The panel's full two-kind configure journey is
  rolled up under `credential-broker`'s operator-attested leg (ADR-0179 §5); this capability attests
  the shell binding that makes that journey real on a built app.
