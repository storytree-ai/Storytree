---
id: "electron-shell"
tier: capability
story: desktop
title: "The Electron shell loads the compiled studio and wires the real OS-keychain adapter to the broker"
outcome: "The desktop shell loads the compiled studio bundle and wires the real OS-keychain adapter to the credential broker behind a sign-in affordance."
status: proposed
proof_mode: operator-attested
depends_on: [credential-broker]
decisions: [109, 111]
---

# The Electron shell loads the compiled studio and wires the real OS-keychain adapter to the broker

**Outcome —** The desktop shell loads the compiled studio bundle and wires the real OS-keychain
adapter to the credential broker behind a sign-in affordance.

This is the **glue that makes the desktop story real** (ADR-0109 Step 1): an Electron shell that (a)
renders the compiled studio UI and (b) supplies the real OS-keychain adapter to the
[`credential-broker`](credential-broker.md) port behind a sign-in affordance. Its proof is
**operator-attested** (ADR-0070): the appearance and the real-OS-keychain round-trip are witnessed by
a human running a built app — CI cannot drive a real keychain or judge the native shell headlessly. The
CI-honest core of the safety claim is already proven in isolation by `credential-broker`'s contract
tests; this capability is the thin real-adapter binding plus the rendered shell.

## Guidance

- **Loads the compiled studio dist ONLY (ADR-0090 d.4).** The shell points Electron at the
  **compiled** studio frontend bundle — NO source, NO build engine, NO stories travel with it. It
  carries nothing private; an `.asar` of this app reveals only the already-public compiled UI.
- **Wires the real adapter to the broker port.** It implements the `KeychainPort` (`set` / `get` /
  `delete`) against `@napi-rs/keyring` (the real Keychain / Credential Manager / libsecret), and hands
  that adapter to the broker. The broker logic is unchanged — only the concrete port differs from the
  in-memory fake the contracts use.
- **Sign-in affordance captures a subscription token.** A sign-in affordance runs the Claude
  subscription OAuth flow, captures the `CLAUDE_CODE_OAUTH_TOKEN`, and stores it via the broker (into
  the OS keychain). The metered `ANTHROPIC_API_KEY` path is supported by the same broker.
- **The renderer never receives the raw credential (the safety boundary).** Token capture and storage
  happen in the shell's main/privileged process; the renderer (the studio UI) is never handed the raw
  credential and never writes it to `localStorage`. The credential lives in the OS keychain only.
- **Never imports the agent, holds no model path (ADR-0004 / ADR-0090 d.2).** The shell requests a
  build only as an INTENT over the gated API (Step 2 work, out of scope here); it never crosses the
  orchestrator/agent boundary.

## Proof — operator-attested (ADR-0070)

There is no isolatable red→green CI test for a built native shell talking to a real OS keychain, so
this capability is proven by **operator attestation**: the look and the real round-trip are witnessed,
not machine-asserted. The build-behind-it / surface-it / owner-nod shape (ADR-0070):

- **Build behind the app —** the Electron shell loads the compiled studio dist; the
  `@napi-rs/keyring` adapter implements the broker's `KeychainPort`; the sign-in affordance captures
  and stores a subscription OAuth token through the broker.
- **Surface it —** a runnable build a human can launch on a real OS (Keychain / Credential Manager /
  libsecret present) to exercise the sign-in → store → restart → read-back path.
- **Owner nod = the verdict —** the operator runs the app and witnesses: the studio renders in the
  native shell; sign-in lands a credential in the real OS keychain; it survives an app restart; and
  the raw credential appears in neither `localStorage` nor any plaintext on-disk file. That witnessed
  attestation is the signed verdict for this capability (an agent can never self-attest it).
