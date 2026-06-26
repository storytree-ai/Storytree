---
id: "desktop"
tier: story
title: "Desktop client — a member runs the studio natively and keeps their Claude credential in the OS keychain"
outcome: "A member runs a native desktop app that loads the studio UI and keeps their Claude credential in the OS keychain — never in the browser or in plaintext on disk."
status: proposed
proof_mode: UAT
capabilities: [credential-broker, electron-shell]
# Story-level edge: the desktop client bundles studio's COMPILED dist (studio's delivered outcome,
# ADR-0090 d.4) — the honest cross-story dependency (ADR-0058: A depends on B because A needs B's
# delivered outcome to pass A's own UAT).
depends_on: [studio]
decisions: [109, 111] # deciding ADRs (ADR-0037 §2): 0109 sanctions the credential-host Electron client; 0111 fixes Step 1's placement (apps/desktop + this story)
---

# Desktop client — a member runs the studio natively and keeps their Claude credential in the OS keychain

**Outcome —** A member runs a native desktop app that loads the studio UI and keeps their Claude
credential in the OS keychain — never in the browser or in plaintext on disk.

The deciding ADR is
[ADR-0109](../../docs/decisions/0109-a-native-credential-host-desktop-client-electron-for-byo-cre.md)
(owner-decided 2026-06-25, ratified 2026-06-26). The dev circle asked for a desktop app; the driving
need is **credential handling**, not bundling the engine. A browser tab cannot hold the long-lived
**subscription** OAuth token safely — `localStorage` is XSS-exposed and is not a secret store — so a
pure-browser circle is pushed onto metered API keys or onto re-pasting a token each session. A native
shell can run the Claude login flow and keep the credential in the **OS keychain** (Keychain /
Credential Manager / libsecret), the same posture Claude Code's own app uses.

This story is **Step 1 of ADR-0109's two-step build: the Electron shell + the keychain credential
broker** — scoped to credential hosting ONLY. Step 2 (wiring the held credential into each build
intent over TLS to the worker) and the per-platform code-signing / notarization / auto-update pipeline
are **explicitly out of scope** here; they land alongside ADR-0090 Phase 3 / ADR-0108 hosting.

## Design floor (from ADR-0109 / the guards it preserves)

- **Electron, not Tauri (ADR-0001).** Stay all-TypeScript / Node — avoid a Rust island the rest of the
  stack would have to reach across; the team knows Electron. The larger renderer surface is bounded by
  keeping the credential in the OS keychain, never in the renderer.
- **Carries the compiled UI ONLY (ADR-0090 d.4).** It renders the SAME compiled studio frontend
  bundle and carries **NO source, NO build engine, NO stories** — only the compiled studio dist. An
  app that bundled the engine + private source would ship the source (an `.asar` unpacks trivially);
  packaging is not source protection.
- **Never imports the agent, holds no model path (ADR-0004 / ADR-0090 d.2).** A build is still
  requested as an INTENT over the gated API; the worker is the single orchestrator boundary. The
  client never crosses the orchestrator/agent boundary.
- **The credential lives in the OS keychain ONLY — the safety boundary.** Never in the renderer,
  never in `localStorage`, never in a plaintext file on disk. The credential's safety rests on
  keychain isolation plus the renderer never holding source.
- **Supports BOTH credential kinds.** `CLAUDE_CODE_OAUTH_TOKEN` (the subscription path — runs the
  login + refresh flow) AND `ANTHROPIC_API_KEY` (the metered path). The desktop client is the safe
  home for the **subscription** path; the browser thin client stays fully valid for the API-key path.

## Capabilities (2)

Listed roots-first.

| # | capability | outcome | status | depends on |
|---|---|---|---|---|
| 1 | [`credential-broker`](credential-broker.md) | The member's Claude credential round-trips the OS keychain through a narrow port and is never written to localStorage or to plaintext disk. | proposed | — |
| 2 | [`electron-shell`](electron-shell.md) | The desktop shell loads the compiled studio bundle and wires the real OS-keychain adapter to the credential broker behind a sign-in affordance. | proposed | `credential-broker` |

## Story UAT (would-be)

**Goal —** A member runs the native app, signs in with their Claude subscription, and their token
is held safely in the OS keychain across restarts — never leaking to the browser or to plaintext disk.

1. **Launch:** the member opens the desktop app; it loads the compiled studio UI (no Vite, no source
   on the client). **Success —** the studio renders inside the native shell.
2. **Sign in:** the member uses the sign-in affordance and completes the Claude subscription login
   flow. **Success —** a `CLAUDE_CODE_OAUTH_TOKEN` is captured by the shell, never surfaced to the
   renderer.
3. **Keychain landing:** the captured token is stored through the broker into the OS keychain.
   **Success —** the token is readable back from the OS keychain (Keychain / Credential Manager /
   libsecret), tagged as the subscription kind.
4. **Survives restart:** the member quits and relaunches the app. **Success —** the credential is
   still present (read back from the keychain), so no re-paste / re-login is needed.
5. **No leak:** the member inspects `localStorage` and the app's on-disk profile. **Success —** the
   raw credential appears in NEITHER — not in `localStorage`, not in any plaintext file on disk.

> **Witness (ADR-0070 / ADR-0040).** The full sign-in → real-keychain → restart journey runs against
> the real OS keychain and a built native shell, which an automated CI run cannot drive headlessly —
> so this story UAT is **operator-attested** (a human runs the app and witnesses it). The CI-honest
> core of the safety claim (round-trip + dual-credential + no-leak through an injected keychain port)
> is proven in isolation by [`credential-broker`](credential-broker.md)'s contract tests.

## Open modeling calls (for the owner)

None for Step 1 — ADR-0109 resolved the shape (Electron, credential-host only, keychain isolation).
ADR-0109's two open calls (the auto-update channel + code-signing / notarization certificates, and
whether the client grows a richer native experience) belong to the per-platform pipeline and to
Step 2, both **out of scope** for this story.
