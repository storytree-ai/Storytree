# storytree desktop (ADR-0109 Step 1)

A thin **Electron** credential-host client. It loads the **compiled** studio bundle and keeps the
member's Claude credential in the **OS keychain** — never in the browser, never in plaintext on disk.
It carries no source, no build engine, no stories, and never imports the agent (ADR-0090 d.4 / d.2).

This is **Step 1 only**: the shell + the keychain broker. Wiring the credential to the hosted worker
(Step 2) and the code-signing / notarization / auto-update pipeline are deferred (see ADR-0109).

## What is proven where

- **The provable core (red→green, runs in CI):** the credential broker's keychain round-trip,
  dual-credential support, and the keychain-only safety boundary — `src/credential/*.test.ts`,
  proven offline against an in-memory `KeychainPort` fake. `pnpm --filter desktop test`.
- **Operator-attested (ADR-0070, not in CI):** the Electron shell's appearance and the real
  OS-keychain round-trip through `@napi-rs/keyring` — a headless runner has no keychain, so these
  are witnessed by running the app on a real machine.

## Layout

- `src/credential/` — the broker, the `KeychainPort` seam, the in-memory fake, and the contracts.
  No `electron`, no native, no `dom`: this is the part CI proves.
- `src/keychain/napi-adapter.ts` — the real OS-keychain adapter (`@napi-rs/keyring`).
- `src/oauth/login.ts` — the subscription-login seam; the live embedded OAuth handshake is the
  operator-attested follow-on behind it.
- `electron/main.ts` + `electron/preload.ts` — the shell: loads `apps/studio/dist`, brokers the
  credential over IPC, and exposes a renderer bridge that can never read the raw token back.

## Run it (operator attestation)

```sh
pnpm --filter studio build          # produce the compiled bundle the shell loads (apps/studio/dist)
pnpm rebuild electron               # fetch the Electron binary if a prior install skipped its build script
pnpm --filter desktop start         # launch the shell (electron + tsx)
```

The keychain holds nothing private from the repo's point of view: the credential is the member's own
Claude token, entered at runtime and stored in the OS keychain by the broker.
