---
status: accepted
decided: 2026-07-09
supersedes: [119]
load_bearing: true
---
# ADR-0176: The desktop app requires a reachable DB and a git checkout to launch — retire the degraded read shell

## Status

accepted (2026-07-09) — decided/directed by the owner in conversation on 2026-07-09, out of a
root-cause session on the recurring *"UAT tests unavailable: unknown endpoint"* bug in the desktop
app. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask. **Supersedes
[ADR-0119](0119-thick-local-desktop-backend-a-tsx-sidecar-serving-the-studio.md) in full** under
ADR-0139's binary lifecycle: this replacement retires 0119's launch-time
*degrade-to-a-read-shell* posture and carries forward its still-live tsx-sidecar architecture, boot
read route table, re-compose-not-import boundary, and proof split in Decisions 3–5 below. The
APPEARANCE of the block / refuse experience remains operator-attested (ADR-0070).

## Context

The recurring desktop bug — *"UAT tests unavailable: unknown endpoint"* — traces to the sidecar
treating a live store as OPTIONAL at launch. `main()` in `apps/desktop/electron/backend-entry.ts`
calls `acquireBackendStore(() => createPool())`; on failure it runs `serveDegraded()` — a read-only
shell that **hand-re-mounts a SUBSET** of the real routes (`me`/`docs`, empty `comments`, and a
*hand-rolled* `/api/attestations` without the verdict overlay) while `chat`/`build`/`spawn` silently
404. That degraded shell is a **second, drifting copy** of the backend — exactly where routes go
missing (commit `f79fdfd` had to separately add `/api/attestations` to it "rather than 404-ing"). The
window opened into this half-wired state, and because the desktop `/api/me` still returns
`member: true` with `storeUnreachable` unset, the **forest RENDERED** with no proof overlays and a bare
"unreachable" strip — an honest-looking app that was not actually wired. This is the ADR-0119-realized
posture (`/api/health` NEVER 503; degrade to a read shell with a Start-DB banner), which extended
ADR-0033's per-read advisory-null contract all the way to pool CREATION.

The git repo was ALSO effectively optional: the code-stamp freshness signal
(`apps/desktop/src/apply/code-stamp.ts` `gitHead` → `git rev-parse HEAD`) returns `null` when there is
no repo, so ADR-0164's *"checkout moved → rebuild & relaunch"* trigger silently never fires and a stale
build runs invisibly. The desktop runs a **dev-mode build from the member's checkout** (ADR-0113 §7),
so a git checkout is a real architectural precondition today, not an optional nicety.

ADR-0119 had already settled the sidecar's viable topology and the minimum read surface the studio
needs to boot. Those findings remain constraints on the replacement: the CJS Electron main cannot
bundle the raw-TS drive machinery without breaking `import.meta`; the studio boot-gates on `/api/me`
and loads docs/assets/comments together; and the desktop may re-compose organism packages but may
not import `apps/studio/server`. The re-decision is the launch posture, not those constraints. Because
ADR-0139 no longer permits an accepted ADR to remain "live in part", this ADR repeats the still-live
decisions explicitly and supersedes ADR-0119 as one complete current decision.

Two facts made "require it" cheap and safe:

- `@storytree/drive`'s **`ensureLiveDb`** (ADR-0060 / ADR-0063) already does exactly the wanted launch
  behavior: probe the live store, **auto-wake** it via the keyless Cloud SQL Admin REST control plane
  (`setActivationPolicy("ALWAYS")` — ADR-0063 / ADR-0021, no gcloud, works on the desktop), and **poll
  until it accepts connections or a bounded ceiling**, then refuse with a clear reason. Its
  `ensureDbUp` core is pure over injected effects (fake-clock unit-tested). *(Correction, 2026-07-30
  per ADR-0139: this read "a bounded 420 s ceiling". The bounded-then-refuse behaviour this decision
  rests on is unchanged; the default was raised 420 s → 600 s because 420 s abandoned cold starts the
  tool itself called normal, and an exhausted deadline now refuses as either "still warming" —
  re-probe, never re-start — or "genuinely unreachable". ADR-0060 carries the raise.)*
- The Cloud SQL data socket the probe needs is reachable from a real desktop machine; only
  **REMOTE web/VM sessions** can't open it — and those never run the desktop Electron sidecar. So a
  hard DB requirement is naturally **scoped to the real desktop app** and cannot brick remote sessions
  or the DB-free CI. *(Correction, 2026-07-27 per ADR-0139: this read "port 3307 … (443-only egress,
  ADR-0063)". The scoping conclusion stands, the mechanism was wrong —
  [ADR-0250](0250-remote-sessions-are-offline-only-the-fence-is-tls-re-termina.md) measured that the
  proxy CONNECT-tunnels arbitrary ports and the real fence is TLS re-termination plus a policy that
  excludes client-mTLS / raw-TCP databases, so no port forward can ever reach it.)*

