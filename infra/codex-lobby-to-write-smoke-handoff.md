# Handoff to a Codex desktop session — prove the lobby-to-write lifecycle

> **Paste this to a Codex desktop task.** It is the operator-facing prompt for the
> `codex-lobby-to-write-live-smoke` increment on `codex-factory-parity-arc`. It lives in the
> repository rather than in a session scratchpad or `Downloads` deliberately: the previous copy was
> cited from a session-scoped path, which is the friction
> `operator-runbook-cited-a-session-scoped-scratchpad-path`. Keep it here and cite this path.

You are a Codex desktop task starting in the storytree LOBBY (`C:\code\storytree`). Your job is to
find out whether the Codex write lifecycle actually works on this host now, and to record what you
observed. You are the first Codex session to attempt this since the boundary was re-installed.

**Report what happens. Do not repair the boundary, widen a sandbox, or work around a refusal.** A
refusal that is correct is a successful result. `ADR-0364 D6` — an agent may never edit its own fence.

## What changed, and why you are being asked

The managed hook that decides whether you may write a file used to answer by building a Cloud SQL
connection on every single tool call — 6 to 48 seconds each, against a fixed timeout, so the same
legitimate write was refused on one run and allowed on the next. That is fixed: the storytree desktop
app now holds a warm claim authority and the hook reads through it over loopback. The boundary carrying
that fix was installed on 2026-08-18. Nothing has exercised it from your side yet.

## Before you start — three preconditions, and how to check each

If any of these is not true, STOP and say so. Running the journey without them produces a confusing
failure that looks like the lifecycle is broken when it is not.

1. **The authority is REACHABLE.** This is the only precondition that matters, and it is the one that
   is easy to get wrong. Read the port out of
   `%LOCALAPPDATA%\Storytree\codex-broker\handshake.json` and **open a TCP connection to it**:

       $h = Get-Content "$env:LOCALAPPDATA\Storytree\codex-broker\handshake.json" -Raw | ConvertFrom-Json
       (New-Object Net.Sockets.TcpClient).Connect('127.0.0.1', $h.port)   # silence = reachable

   ⚠ **The file EXISTING proves nothing.** It is published at broker startup and removed only on a
   GRACEFUL shutdown, so it outlives a crash and goes on naming a dead port. This exact false positive
   was measured on this host on 2026-08-18: handshake present naming port 60465, TCP connect
   ECONNREFUSED. If you check for the file and not the port, you will report a working lifecycle that
   is not there.
2. **The desktop app is running its BACKEND, not merely showing a window.** The app runs as
   `electron.exe`, never `Storytree.exe` — `Get-Process -Name Storytree` returns nothing even when the
   app is up, so do not use it. The backend is a separate SIDECAR process, and it is known to die
   while the window stays open (increment `codex-sidecar-dies-under-electron`). If precondition 1
   fails, this is the likely reason and it is not your fault — report it and stop.
3. **The installed policy is the current one.** `C:\ProgramData\OpenAI\Codex\Storytree\sessions\standing-*.json`
   reads `"schemaVersion": 3` and has a `claimBrokerHandshake` field and NO `claimProbeCommand`.

## One suspect you do NOT need to chase — already tested and refuted (2026-08-18)

All three managed profiles carry `network.enabled = false`, and until 2026-08-18 that was the named
prime suspect for the bootstrap being unable to reach the claim broker over loopback — the failure
that would have stopped you at criterion 2 while looking like a broker fault.

**It was measured out of band and it does not block you.** Under both the lobby and the current
profile, driven through `codex sandbox -P <profile> --include-managed-config`: a lobby write is
`DENIED EPERM` (so the sandbox really was engaged), an external TCP connect to `1.1.1.1:443` is
`ERROR EACCES` (so the network fence really is in force), and yet the loopback connect to the broker
port **succeeds** and an HTTP POST comes back with the broker's own router answering
`404 {"ok":false,"reason":"no such endpoint"}`. Reading the handshake out of
`%LOCALAPPDATA%\Storytree\codex-broker\handshake.json` also succeeds from inside the sandbox.

So loopback is exempt from `network.enabled = false`. If you cannot reach the authority, suspect its
LIVENESS instead (precondition 1 below) or the sidecar defect — not the profile. Full evidence:
§9 of `docs/research/codex-boundary-reinstall-adr0375-2026-08-16.md`.

Note the limit of that result: it proves *reachability*, nothing more. No criterion is advanced by it,
because nothing there was a journey run by a Codex task. All twelve are still yours to run.

## The journey to run

The authoritative criteria are the twelve in the `codex-lobby-to-write-live-smoke` increment — read
them first (`storytree library artifact codex-lobby-to-write-live-smoke --pg`) and report against
those numbers, not against this summary. **Do not renumber them.** In outline:

1. You begin on the lobby, and the lobby is read-only to you. Confirm a lobby write is REFUSED.
2. Make ONE bootstrap request naming an exact unit and intent. It mints you a worktree and takes a
   claim BEFORE that worktree exists.
3. Confirm the claim you end up holding is `work` grade, not `exploring`.
4. Write a source file in the worktree you minted. This must SUCCEED, and it is the criterion the old
   latency defect blocked. Note how long the write takes — that number is the point of the fix.
5. Confirm a write into a SIBLING worktree is refused, in both directions: reaching across into it,
   and walking into it and writing there. **Read this one carefully** — the OS profile now grants the
   whole worktrees area, so the refusal must come from the managed hook's live-claim check and its
   own refusal reason. A sibling refused because the profile did not grant it would be the wrong
   mechanism and does not count.
6. Run a pnpm workspace command from your worktree through the PINNED managed toolchain
   (`<managedNode> <pinned dist/pnpm.cjs>`) — there is no `pnpm` on your PATH and nothing puts one
   there. **Point `TEMP`/`TMP` at `<worktree>\.storytree-scratch` BEFORE you do, and understand that
   this is not tidiness — pnpm does not start without it.** Measured 2026-08-18: with TEMP unset the
   pinned pnpm dies at module load with

       EPERM: operation not permitted, lstat 'C:\Users\mickh\AppData'
           at Object.realpathSync (node:fs:2776:29)
           at .../temp-dir@2.0.0/index.js

   because `temp-dir` resolves `os.tmpdir()` at REQUIRE time and the default temp path lstats
   `AppData`, which your profile does not grant. `--version` never runs. With TEMP/TMP set to
   worktree-local scratch it answers `9.15.0`, the repository's pin. **So criterion 9 cannot pass
   unless this step is done first — they are not independent.** If you see that EPERM, it is not a
   broken payload and not a missing credential grant; it is an unset TEMP. Do not widen the profile.
7. Confirm the credential paths are still unreadable from your process (`~/.codex/auth.json`, gcloud
   ADC, `~/.storytree`).

## What to report

For each criterion: what you ran, what happened verbatim, and PASS / REFUSED-CORRECTLY / FAILED /
NOT-RUN. Quote the hook's own refusal text whenever something is refused — the reason string is the
evidence, because several different causes produce a refusal and they are not interchangeable.

Two things worth flagging loudly if you see them:

- **Any write that takes more than ~5 seconds.** The hook aborts its authority fetch at 5 s and Codex
  kills the whole hook at 30 s. Slow-but-allowed is the signature of the old defect and means
  something is still reading claims the expensive way.
- **Silence.** If a step produces neither a success nor a refusal, say so explicitly rather than
  retrying. Silence has a known cause here (a desktop serving a stale sidecar) and it is a real result.

Do not record any of this as an attestation or close any increment. Report to the operator.
