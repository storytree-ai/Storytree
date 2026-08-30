---
id: "electron-shell"
tier: capability
story: desktop
title: "The Electron shell loads the compiled studio and wires the real OS-keychain adapter to the broker"
outcome: "The desktop shell loads the compiled studio bundle, wires the real OS-keychain adapter to the credential broker, and exposes the context-isolated `desktopAuth` preload the Credentials panel consumes."
status: proposed
# proof_mode FLIPPED operator-attested -> integration-test on 2026-08-31
# (`prove-unproven-capabilities-arc-inc-25`). Every success condition this capability attests is
# machine-observable, and the story's own UAT already says so: legs 1, 2 and 3 are all
# `witness: machine`, and leg 3 was itself flipped human -> machine on 2026-08-13 under ADR-0348 D1
# by striking the exact reasoning this file still carried. The only taste half was deleted outright
# by ADR-0348 D6. What remains is a MISSING HARNESS, not a missing compiler — and
# `machine-in-the-loop-is-the-default-human-is-the-exception` is explicit that "not yet harnessed" is
# never "not yet capable". See the adjudication note in the body.
proof_mode: integration-test
depends_on: [credential-broker]
decisions: [109, 111, 179, 348]
---

# The Electron shell loads the compiled studio and wires the real OS-keychain adapter to the broker

**Outcome —** The desktop shell loads the compiled studio bundle, wires the real OS-keychain adapter to
the credential broker, and exposes the context-isolated `desktopAuth` preload the Credentials panel
consumes.

This is the **glue that makes the desktop story real** (ADR-0109 Step 1): an Electron shell that (a)
renders the compiled studio UI and (b) supplies the real OS-keychain adapter to the
[`credential-broker`](credential-broker.md) port plus the `window.desktopAuth` preload surface the
broker's desktop-only Credentials panel calls (ADR-0179). The CI-honest core — broker contracts, typed
IPC shapes, and the panel's geometry/behaviour — is already proven on `credential-broker`; this
capability is the thin real-adapter binding plus the rendered shell.