## Decision

**The desktop app HARD-REQUIRES a reachable DB and a git checkout to launch. There is no degraded read
shell.**

1. **Block-until-ready with a bounded auto-wake, then refuse** (owner UX call, 2026-07-09). At launch
   the sidecar runs a launch-precondition gate:
   - **Git checkout first** — if `git rev-parse HEAD` fails (no repo), refuse immediately with *"run
     storytree from a git checkout"* (waking the DB would be pointless, and re-probing on Retry is the
     only path that helps).
   - **DB reachable, auto-waking** — reuse `ensureLiveDb`: probe → if down, wake via REST → poll until
     it answers or the bounded ceiling (600 s default) elapses. The app **attempts to wake the DB on
     launch** (owner directive); the ceiling is the *"put a timeout / max retries on it"* the owner
     asked for — a cold Cloud SQL start (~5–6 min) fits inside it, and a genuinely unreachable DB
     **refuses rather than hanging forever**.

   The gate returns a typed outcome: `ready` | `refused { unmet: "git-repo" | "db", reason }`.

2. **The full backend is wired ONLY when both preconditions hold — one route table, never a partial
   copy.** `serveDegraded` / `degradedBackend` are **deleted**. On a refusal the sidecar exits with the
   typed reason (surfaced through `describeSidecarExit`); it never serves a subset of routes. This is
   the change that kills the drift class — there is now exactly one fully-wired backend, or none.

3. **The backend remains a main-owned `tsx` sidecar, never a bundled-in-main server.** The Electron
   main spawns a child Node process through the Electron binary in Node mode
   (`ELECTRON_RUN_AS_NODE=1`, `--import tsx`), proxies `/api/*` to its `127.0.0.1` port, and reaps it
   on quit. This preserves real `import.meta` for the raw-TS drive/library machinery and preserves the
   ADR-0004 boundary by topology: the renderer never imports `@storytree/agent`.

4. **The one full backend serves the studio BOOT read set and re-composes packages, never the studio
   server.** The boot READ set remains `me` / `health` / `docs` / `tree` / `assets` / `comments`;
   later build/adopt/chat routes layer onto that same backend. The desktop owns its router and
   re-composes `@storytree/drive`, `@storytree/orchestrator`, and `@storytree/library/store` exactly as
   the studio backend does, but never imports `apps/studio/server`. Verbatim route-table sharing remains
   a possible consolidation, not part of this decision.

5. **Keep the proof split honest.** Pure routing and launch-gate behavior are headlessly proven over
   injected seams. The Electron sidecar spawn/proxy/lifecycle and splash/refuse window are
   operator-attested integration glue (ADR-0070); a headless test does not pretend to prove a native
   shell.

6. **The Electron main process is the launch surface** (Rail 1, ADR-0164). While the sidecar comes up
   it shows a *"starting — connecting to the database"* splash (the block-until-ready surface); on the
   port handshake it loads the studio (fully wired); on a **pre-handshake sidecar exit** it shows a
   clear **refuse screen** naming the unmet precondition with a **Retry** that re-runs the gate. No
   half-wired forest, ever. The splash / refuse window flow is the operator-attested glue (the look),
   like the rest of the sidecar wiring (Decision 5).

7. **Scope: the DESKTOP launch posture only.** ADR-0033's per-read advisory contract is **unchanged for
   a running app** — a DB that blips MID-SESSION still nulls overlays (the tree under-claims, never a
   throw). What changes is LAUNCH: you cannot START half-wired. Remote web/VM sessions (ADR-0063) and
   the DB-free blocking gate (`pnpm gate`) never run this sidecar, so the requirement cannot brick them.

   > **Correction (2026-07-15, test-seam — not a re-decision).** One CI path DOES drive the real
   > Electron shell with no DB — the `e2e-desktop` suite — and this ADR's fail-closed boot wedged it
   > (the sidecar exited pre-handshake in the bare container; each failed spec launch leaked a live
   > Electron that hung `node:test`: the 2026-07-10..14 e2e hang PR #661's boot introduced). The seam:
   > a **test-only e2e mode** in the Electron main (`STORYTREE_DESKTOP_E2E`, set by
   > `apps/desktop/e2e/*` ONLY, never by the app) that **never spawns this sidecar at all** — it
   > serves the launch checkout's studio dist directly (the static server's no-sidecar `/api` 503
   > fallback already existed), because the e2e specs stub every `/api` read and test the renderer +
   > main-process pty, not the backend. The sidecar's own launch posture — this ADR's fail-closed
   > hard-require (Decisions 1–2) — is untouched on every path that actually boots the sidecar.

