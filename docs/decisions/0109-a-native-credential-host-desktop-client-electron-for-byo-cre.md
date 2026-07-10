---
status: accepted
decided: 2026-06-25
amends: [90]
load_bearing: false
---
# ADR-0109: A native credential-host desktop client (Electron) for BYO-credential delivery

## Status

accepted — owner-decided 2026-06-25, ratified after review 2026-06-26 in session, on feedback from the dev circle that they want a
desktop app. Scoped to a **credential-hosting thin client** (Electron chosen), NOT the engine-bundling
app ADR-0090 rejected. Amends ADR-0090 by promoting its "optional native wrapper" to the sanctioned
BYO-credential delivery vehicle for the hosted phase. The client's APPEARANCE is operator-attested
under ADR-0070 when built.

**Correction (2026-07-10, per
[ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):**
[ADR-0177](0177-open-the-leaf-runtime-seam-to-cursor-while-keeping-the-deter.md) admits Cursor as a
second live harness and requires `CURSOR_API_KEY`. The credential-host boundary decided here is
unchanged; the stale two-Claude-kind wording is corrected below to include the independently
namespaced Cursor key and operation-specific selection.

[ADR-0179](0179-desktop-credentials-are-configurable-through-the-storytree-u.md) further amends this
decision by requiring the desktop app to expose the broker through a desktop-only Credentials panel.
It also makes the renderer boundary precise: a raw credential may exist transiently in a password
input and cross the context-isolated store IPC once, but it is never persisted in, returned to, or
recoverable from the renderer.

## Context

ADR-0090 split orchestration into a thin client + a server-side build-capable worker, with three
load-bearing guards: the **source stays server-side** in every phase (d.4), **BYO-credential is
client-held, passed to the worker per build over TLS, never persisted server-side** (d.3), and the
**client never imports the agent** (d.2). It demoted Electron from "the plan" to "an optional native
wrapper of the thin client later," because an app that bundles the build engine + the private source
SHIPS the source (an `.asar` unpacks trivially) — packaging is not source protection.

The dev circle has since asked for a desktop app. The driving need is **credential handling**, not
bundling the engine:

- The **subscription** OAuth token (`CLAUDE_CODE_OAUTH_TOKEN`) is long-lived and refreshes. A browser
  tab cannot hold it safely — `localStorage` is XSS-exposed and is not a secret store — so a
  pure-browser circle is effectively pushed onto metered API keys, or onto re-pasting a token each
  session.
- A **native shell** can run the Claude login (OAuth) flow and keep the credential in the **OS
  keychain** (Keychain / Credential Manager / libsecret), the same posture Claude Code's own app uses,
  then broker it to the worker per build.

That is precisely the *credential-host wrapper* ADR-0090 anticipated — not the *engine-bundling* app it
rejected. Bringing it back is exercising the option ADR-0090 parked, not reopening the rejected design.

## Decision

1. **Ship a thin native desktop client (Electron).** It renders the SAME compiled studio frontend bundle
   and carries NO source, NO build engine, NO stories — only the compiled UI (ADR-0090 d.4 preserved).

2. **Its added job over the browser is credential hosting.** It stores the member's credentials in the
   **OS keychain** as independently namespaced kinds: `CLAUDE_CODE_OAUTH_TOKEN` (subscription — runs
   the login + refresh flow), `ANTHROPIC_API_KEY`, and — under ADR-0177 — `CURSOR_API_KEY`. It brokers
   only the credential requested by an operation; a Claude build may select only the first two, while
   a Cursor operation may select only `CURSOR_API_KEY`. The credential is never persisted server-side
   (ADR-0090 d.3 preserved).

3. **The client never imports the agent and holds no model path** (ADR-0090 d.2 / ADR-0004). A build is
   still requested as an INTENT over the gated API; the worker is the single orchestrator boundary. The
   same broker serves the future chat-orchestration runtime (ADR-0108) when hosted.

4. **Electron over Tauri.** Stay all-TypeScript / Node (ADR-0001 — avoid a Rust island the rest of the
   stack would have to reach across); the team knows it. The larger renderer surface is bounded by
   keeping the stored credential in the OS keychain: it is **never persisted in, returned to, or
   recoverable from the renderer**. Under ADR-0179, a raw credential may exist transiently while the
   operator types it into a password input and may cross the context-isolated store IPC once; it is
   cleared after submission and never enters `localStorage`. The credential's safety rests on
   keychain isolation + the renderer never holding source.

5. **An additional surface, not a replacement.** The browser thin client stays fully valid (no keychain;
   paste-per-session or API-key); the desktop client is the safe home for the **subscription** path.

6. **Amends ADR-0090.** Its "optional native wrapper, later" is promoted to the sanctioned BYO-credential
   **delivery vehicle** for Phase 3 (hosted, circle). ADR-0090's client/worker split, source-server-side,
   per-build-TLS credential, and no-agent-on-client guards all stand unchanged.

## Build (small, two steps)

- **Step 1 — the shell + keychain broker + Credentials panel.** An Electron shell that loads the
  compiled studio bundle, exposes the broker through the desktop-only Credentials panel in that UI
  when `window.desktopAuth` is present (ADR-0179), and stores / reads each tagged credential in the
  OS keychain (the subscription OAuth flow may still run from the shell). Provable: each kind
  round-trips independently and never touches `localStorage` or plaintext disk; the panel's geometry/
  behaviour is CI-tested against an injected `desktopAuth` fake (ADR-0179 §5).
- **Step 2 — wire to the operation.** The shell injects only the selected credential for the lifetime
  of the requested operation. For the inner-circle phase this is local and in-process; the deferred
  hosted form sends it per operation over TLS to the worker.

  **Earlier correction (2026-07-02, per
  [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):** Step 2 was
  **redefined by [ADR-0113](0113-thick-local-desktop-for-the-inner-circle-the-drive-machinery.md) §5**
  for the inner-circle phase — the worker boots locally, so the hand-off is local and in-process on the
  member's machine (no TLS hop, no server-side persistence) — and is now **BUILT**: the keychain-held
  credential is fed per-build into the main-owned backend sidecar
  ([ADR-0119](0119-thick-local-desktop-backend-a-tsx-sidecar-serving-the-studio.md)) via
  `apps/desktop/src/backend/credentialed-build-runner.ts`. The keychain posture and d.4 renderer
  isolation stand; the over-TLS form returns only with the deferred hosted phase (ADR-0090 Phase 3 /
  ADR-0108 Phase 5).

## Consequences

**Good**
- Devs use their Claude subscription safely (keychain-held OAuth), instead of being forced onto a
  metered API key or re-pasting a token.
- Cursor credentials use the same OS-keychain safety boundary without becoming valid Claude
  credentials or entering an unrelated operation.
- No long-lived owner credential sits in the cloud; each member funds their own usage (ADR-0090's BYO
  posture, delivered).
- ADR-0090's source-server-side and worker-is-the-boundary guards hold unchanged — the desktop client
  carries nothing private.

**Bad / accepted costs**
- A per-platform native pipeline: build, code-sign (Apple notarization, Windows Authenticode), and
  auto-update — real operational surface a browser tab does not have.
- Electron's larger RCE surface; the mitigation (keychain isolation, no stored-credential readback,
  no renderer persistence or post-submission retention, and no renderer-held source) must be enforced
  and not eroded.

**Neutral**
- The toolkit is Electron; a future move to Tauri is not foreclosed, just not planned.
- The browser remains a valid client for the API-key path and for members who do not want a native
  install.

## Open calls (settle when built)

- Auto-update channel and code-signing / notarization certificates — who holds them, how they rotate.
- Whether the desktop client also wraps a richer native experience (menus, OS notifications) or stays a
  minimal credential shell first (lean: minimal first).

## References

- [ADR-0090](0090-ui-driven-orchestration-hosted-build-capable-backend-thin-cl.md) — thin client +
  server-side worker; **amended** (its optional native wrapper becomes the sanctioned BYO-credential
  delivery vehicle; all its guards stand).
- [ADR-0004](0004-orchestrator-agent-boundary.md) — the orchestrator/agent boundary; the client never
  crosses it.
- [ADR-0001](0001-foundational-stack.md) — the all-TypeScript stack; the reason to prefer Electron over
  a Rust shell.
- [ADR-0108](0108-chat-driven-orchestration-a-server-side-session-orchestrator.md) — the chat-orchestration
  runtime the same credential broker serves when hosted.
- [ADR-0042](0042-hosted-studio-demo-cloud-run-iap.md) — the hosted studio + IAP the desktop client
  signs into.
- [ADR-0177](0177-open-the-leaf-runtime-seam-to-cursor-while-keeping-the-deter.md) — admits Cursor as a
  second live harness and requires the independently selected `CURSOR_API_KEY`.
- [ADR-0179](0179-desktop-credentials-are-configurable-through-the-storytree-u.md) — requires the
  desktop-only Credentials panel and narrows the renderer boundary to permit only transient password
  entry and one-way store submission, never persistence or readback.
- [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md) — permits this
  in-place truth-maintenance correction because the credential-host decision did not change.
