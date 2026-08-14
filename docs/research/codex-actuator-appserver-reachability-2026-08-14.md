# Probe: can the actuator reach a running Codex task's app-server on Windows?

**Date:** 2026-08-14
**Increment:** `codex-rebind-the-desktop-task` (arc `codex-factory-parity-arc`) — its blocking half
**Follows:** `docs/research/codex-desktop-task-rebinding-probe-2026-08-14.md`, which proved the
product CAN rebind a live thread via `turn/start` + `cwd`.

## Answer: no — and the reason is the platform, not the sandbox

Every documented route by which a separate process could reach an already-running app-server is
**Unix-only and refuses on Windows**, which is this arc's supported host:

```
$ codex-0.145.0.exe app-server daemon version
Error: codex app-server daemon lifecycle is only supported on Unix platforms

$ codex-0.145.0.exe remote-control start --json
Error: codex app-server daemon lifecycle is only supported on Unix platforms

$ codex-0.145.0.exe remote-control pair --json
Error: codex app-server daemon lifecycle is only supported on Unix platforms
```

`codex app-server proxy` — the one verb whose whole purpose is "proxy stdio bytes to the running
app-server control socket" — takes `--sock <SOCKET_PATH>`, documented as *"Path to the app-server
**Unix domain socket** to connect to"*. On Windows there is no daemon to own one, and no socket file
exists under `~/.codex`.

## Why this correction matters

ADR-0355 currently frames this as *"whether the sandboxed actuator can reach the running desktop
task's app-server control socket — the actuator executes under `CodexSandboxUsers`, and that is the
same class of boundary that defeats the bootstrap."*

**That framing is wrong, and it is corrected in place.** This is not an ACL problem and not a sandbox
problem: an unsandboxed process running as the operator could not reach it either, because on
Windows the mechanism does not exist. Widening the sandbox — already forbidden — would not have
helped, which is worth knowing before anyone proposes it as the fix.

Only the process that already owns the app-server's stdio channel can issue `turn/start`. For a
desktop task, that is the desktop application itself.

## What this does to the rebind increment

The increment assumed the replacement was repository-side: swap what
`packages/cli/src/codex-session-containment.ts` emits at the nested-launch site (~lines 952-954) for
the rebinding call. **That is not available on this host.** The rebinding is real and proven, but it
is reachable only from inside the desktop app, so it is an external product dependency rather than a
change to the generated actuator.

Per the parent probe's own instruction — *"If it does not exist, record it as an external product gap
and STOP. Do not simulate it with an unmanaged nested CLI and then describe the lifecycle as
operational"* — this is recorded and stopped, not worked around.

## What was NOT tested, stated plainly

No Codex desktop task was running during this probe (`Get-Process` matched no `codex`/`openai`
process), so this establishes what the **product surface supports**, not what a live desktop task
might expose through a private channel. The daemon-lifecycle refusals are platform-level and
independent of what is running, which is what makes the conclusion safe; a private stdio channel
between the desktop app and its own app-server child would not change it, because a third process
cannot join one by design.

## The owner call this raises

The parent probe retired the contingent owner question on the grounds that rebinding IS supported.
That was correct about the product and incomplete about this host. The question the increment
originally named now returns in a sharper form, and it is genuinely the owner's:

**Is a nested Codex task acceptable as the shipped Windows experience?** The alternative paths are an
upstream ask (a Windows control channel), running the factory on a Unix host where the daemon exists,
or accepting that the owner finishes the bootstrap in a task that does not hold the worktree.

This is not pre-answered here.