## Consequences

**Good.**
- Kills the drift class: the degraded shell was a second, hand-maintained route table that silently
  lost routes (the "unknown endpoint" bug). Deleting it means there is exactly one fully-wired backend
  or none — the failure mode is impossible by construction.
- ADR-0164's rebuild-on-HEAD-advance signal becomes reliable: a git checkout is guaranteed, so the
  code-stamp always resolves.
- Reuses `ensureLiveDb`'s proven auto-wake + bounded-wait (ADR-0060 / ADR-0063) rather than reinventing
  a retry loop — the launch gate is a thin, headlessly-provable composition (git-gate → `ensureDb`).
- Preserves the only viable raw-TS topology and the complete boot read surface established by
  ADR-0119, now in the same current decision as the launch gate.

**Bad / accepted costs.**
- A cold DB start adds a visible wait (up to the ceiling) before the app is usable — surfaced as a
  splash, bounded, then refuse+retry. Acceptable: the alternative was an app that LOOKED up but wasn't.
- A genuinely-offline member cannot open the desktop app at all (by design — it is a thick client over
  the shared forest, ADR-0113). Offline READ is the CLI's job (in-memory seed), not the desktop app's.
- The splash + refuse+retry window flow is new operator-attested glue (the look), owner-attested per
  ADR-0070.
- The main owns a second process (spawn, handshake, proxy, reap), and the desktop still duplicates a
  slice of the studio's read handlers. Those remain accepted costs; a shared read-route organism is a
  separate consolidation.
- A future **packaged** desktop build (past dev-mode-from-checkout, ADR-0113 §7 / ADR-0119) would
  revisit the git-checkout requirement (a precompiled sidecar has no checkout); today's decision is
  scoped to the dev-mode-from-checkout app that ships now.

## References

- [ADR-0119](0119-thick-local-desktop-backend-a-tsx-sidecar-serving-the-studio.md) — **superseded in
  full** under ADR-0139's binary lifecycle. Its rationale remains browsable history; Decisions 3–5
  above carry forward its still-live sidecar topology, boot read set, re-compose-not-import boundary,
  and proof split while Decisions 1–2 and 6–7 replace its degraded-launch posture.
- [ADR-0033](0033-session-presence-notice-board.md) — the per-read advisory-null contract is unchanged
  for a RUNNING app; only launch-time degrade is retired.
- [ADR-0164](0164-the-desktop-app-self-restarts-to-apply-a-merged-fix-the-elec.md) — Rail 1 (the
  Electron main is the supervisor / launch surface) is honored; requiring a git checkout makes Rail 2's
  HEAD-advance trigger reliable.
- [ADR-0060](0060-live-and-real-builds-own-the-database-default-store-pg-auto.md) /
  [ADR-0063](0063-db-control-over-the-cloud-sql-admin-rest-api-retire-the-gclo.md) — `ensureLiveDb`
  (probe → auto-wake → bounded poll) is reused as the DB half of the launch gate; keyless REST works on
  the desktop.
- [ADR-0021](0021-keyless-agent-session-auth-and-db-bootstrap.md) — the auto-wake + probe authenticate
  via ambient ADC; unchanged.
- [ADR-0113](0113-thick-local-desktop-for-the-inner-circle-the-drive-machinery.md) — the desktop runs
  dev-mode from the member's checkout (the git-checkout precondition) and is a thick client over the
  shared forest (why offline launch is out of scope).
- [ADR-0174](0174-interactive-builds-run-in-an-in-app-terminal-not-the-in-app.md) /
  [ADR-0175](0175-repurpose-don-t-delete-the-in-app-orchestrator-chat-infrastr.md) — the concurrent
  desktop pivot (retire the in-app interactive orchestrator for an embedded terminal; repurpose the chat
  infra into a future `app-guide`). ORTHOGONAL: this launch gate protects the **observability sidecar**
  (forest / wisps / verdicts / presence), which both ADRs KEEP — and the embedded terminal runs Claude
  Code against the repo, which needs the git checkout — so "require DB + git at launch" underpins the
  pivoted desktop too.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — owner-directed → born
  accepted.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — the block / refuse
  APPEARANCE is operator-attested.
- Code: `apps/desktop/electron/backend-entry.ts` (`main()` gate replacing `serveDegraded`),
  `apps/desktop/src/backend/sidecar-startup.ts` (`degradedBackend` removed),
  `apps/desktop/electron/main.ts` (splash + refuse+retry window flow),
  `packages/drive/src/db-control.ts` (`ensureLiveDb`, reused).
