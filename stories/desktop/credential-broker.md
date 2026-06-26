---
id: "credential-broker"
tier: capability
story: desktop
title: "The credential broker round-trips the Claude credential through a narrow keychain port, never leaking it"
outcome: "The member's Claude credential round-trips the OS keychain through a narrow port and is never written to localStorage or to plaintext disk."
status: proposed
proof_mode: contract-test
depends_on: []
decisions: [109, 111]
---

# The credential broker round-trips the Claude credential through a narrow keychain port, never leaking it

**Outcome —** The member's Claude credential round-trips the OS keychain through a narrow port and is
never written to `localStorage` or to plaintext disk.

This is **the provable core of the desktop story** (ADR-0109 Step 1): the credential-handling logic,
factored so it can be proven in isolation without a real OS keychain. The broker speaks to a narrow
**`KeychainPort`** (`set` / `get` / `delete` verbs) rather than to any concrete secret store. In CI
the port is an injected in-memory fake — headless CI has no real keychain — so every contract below is
**offline / CI-safe**. The thin glue that binds the port to the real platform keychain
(`@napi-rs/keyring`) is NOT proven here: it is operator-attested under [`electron-shell`](electron-shell.md)
(ADR-0070), where a human witnesses a real round-trip.

## Guidance

- **The `KeychainPort` seam is what makes these contracts CI-runnable.** Define the port as a narrow
  interface (`set(account, secret)`, `get(account)`, `delete(account)`), inject it into the broker,
  and pass an in-memory fake in the tests. The broker has NO dependency on `@napi-rs/keyring` or any
  OS API — only on the port. This is the standalone-resilient-library shape: a small load-bearing
  surface, exercised end-to-end by tests, behind a thin adapter the shell supplies.
- **Two credential kinds, tagged.** The broker stores/reads BOTH `CLAUDE_CODE_OAUTH_TOKEN` (the
  subscription token) and `ANTHROPIC_API_KEY`, each under its own account key so a read for one kind
  never returns the other. A `kind` discriminator travels with each stored credential.
- **The keychain port is the ONLY storage path — this is the safety boundary.** The broker writes the
  credential to nothing else: it holds no `localStorage` reference and writes the token to no file.
  The `keychain-only-no-leak` contract guards this structurally/behaviourally (e.g. a probe that
  records every sink the broker touches and asserts the keychain port is the sole one).
- **What is NOT proven here (honest scope).** The real `@napi-rs/keyring` adapter — actually writing
  into Keychain / Credential Manager / libsecret — is thin glue proven by **operator attestation**
  (ADR-0070), not by a CI test; it round-trips a real OS keychain that CI cannot drive. That
  attestation lives on [`electron-shell`](electron-shell.md). Keep these contracts pointed at the
  injected port only.

## Contracts (3)

1. **`keychain-round-trip`** — store-then-read returns the same token; clear-then-read returns null
   - **asserts —** through an injected `KeychainPort` (an in-memory fake in the test): after
     `store(token)`, `read()` returns exactly that token; after `clear()`, `read()` returns `null`.
     The credential survives the store/read cycle byte-for-byte and is genuinely removed on clear.
   - **proven by —** an isolated unit test driving the broker against the in-memory `KeychainPort`
     fake (no real keychain, no OS API); the spine observes the red (a broker with no store path, or
     a `read()` that does not reflect a prior `store()`) before the implementation lands.

2. **`dual-credential`** — both credential kinds store and read back independently, each tagged
   - **asserts —** the broker stores and reads back BOTH `CLAUDE_CODE_OAUTH_TOKEN` (subscription) and
     `ANTHROPIC_API_KEY`; each is tagged with its `kind`; reading one kind returns that kind's value
     (and its tag), never the other kind's; clearing one kind leaves the other intact.
   - **proven by —** the same isolated unit test surface against the injected port: store two
     differently-kinded credentials, assert each reads back independently with its correct tag.

3. **`keychain-only-no-leak`** — the keychain port is the broker's SOLE storage sink (the safety boundary)
   - **asserts —** the broker's only credential-storage path is the `KeychainPort`: storing a
     credential routes the secret to the port and to NOTHING else — it holds no `localStorage`
     reference and writes the token to no file. A structural / behavioural guard: with the credential
     stored, the only sink that received the raw secret is the injected keychain port.
   - **proven by —** an isolated unit test using an injected port plus instrumented / asserted-empty
     alternative sinks (a fake `localStorage` and a fake filesystem the broker is wired to observe
     receiving nothing); the spine observes the red (a broker that also writes the secret to a file or
     to `localStorage`) before the no-leak implementation lands.
