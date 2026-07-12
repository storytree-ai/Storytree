---
status: accepted
decided: 2026-07-11
load_bearing: true
amends: [164]
---
# ADR-0181: Desktop runs a pinned-main runtime worktree, decoupled from the developer checkout

## Status

accepted (2026-07-11) — decided/directed by the owner in conversation on 2026-07-11 after an
orchestrator-authored proposal (three options + recommendation). The owner chose **Option A**.
Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask. This ADR
**amends ADR-0164**: it keeps 0164's two rails and its Phase-1 owner-triggered rebuild, but makes Rail 2
*enforced by construction* rather than aspirational, and re-points the rebuild recipe at a dedicated
runtime worktree. 0164 is refined, not replaced — its owner-triggered apply affordance still stands.

## Context

The Electron desktop app (`apps/desktop`) **carries no source, no engine, no stories** — it is a thin
shell (ADR-0109 §1). At runtime it does two things, and **both** are bound to one developer checkout:

1. It **serves a pre-built studio bundle** — `main.ts` resolves `STUDIO_DIST = join(appRoot, "..",
   "studio", "dist")` and `static-server.ts` serves it over `http://127.0.0.1`. That `dist` is whatever
   `pnpm --filter studio build` last produced *in whatever checkout ran the build*.
2. It **runs the backend sidecar from that same checkout** — `main.ts` spawns
   `electron/backend-entry.ts` as **raw TS under `tsx`** (`cwd: appRoot`), executing the `@storytree/*`
   package sources live off disk. It is deliberately not bundled (esbuild-CJS empties `import.meta`,
   breaking the corpus + build paths — the ADR-0109/0119 trap).

So the desktop's running "version" is **entirely coupled to the working state of one developer
checkout** (`C:\code\storytree`) — the same directory used for active branch work. Two failures follow,
both observed 2026-07-08:

- **No pin to a known-good `main`.** When a fix lands on `main`, the desktop does not reflect it until
  someone rebuilds *from a checkout actually on that commit* and restarts.
- **The dev checkout is usually dirty.** In practice `C:\code\storytree` sits on a feature branch with
  uncommitted WIP (it was on `claude/win-arm-real-worktree-fix` with app-icon work). A naive rebuild
  there builds the **wrong code**.

The self-rebuild inherits the bug. ADR-0164 Phase 1 (`main.ts` `apply:rebuild-relaunch` +
`src/apply/rebuild.ts`) runs `pnpm --filter studio build` + `build:electron` from `appRoot`. ADR-0164
**Rail 2** *states* "the trigger is a git-HEAD advance to **merged `main`**" — but nothing enforces it:
the rebuild compiles whatever branch and WIP the checkout holds. Rail 2 is aspirational prose, not a
code invariant.

**Root cause (one sentence):** the code the desktop *runs* and the checkout a developer *works in* are
the same directory — there is no separation between "the branch I'm hacking on" and "the known-good
`main` the app should serve."

Two options were weighed and declined for this step (recorded so they are not re-litigated):

- **A CI-built, SHA-pinned studio dist** (mirroring the ADR-0093 `check:web-engine` synced-artifact
  pin) pins only the **UI dist**, not the **sidecar** — the backend would stay on the stray branch and
  could skew against the dist. To pin the backend too you must pin the whole checkout, which *is* this
  ADR. Its good idea — stamp + show the pinned SHA — is folded in below (Decision 3). It remains a
  natural *optimization on top* later (download a CI dist into the runtime worktree instead of
  building it).
- **A packaged auto-update app** (electron-builder + electron-updater) is the eventual distribution
  end-state (the ADR-0090/0109 hosted trajectory) but requires bundling the sidecar (the raw-tsx trap
  above) and, crucially, **would end the ADR-0163/0164 self-rebuild-in-place dogfood loop** — a
  packaged binary cannot `pnpm build` itself. That is a strategic pivot, not a version-management fix;
  explicitly deferred.

## Decision

**The desktop runs from a dedicated git worktree that is only ever fast-forwarded to `origin/main`,
separate from any developer working checkout. Both the studio dist and the sidecar come from that one
runtime worktree, so they can never skew.**