> **Adjudicated 2026-08-31 (`prove-unproven-capabilities-arc-inc-25`) — RE-SCOPED: `operator-attested`
> → `integration-test`. This capability was claiming a human for facts a machine can observe, and its
> own story had already said so.**
>
> The paragraph that stood here read: *"Its proof is operator-attested (ADR-0070): the native shell
> appearance and the real-OS-keychain adapter binding are witnessed by a human running a built app —
> CI cannot drive a real keychain or judge the native shell headlessly."* Four checks at source, none
> of which it survives:
>
> **(1) The story already re-classified every one of these claims as MACHINE.** `desktop`'s UAT legs
> 1 (*"the native shell renders the COMPILED studio, no Vite, no source"*), 2 (*"the credentials
> surface is one-way"*) and 3 (*"a credential survives a real restart in the OS keychain, then removes
> cleanly"*) are all `(witness: machine)` with bound proof-gates. Leg 3 carries the flip verbatim:
> *"FLIPPED `human` → `machine` 2026-08-13 under ADR-0348 D1 … The old note said the round-trip runs
> against a real OS keychain 'which a headless runner has no equivalent of' — **that is a CI
> statement, not a harness statement**."* This file was still carrying that retired reasoning.
>
> **(2) The taste half does not exist any more.** ADR-0348 D6 DELETED the experience criterion
> ("whether the result LOOKS like one coherent app"); the intent lives in the story's Design floor and
> is no longer a leg. So there is no aesthetic or owner value call left for a human to make — and
> under `machine-in-the-loop-is-the-default-human-is-the-exception` that is the only thing that would
> license one.
>
> **(3) CI does drive the native shell, today.** `apps/desktop/e2e/` launches the REAL packaged
> Electron app through `playwright-core`'s `_electron`, and `.github/workflows/e2e.yml` runs it under
> xvfb on every desktop-affecting change. And `electron/main.ts:131` constructs the broker over
> `NapiKeychain` **unconditionally** — no `STORYTREE_DESKTOP_E2E` swap, no in-memory fallback — so an
> `_electron` launch already reads and writes the real OS credential store through `@napi-rs/keyring`.
>
> **(4) It was the outlier in its own story.** Every other `desktop` capability is `integration-test`
> or `contract-test`; `credential-broker` — which this file calls "operator-attested" in two places
> below — is `proof_mode: contract-test`. This was the only `operator-attested` unit under the story.
>
> **What the flip costs and buys.** It buys nothing automatically: no proof arm is authored here and
> no harness is built, so the capability is now honestly *machine-provable and UNPROVEN* rather than
> *awaiting a signature that should never have been asked for*. Routing this to the owner was a real
> cost to him for a fact a machine can check. It also unblocks something concrete: the story's leg 1
> currently has to record *"No lower-tier node proves it … `electron-shell` is `proof_mode:
> operator-attested` and registers no `proof.real.testFile`, so there is no capability test to name"*
> — that sentence exists BECAUSE of the mode this pass just corrected.
>
> **The missing piece is one named harness, and it is a BUILD task:** an `_electron` spec asserting
> the ADR-0090 d.4 carries-no-source guard (no `/@vite/client`, no `/src/**` request, only the hashed
> `/assets/*.js` bundle), and a two-launch spec storing through `desktopAuth`, relaunching, reading
> the boolean status back, and removing. `apps/desktop/e2e/session-survival.e2e.mjs` already launches
> and closes cleanly in its `finally`; nothing stops a spec launching twice. **This is NOT an
> ADR-0466 case** — the harness is ours to build and runs on our own machine; no outside system has to
> publish a result back.

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

## Integration test

**Goal —** Prove what the shell itself owns, on a real launched app: that it serves the COMPILED
studio and nothing else, and that the credential path it wires reaches the REAL OS credential store
and survives a genuine process restart. The Credentials panel's one-way store geometry and
boolean-only status are already contract-tested on [`credential-broker`](credential-broker.md) and are
not re-proven here.

**The observer is a machine in every leg below** — named explicitly, because each success condition
is phrased as something "observed" and the cheapest thing capable of observing would otherwise
satisfy it. The harness is `playwright-core`'s `_electron` driving the real packaged app
(`apps/desktop/e2e/`, run under xvfb by `.github/workflows/e2e.yml`), and the assertions are DOM,
network and keychain reads — no human looks at anything.

1. **Carries no source (ADR-0090 d.4).** Launch the packaged app; the Electron main serves the
   compiled studio dist over `127.0.0.1` and navigates the window there off its launch page.
   **Success —** the window reaches an `http://127.0.0.1:<port>` origin with `document.readyState ===
   "complete"`, the renderer mounts the real studio SPA, and the loaded document references ONLY the
   built hashed `/assets/*.js` bundle — no `/@vite/client`, no dev-server module graph, no `/src/**`
   request.
2. **The real keychain round-trip survives a restart.** Store a credential of each kind through the
   context-isolated `desktopAuth.store(kind, value)` IPC, replace one, close the app and launch it
   again, read the boolean status back, then remove through sign-out. **Success —** the replacement is
   still held after the second launch and is gone after the removal, observed through the shell's own
   `NapiKeychain` binding against the real OS credential store — `electron/main.ts:131` constructs the
   broker over `NapiKeychain` unconditionally, with no e2e swap and no in-memory fallback, so this
   exercises the real adapter and not a fake.
   ⚠ **A note for whoever writes it, because it is the journey and not a defect:** `main.ts:131` takes
   the default `storytree-desktop` service namespace, so a run against the default namespace clears
   the operator's own desktop credentials. Use a distinct service namespace, or accept the re-entry.
3. **Nothing reads back into the renderer.** **Success —** no renderer-reachable surface returns the
   stored value: `status` is boolean-only, the password input and any renderer-held copy clear in
   `finally`, and the raw credential exists only transiently between typing and the one-way store IPC.

**NEITHER SPEC EXISTS YET, and that is the whole of what is missing.** The harness they need is
already built and already launches this app; `session-survival.e2e.mjs` launches once and closes
cleanly in its `finally`, and nothing stops a spec launching twice. No capability declares
`apps/desktop/e2e/**` as a `proof.real.testFile` today, so `resolveWitness` can point at nothing —
which is why the story's legs 1–3 are bound-but-red rather than green. Writing these two specs and
registering one as this capability's proof arm is the build task that closes it.

*(This section replaced a "Proof — operator-attested (ADR-0070)" section on 2026-08-31 — see the
adjudication note above. That section opened "There is no isolatable red→green CI test for a built
native shell talking to a real OS keychain", which was a CI statement rather than a harness statement
and was false on both halves by the time it was read: CI drives this shell under xvfb, and the shell's
keychain binding is the real one. It also described the panel's two-kind journey as rolled up under
"`credential-broker`'s operator-attested leg", but `credential-broker` is `proof_mode: contract-test`
and has no operator-attested leg.)*
