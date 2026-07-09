---
status: accepted
decided: 2026-07-05
load_bearing: true
---
# ADR-0164: The desktop app self-restarts to apply a merged fix: the Electron main process is the supervisor, triggered on a git-HEAD advance, never on a merged branch or the running sidecar

## Status

accepted (2026-07-05) — decided/directed by the owner in conversation on 2026-07-05, as a retro
follow-on to the ADR-0160 actuator's first live drive: the desktop orchestrator can now *land* a fix
(ADR-0152) but has no way to *apply* it. Design-time alignment IS the ratification (ADR-0110); no
second end-of-flow ask. Sets the frame + safety rails; the mechanism is built by a chipped session
(ADR-0163's dogfooding discipline). Stands on ADR-0152 (the landing surface) and ADR-0109 (the Electron
shell).

> **Amended by [ADR-0174](0174-interactive-builds-run-in-an-in-app-terminal-not-the-in-app.md)**
> — only the **interactive-chat Phase 2 signaller goes moot** (the in-app chat watching its own PR
> merge, then signalling the supervisor): ADR-0174 retires that interactive runtime for an embedded
> terminal. **Rail 1** (the Electron main process is the supervisor, never the sidecar), **Rail 2**
> (the trigger is a git-HEAD advance to merged `main`, never an un-merged branch), **Phase 1**
> (owner-triggered rebuild + relaunch), and any **headless/autonomous apply** are untouched — a
> non-interactive signaller can still drive Phase 2. Only the *interactive* premise of the Phase 2
> trigger retires.

## Context

The storytree Electron desktop app serves a **built** studio `dist` and runs the sidecar
(`apps/desktop/electron/backend-entry.ts`) from the checkout. A fix the desktop orchestrator lands does
**not take effect** until someone rebuilds (`pnpm --filter studio build` + `build:electron`) and
relaunches the app — the *studio-version-skew* trap (the app runs stale code after the checkout moves
under it). The app already **detects** this: `/api/health` stamps the checkout's git-HEAD, and the
studio banners *"checkout MOVED under the running server"* when it drifts. What is missing is the
**action** — turning that detection into an applied rebuild.

This is the last un-closed mile of the desktop drive loop: ADR-0152 gave the desktop orchestrator the
merge ceremony (land a fix), but land → **apply** is still a manual `studio:down`/`up` + rebuild dance.
The owner asked whether the orchestrator can self-restart the app to rebuild-and-apply. Two risks the
owner named shape the whole design:

- **Restarting the process you run in.** The orchestrator lives in the sidecar; it cannot cleanly
  restart the sidecar from inside it.
- **Applying un-merged code.** "I opened a PR" is not "the fix is live" — rebuilding then would apply
  CI-unproven surface. The honest signal is the fix **merged to main and the checkout fast-forwarded**.

## Decision

**The desktop app gains a self-restart-to-apply capability, governed by two hard rails and built in two
phases.**

**Rail 1 — the supervisor is the Electron main process, never the sidecar.** The Electron main process
spawns the sidecar and can `app.relaunch()`; it is the only process that can rebuild + relaunch without
killing the thing issuing the command. The orchestrator (in the sidecar) **signals**; the main process
**executes** the rebuild + relaunch. The orchestrator never restarts itself.

**Rail 2 — the trigger is a git-HEAD advance to merged `main`, never a PR-opened or un-merged branch.**
The rebuild always targets the **current checked-out `main`** (fast-forwarded after the PR merged), so
it can only ever apply CI-proven, merged code — and it rebuilds *whatever main is now*, not a stale
merge commit, so a later main commit that regressed the fix is also picked up. The `/api/health`
git-HEAD stamp is the existing signal; the trigger is "HEAD moved to a new main," not "my PR exists."

**Phase 1 — owner-triggered (no dependencies).** An owner-facing *"checkout moved — rebuild &
relaunch"* affordance in the desktop app (surfacing the existing git-HEAD-drift banner as an action),
executed by the Electron main process. This kills the version-skew trap for the human — one click
instead of a manual `studio:down`/`up` + rebuild — and is the safe, always-human-in-the-loop baseline.

**Phase 2 — autonomous (depends on the CI-watch gap, ADR-0163 Gap B2).** After the orchestrator has
**watched its PR merge** (the CI-watch affordance) and **pulled main**, it signals the supervisor to
rebuild + relaunch — never applying un-merged code (Rail 2), never restarting itself (Rail 1). Phase 2
is unreachable until CI-watch lands, which sequences the two: CI-watch first, autonomous apply after.

## Consequences

**Good.**
- Closes the desktop drive loop's last mile: land → **apply**. The version-skew trap becomes a
  one-click recovery (Phase 1), then an automatic one (Phase 2).
- The two rails make it safe by construction: it can only apply merged, CI-proven `main`, and it never
  restarts the process running the orchestrator.

**Bad / open.**
- A supervisor that rebuilds + relaunches is real surface: a failed rebuild must leave the app in a
  known state (stay on the old build, surface the error — fail-closed), and relaunch races must be
  handled.
- A rebuild takes minutes (`studio build` + `build:electron`); the app is briefly down. Acceptable for
  an apply-a-fix action, but it is not instant.
- Phase 2 depends on Gap B2 (CI-watch) — deliberate sequencing, recorded so it is not built out of
  order.

## References

- ADR-0163 — the dogfooding maturation practice; this capability is one identified gap, and its
  Phase 2 depends on that ADR's Gap B2 (CI-watch). Chipped + implemented under its discipline.
- ADR-0152 — the desktop landing surface (land a fix); this ADR closes the land → apply mile.
- ADR-0109 — the Electron Step-1 shell + its traps (can't run `.ts`, `getAppPath`, serving `dist` over
  http) — relevant to the main-process supervisor wiring.
- The studio-version-skew trap + the `/api/health` git-HEAD stamp (CLAUDE.md "checkout MOVES under the
  running server" banner) — the existing detection this ADR turns into an action.
- Code: `apps/desktop/electron/` (the main process — the Phase-1 supervisor), `backend-entry.ts` (the
  sidecar that signals in Phase 2), `apps/studio/server` (`/api/health` git-HEAD stamp).