1. **A runtime-worktree seam.** The desktop resolves `STUDIO_DIST`, the sidecar `BACKEND_ENTRY`, and
   the sidecar `cwd` against a configured **runtime worktree path** (an env var / a small
   `desktop.runtime.json`), defaulting to a dedicated `main`-only worktree (e.g.
   `git worktree add <path> origin/main`). This is the owner's "desktop reads from `main`." A first-run
   bootstrap creates and fast-forwards it; if the configured runtime worktree is missing or not on
   `main`, resolution **fails closed** with a clear error rather than silently falling back to the dev
   checkout.

   > **Clarification (2026-07-13, bug-fix — not a re-decision).** "On `main`" here means *pinned to
   > `main`* — HEAD **equal to or behind `origin/main`** — **not** the literal local `main` branch NAME.
   > `git worktree add <path> origin/main` (the recipe above and in both guards' own messages) checks out
   > a **DETACHED HEAD** (`origin/main` is a remote-tracking ref, not a local branch), which is the
   > **canonical** runtime form: it deliberately leaves the local `main` branch name free for the
   > developer's own checkout (only one worktree may hold a given local branch). The guards therefore
   > accept **either** that detached-at/behind-`origin/main` form (`git merge-base --is-ancestor HEAD
   > origin/main`) **or** the local `main` branch (back-compat), and reject only a commit **outside**
   > `origin/main`'s history (a stray feature branch — the observed bug this guard exists for). An earlier
   > literal `branch === "main"` guard rejected the very worktree its own recipe produces; corrected in
   > `apps/desktop/src/apply/runtime-root.ts` + `packages/cli/src/desktop.ts` as a bug-fix (the decision —
   > serve a pinned, ff-only `main`-tracking worktree — is unchanged).

2. **The rebuild recipe gains a fail-closed fast-forward lead step (Rail 2, enforced).** Before the
   existing `studio build` + `build:electron` steps, the rebuild runs, in the runtime worktree:
   `git fetch origin` → `git merge --ff-only origin/main` (→ if it is **not** a fast-forward, STOP and
   surface the error — never `reset --hard` away a surprise) → `pnpm install --frozen-lockfile` *iff*
   the lockfile moved. Because the runtime worktree can only ever be fast-forwarded to `origin/main`,
   the rebuild can **only** apply CI-proven, merged `main` — **ADR-0164 Rail 2 becomes true by
   construction**, not by hope. Rail 1 (the Electron main process is the supervisor; the sidecar only
   signals) is unchanged. The steps stay fail-closed: stop on the first non-zero exit, relaunch only on
   a fully-green rebuild (ADR-0164 Consequences).

3. **Version visibility, extended.** The desktop surfaces which commit it runs and whether it is
   behind `main`. `/api/health`'s existing git-HEAD stamp (`codeStamp.ts`) — today "the checkout moved
   under the running server" (server-start HEAD vs disk HEAD) — is extended to also report the runtime
   worktree's **branch** (must be `main`) and how many commits it is **behind `origin/main`**. The
   desktop shows "running `<sha>` — N commits behind `main` · Rebuild & relaunch," turning the pinned
   SHA into a visible, actionable signal (folding in the declined CI-pin's one good idea).

4. **The packaging WIP is folded into this story as tracked surface.** The icon/launcher/packaging work
   (`apps/desktop/build/`, `launch-desktop.bat`, the `icon.ico` `main.ts` change) becomes owned,
   tracked surface under this ADR's build — not ad-hoc untracked files. Under this ADR they are the
   launcher for the runtime worktree; under an eventual packaged app (deferred) they become
   electron-builder config. The known Electron traps are respected: the sidecar stays raw-tsx (never
   esbuild-CJS bundled), `getAppPath` is the app-root anchor, dist is served over http not `file://`,
   and the win-arm esbuild lock is avoided.

## Consequences

**Good.**
- Fixes the observed bug at the root: the desktop's runtime is decoupled from the dirty dev checkout —
  it runs a known, CI-proven `main` commit, dist and sidecar together (never skewed).
- Makes ADR-0164 Rail 2 an enforced invariant, not aspirational prose: a rebuild/apply can only move
  the runtime forward to merged `main`.
- **Preserves the ADR-0163/0164 build-and-apply-in-place dogfood loop** — the desktop still builds from
  source and applies fixes live, just from the *right* source. No CI/publish/hosting infra required.
- The version is visible and its staleness actionable (Decision 3).

**Bad / costs.**
- A second full checkout on disk with its own `node_modules` (one `pnpm install`; the existing
  worktree provisioning — `provision-worktree.mjs` — mitigates). Disk cost.
- Still a minutes-long local build per apply, and the sidecar still runs as raw `tsx`. This is "run
  from a pinned checkout," not "run a released binary" — acceptable for a single-owner inner-circle
  tool; the packaged-app end-state (deferred above) is where that changes.
- The runtime worktree must be kept fast-forward-only; a force-push to `main` (not our practice under
  ADR-0022 auto-merge trunk discipline) would need a manual reset. Low risk, surfaced by the non-ff
  fail-closed guard rather than silently reset.

## References

- ADR-0164 — the self-restart-to-apply capability this **amends**: keeps both rails + its Phase-1
  owner-triggered apply, makes Rail 2 enforced by construction, and re-points the rebuild at a dedicated
  runtime worktree.
- ADR-0163 — the dogfooding-maturation practice this preserves (build-and-apply-in-place).
- ADR-0109 — the Electron Step-1 shell + its traps (can't run `.ts`, `getAppPath`, serving `dist` over
  http) — the runtime-worktree seam wires through them.
- ADR-0119 — the thick-local sidecar (raw-tsx, kept unbundled).
- ADR-0093 / `check:web-engine` (`packages/cli/src/web-engine-sync.ts`) — the SHA-pinned synced-artifact
  pattern considered and declined for this step (pins dist, not sidecar); its stamp-and-show idea folded
  into Decision 3.
- ADR-0090 / ADR-0109 — the hosted/members distribution trajectory the deferred packaged-app end-state
  points at.
- Code: `apps/desktop/electron/main.ts` (`STUDIO_DIST`, sidecar spawn, `apply:rebuild-relaunch`),
  `apps/desktop/electron/static-server.ts`, `apps/desktop/src/apply/rebuild.ts` (`REBUILD_STEPS`),
  `apps/studio/server/codeStamp.ts` (the git-HEAD stamp extended in Decision 3).
- ADR-0050 — how this ADR's number (0181) was allocated.
