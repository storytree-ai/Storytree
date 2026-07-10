---
status: accepted
decided: 2026-07-10
amends: [109]
load_bearing: true
---
# ADR-0179: Desktop credentials are configurable through the Storytree UI

## Status

accepted (2026-07-10) — decided/directed by the owner in conversation on 2026-07-10. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends ADR-0109** — credential hosting is not complete when only the Electron main/preload
plumbing exists. The Storytree desktop UI must expose the broker's store/status/sign-out operations.
ADR-0109's renderer boundary is narrowed from the over-broad phrase "never in the renderer" to:
never persisted in, returned to, or recoverable from the renderer. A raw credential may exist
transiently in the user's password input and cross the context-isolated store IPC once on submission.

## Context

PR #662 completed the safe storage core for three independently namespaced credential kinds:
`oauth`, `api-key`, and `cursor-api-key`. The Electron preload exposes a context-isolated
`window.desktopAuth` contract with `store`, boolean-only `status`, and `signOut`; the main process
stores values in the OS keychain and never returns them.

The compiled Studio renderer does not call that contract. Consequently there is nowhere in the
desktop application for an operator to enter, replace, inspect the presence of, or remove a
credential. Describing the keychain work as a usable desktop credential surface was therefore
premature: secure plumbing without an application affordance cannot complete the member journey.

The UI must not weaken the boundary to close that gap. In particular, it must not read a credential
back, pre-fill an input, persist it in browser storage, include it in application state after
submission, or log it. The existing plaintext `~/.storytree/secrets.json` tier remains a fallback and
must not be automatically migrated or deleted; removing it is a separate operator-approved action.

## Decision

1. **The Storytree desktop app gets a desktop-only Credentials panel.** It is reachable from the
   application's settings/control surface and is rendered only when `window.desktopAuth` is present.
   The hosted/browser Studio does not show non-functional keychain controls.

2. **All three brokered kinds are configurable.** The panel presents separate rows for:
   - Claude subscription token (`oauth`);
   - Anthropic API key (`api-key`);
   - Cursor API key (`cursor-api-key`).

   Each row has an ephemeral password input, a Store/Replace action, boolean-only saved/not-saved
   status, and a Sign out/Remove action. The rows never share a value or fallback into one another.

3. **Submission is one-way.** A raw value exists in the renderer only while the operator types it.
   Store sends it once through the existing context-isolated `desktopAuth.store(kind, value)` IPC,
   then clears the input and renderer state in `finally`. Status refreshes through
   `desktopAuth.status(kind): boolean`; no read, reveal, copy, export, or pre-fill path is added.
   Sign-out calls `desktopAuth.signOut(kind)` and refreshes only the boolean status.

4. **No automatic plaintext migration.** The panel neither reads nor edits
   `~/.storytree/secrets.json`. After a real OS-keychain round-trip is operator-attested, removal of
   any plaintext fallback still requires an explicit owner approval.

5. **Proof is two-stage.** CI tests the panel against an injected `desktopAuth` fake: feature
   detection, three independent rows, one-way store, input clearing on success and failure,
   boolean-only status, and per-kind sign-out. A human then attests the real desktop experience:
   enter a replacement Cursor key without disclosure, observe saved status, restart and observe the
   status persist, then remove it and observe unsigned status. No paid Cursor/model run is required.

## Consequences

**Good**
- Credential hosting becomes an actual desktop journey rather than inaccessible preload plumbing.
- The operator can replace and revoke each runtime credential independently without editing files.
- The renderer still cannot recover a stored credential; status remains boolean-only.

**Bad / watch**
- A raw credential necessarily exists transiently in renderer memory while the operator types it.
  Context isolation, password input semantics, immediate clearing, and no persistence/readback bound
  that exposure; they do not make it zero.
- The shared Studio bundle gains desktop-only UI that must remain correctly feature-gated in hosted
  and ordinary browser contexts.

**Deferred**
- Automatic migration or deletion of plaintext fallbacks.
- Provider OAuth flows, credential reveal/export, model discovery, Cursor runtime selection, and any
  authenticated or paid model run.

## References

- [ADR-0109](0109-a-native-credential-host-desktop-client-electron-for-byo-cre.md) — Electron
  credential-host boundary, amended here with the required UI and precise
  transient-entry renderer boundary.
- [ADR-0177](0177-open-the-leaf-runtime-seam-to-cursor-while-keeping-the-deter.md) — Cursor
  live-harness direction and `CURSOR_API_KEY`.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) —
  operator-attested visual and real-OS-keychain leg.
- `apps/desktop/electron/{main,preload}.ts`
- `apps/desktop/src/credential/{kinds,broker}.ts`
- `apps/studio/src` — shared renderer where the feature-gated Credentials panel lands.
