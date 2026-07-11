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

## Version management — the pinned-`main` runtime worktree (ADR-0181)

By default the shell serves `apps/studio/dist` + the sidecar from **the checkout it launched from**.
That checkout is usually a dirty feature branch, so the app can silently run un-merged code. To serve a
**pinned, CI-proven `main`** instead, point the shell at a dedicated runtime worktree kept on `main`:

```sh
# One-time: create a worktree that only ever tracks main, separate from your dev checkout.
git worktree add /path/to/storytree-runtime origin/main
cd /path/to/storytree-runtime && pnpm install && pnpm --filter studio build && pnpm --filter desktop run build:electron

# Point the desktop at it (env var; unset = today's launch-checkout fallback).
export STORYTREE_DESKTOP_RUNTIME=/path/to/storytree-runtime
pnpm --filter desktop start
```

When `STORYTREE_DESKTOP_RUNTIME` is set it is **authoritative and fail-closed**: it must exist and be on
`main`, or the app refuses to launch and shows the fix (a `git worktree add` / fast-forward hint) rather
than serving stray code. The in-app **Rebuild & relaunch** action (ADR-0164) then leads with
`git fetch` + `git merge --ff-only origin/main` in that worktree — so it can only ever advance to merged
`main`, never sideways onto a branch (Rail 2, enforced by construction). `/api/health` reports the
runtime worktree's branch and how many commits it is **behind `origin/main`** for version visibility.

### The installed (Start Menu) app: `install-shortcut --runtime`

A `.lnk` shortcut sets no env, so a start-menu launch would otherwise take the launch-checkout fallback
and silently run stale code (the reported bug). Point the **installed** app at the runtime worktree in
one step — it writes `~/.storytree/desktop.runtime.json` (which `main.ts` reads, env still wins) and
targets the shortcut at the runtime worktree, so shell + dist + sidecar all come from pinned `main`:

```sh
# after the one-time worktree bootstrap above:
storytree desktop install-shortcut --runtime /path/to/storytree-runtime
```

Now the app **tracks `main`**: a best-effort `git fetch` at launch keeps the behind-`main` count honest,
so when a newer version lands the store banner shows **"N commits behind main"** with a one-click
**Rebuild & relaunch** that pulls it (ff-only). A missing / off-`main` worktree fails closed with the
bootstrap recipe. Without `--runtime`, the shortcut points at the local checkout (unchanged).
