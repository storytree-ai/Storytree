# Probe: can the current Codex desktop task be rebound to a different worktree?

**Date:** 2026-08-14
**Increment:** `codex-desktop-task-rebinding-probe` (arc `codex-factory-parity-arc`)
**Product under probe:** the repository-pinned payload
`C:\ProgramData\OpenAI\Codex\Storytree\payloads\codex-0.145.0.exe` (Codex CLI 0.145.0) — the same
binary the managed actuator pins, so this is the surface a contained task actually meets.

## Answer

**Yes — a supported rebinding surface exists, and it is in the STABLE protocol.**

The call is **`turn/start`** with a **`cwd`** override against an existing `threadId`:

> `cwd` — *"Override the working directory for this turn and subsequent turns."*
> (`TurnStartParams`; `required: ["input","threadId"]`)

`thread/resume` also accepts `cwd` for the same `threadId`, and `thread/fork` accepts one for a new
thread. `turn/start` is the one that rebinds the **live** task the owner is already talking to, which
is the thing the increment asked about.

This closes the increment's contingent owner question **without escalation**: the question was only
live *"if rebinding turns out not to be supported"*. It is supported.

## Why this matters more than "the cwd moves"

The rebinding moves the **workspace root**, and therefore the write fence, not merely a path string.
On the rebound turn the managed permission profile re-scoped itself to the new directory (raw records
below): `workspace_roots` became `[dirB]`, and the profile's `<workspace_roots><root>` element named
`dirB`. So a rebound task is fenced to the *new* worktree — which is exactly the property ADR-0355's
containment needs, and the reason the nested-launch workaround is not required.

## Method

Two independent instruments, both from the installed product rather than from inference.

### 1. The product's own generated protocol schema

```bash
codex-0.145.0.exe app-server generate-json-schema --out <dir>                 # stable
codex-0.145.0.exe app-server generate-json-schema --experimental --out <dir>  # + experimental
```

- Stable surface: **89** client-callable methods. Experimental adds **37** more (126 total).
- `turn/start` and its `cwd` field are in the **stable** set — they are *not* experimental-gated.
  (The experimental-only list contains no rebinding method; it is realtime/audio, process control,
  remote-control pairing, thread search, and environment inspection.)

### 2. A live app-server exercise

Drove `codex app-server --stdio` over JSON-RPC: `initialize` → `thread/start(cwd=dirA)` →
`turn/start(threadId, cwd=dirB, …)`, and asked the model to state its own working directory.
`dirA`/`dirB` were freshly-created temp directories with random suffixes, so the model could only
name one by receiving it in its turn context — the prompt never contained either path.

The model answered with **dirB**:

```
C:\Users\mickh\AppData\Local\Temp\rebind-B-8pWblw — files: unable to list because the
filesystem helper failed to launch.
```

(The listing failure is an artifact of this bare harness's tool wiring, not of the rebinding. The
directory identification — the thing under test — is unambiguous.)

## Raw evidence

From the thread's own rollout,
`~/.codex/sessions/2026/08/14/rollout-2026-08-14T12-55-09-019ffe31-df82-….jsonl` — one thread, two
different directories, before and after the override:

```jsonc
// thread start — the thread is born at dirA
{"type":"session_meta","payload":{
  "session_id":"019ffe31-df82-7d22-9a4e-dc2674cf7335",
  "cwd":"C:\\Users\\mickh\\AppData\\Local\\Temp\\rebind-A-TYwD8n",
  "source":"vscode","cli_version":"0.145.0"}}

// the SAME thread, after turn/start(cwd=dirB) — cwd AND workspace_roots both moved
{"type":"turn_context","payload":{
  "turn_id":"019ffe31-e02c-78a2-b35e-54aa04b2f737",
  "cwd":"C:\\Users\\mickh\\AppData\\Local\\Temp\\rebind-B-8pWblw",
  "workspace_roots":["C:\\Users\\mickh\\AppData\\Local\\Temp\\rebind-B-8pWblw"],
  "approval_policy":"never","permission_profile":{"type":"managed", … }}}

// the managed profile's own fence followed the rebinding
{"type":"world_state","payload":{"state":{"environments":{"environments":{"local":{
  "cwd":"C:\\Users\\mickh\\AppData\\Local\\Temp\\rebind-B-8pWblw","shell":"powershell"}}},
  "filesystem":"<filesystem><workspace_roots><root>C:\\Users\\mickh\\AppData\\Local\\Temp\\rebind-B-8pWblw</root></workspace_roots><permission_profile type=\"managed\"> … "}}}
```

`session_meta.source: "vscode"` confirms this is the desktop/VS Code surface's own protocol, not a
CLI-only path.

## ⚠ The trap for whoever builds on this

**Do not verify a rebinding with `thread/read`.** After a successful `cwd` override, `thread/read`
still reports the **original** cwd — `session_meta` is written once at thread birth and is not
rewritten. Measured here: `thread/read` returned `dirA` while the agent was demonstrably running in
`dirB`.

A build unit that checks `thread/read` would therefore conclude the rebinding failed when it
succeeded. Verify against `turn_context.cwd` / `workspace_roots`, or against what the agent can
actually reach.

Related: an earlier version of this probe interrupted the turn after 4 s and saw only `dirA` in the
rollout — the `turn_context` record is not written until the turn genuinely starts. A rebinding probe
that cancels early reads as a false negative.

## What this does and does not settle

- **Settled:** a supported, stable, non-experimental rebinding call exists and moves the write fence.
- **Settled:** no owner escalation is needed for the contingency the increment named. That question
  was live only *if* rebinding were unsupported.
- **NOT settled — and do not let this proof stand in for it:** whether the *sandboxed actuator* can
  issue the call. The actuator runs under `CodexSandboxUsers`; to rebind the task the owner is
  talking to, it must reach that task's running app-server control socket (`codex app-server proxy`
  / `codex remote-control`). Whether that channel is reachable from inside the sandbox is untested
  here, and it is the same class of boundary that defeats the bootstrap. This probe answers "does the
  product support rebinding", not "can our actuator drive it".
- **Not done here:** replacing the actuator's `launch` verb — today
  `packages/cli/src/codex-session-containment.ts:952-954` emits
  `$CodexArguments = @('-C', $CanonicalWorktree); & $CodexPayload @CodexArguments`, starting a
  *nested* Codex process. That is a build unit, deliberately left to its own increment rather than
  folded into a probe.

This arc was reopened because writer-scope evidence was generalised into a lifecycle claim it had not
tested. The distinction above is the same shape, so it is drawn explicitly rather than left to the
reader.
