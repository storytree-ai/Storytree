# Standing up the Codex containment boundary and the claim broker, and measuring the fence

> **HISTORICAL RECORD — not instruction.** ADR-0390 (2026-08-20) withdrew the managed Codex
> containment boundary, and the `codex-retire-the-containment-machinery` increment deleted the
> code this document describes. ⚠ §4's conclusion that the hook "fails closed" was later FALSIFIED — the hook failed OPEN, which is why ADR-0390 exists.
> Kept as the record of how the boundary was built and measured. Do not follow its procedures.
> Current state: `storytree arc show codex-factory-parity-arc --pg`, and the journey survey at
> `docs/research/codex-onboarding-journey-survey-2026-08-22.md`.

**Date:** 2026-08-15 · **Arc:** `codex-factory-parity-arc` · **Decisions:** ADR-0355, ADR-0364, ADR-0368

This records the first time the ADR-0364 boundary was actually **installed** on this host, the first
time the ADR-0368 **claim broker** was actually **started**, and a measured run of the managed hook —
the only fence ADR-0364 leaves standing.

It deliberately does **not** claim `codex-lobby-to-write-live-smoke` as passed. What that increment
asks for is a *journey* beginning with a Codex task in the lobby; what is recorded here is the
machine state that journey requires, plus a fence measurement that found a blocker for it. The
increment exists precisely because this arc was once closed on a bar that had drifted, so the
distinction is kept sharp.

---

## 1. What was installed, and the four traps on the way

The managed set on disk before this session was dated 2026-08-13 — the **pre-ADR-0364** per-worktree
writer profile (`writer-bc8353f6…json`, `requirements.toml` 3,564 bytes). ADR-0364 replaced the
mechanism, so the boundary needed re-installing. It could not be.

Four separate defects each produced a bundle that generated cleanly and then could not be installed.
Three were repository defects and are fixed in this change; one is an operator fact now written into
the generated readme.

### 1.1 The CLI could not emit an installable bundle at all (repo defect — fixed)

`storytree write-authority codex` had exactly one payload flag, `--toolchain-payload`. The other two
pins the actuator verifies — `codexPayload` and `worktreeCreatePayload` — had **no route from an
operator's shell into the bundle**; they were reachable only from the test file.

Consequence: every bundle the repository could generate carried `codexPayload: null` and
`worktreeCreatePayload: null`. The actuator refuses at
`Assert-PinnedPayload 'Codex payload'` before writing anything, and `bootstrap` refuses at the
worktree-create pin. The repository could *describe* the boundary but never emit one anybody could
install.

Observed refusal:

```
Storytree Codex trusted actuator refused: Codex payload is not configured as an
administrator-owned hash-pinned payload
```

Fixed by adding `--codex-payload` and `--worktree-create-payload`, minting each pin **from the file**
exactly as `--toolchain-payload` already did, so no digest is ever transcribed by hand.

### 1.2 `Write-Atomic` could never overwrite an existing file (repo defect — fixed)

The generated actuator wrote every managed artifact through:

```powershell
if ([IO.File]::Exists($Target)) { [IO.File]::Replace($Temp, $Target, $null) }
else { [IO.File]::Move($Temp, $Target) }
```

**Windows PowerShell 5.1 binds `$null` to a `[string]` parameter as the empty string**, so
`Path.GetFullPath("")` throws before the call touches the disk:

```
Exception calling "Replace" with "3" argument(s): "The path is not of a legal form."
```

Only the *existing-target* branch reaches `Replace`. That is why this was invisible: the **first**
install, onto an empty managed directory, took the `Move` branch every time and succeeded — and every
**re-install** afterwards was impossible. Re-install is exactly the operation ADR-0364 requires.

Reproduced with no elevation and nothing storytree-specific, then fixed with `[NullString]::Value`
(PowerShell's way to pass a genuine null to a .NET string parameter). The regression test **executes**
the rendered PowerShell against an existing file rather than asserting on its text, and was falsified:
reverting to `$null` fails it, and no text-level assertion catches it.

### 1.3 The hook interpreter was taken from whatever Node generated the bundle (repo defect — fixed)

`managedNodePath` defaults to `process.execPath`. The hook command and the toolchain prefix are both
built from it, so generating from an ordinary shell wrote a **user-writable** Node into a machine-wide
security boundary:

```
C:\Users\mickh\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_…\node.exe
```

That path is `FullControl` for the operator account and sits outside the administrator-owned managed
root. Under ADR-0364 the managed hook is the **only** fence, so whoever can replace its interpreter
replaces the fence. The 2026-08-13 install had used the managed Node; nothing enforced it.

Now an **installable** bundle (one with `codexPayload` configured) refuses a `managedNodePath` outside
`managedDir`. The dry run stays generatable from any shell, because that surface is inspection-only
and costs nothing.

### 1.4 Pin the Codex executable that sits beside its own resources (operator fact — documented)

`payloads\codex-0.145.0.exe` and `payloads\codex-0.145.0\bin\codex.exe` are **byte-identical**
(same SHA-256). Only the layout differs, and only the layout lets the binary find
`codex-resources\codex-windows-sandbox-setup.exe`. Pinning the flat copy fails at sandbox setup with:

```
orchestrator_helper_launch_failed: setup refresh failed to launch helper:
helper=codex-windows-sandbox-setup.exe, cwd=C:\Windows\system32, error=program not found
```

— naming a helper that *is* present on disk, under the other path. All four traps are now stated in
the generated operator readme.

### 1.5 Install cost scales with the worktrees area

Sandbox setup grants the standing write ACE across the whole worktrees area and walks every file
under it. On this host that is **89 worktree slots, 88 carrying their own `node_modules`**, and the
install took **~35 minutes** at roughly 400 CPU-seconds. That is a direct, previously unrecorded
consequence of ADR-0364's standing grant: it is not a hang, and worktree sprawl makes it worse. Also
written into the readme.

### 1.6 Final installed state

| artifact | state |
|---|---|
| `requirements.toml` | 27,346 bytes, three profiles: `storytree_codex_current`, `storytree_codex_phase_author`, `storytree_codex_lobby`; `default_permissions = "storytree_codex_current"`; `allow_managed_hooks_only = true` |
| standing policy | `sessions\standing-6bb0f51b663e19dfb4cbba11.json` — carries no worktree, branch or session identity |
| hook / probe / creator | regenerated; all four pins resolve inside the managed root |
| toolchain | `payloads\node.exe payloads\pnpm.cjs`, pinned; runs and reports **9.15.0**, matching `packageManager` |
| credential denies | `CodexSandboxUsers` DENY on `~/.storytree` (as one `(OI)(CI)` container), `~/.codex/auth.json`, and gcloud ADC |

Actuator exit: `{"profile":"storytree_codex_current","installed":true,...}`

---

## 2. The claim broker is running

Started per `infra/codex-claim-broker.md`, by the operator, with the repository fence taken from its
own working directory:

```
storytree codex claim broker listening on 127.0.0.1:58836
  identity:   storytree-codex-claim-writer@storytree-498613.iam
  repository: C:\code\storytree
  handshake:  C:\Users\mickh\AppData\Local\Storytree\codex-broker\handshake.json
```

It holds the scoped claim-writer identity, never the operator's personal login. The handshake ACL is
exactly what ADR-0368 specifies — inheritance broken, two principals, nothing inherited:

```
handshake.json  MicksMSpro\CodexSandboxUsers:(R)
                MICKSMSPRO\mickh:(R,W)
```

and it resolves **outside** `~/.storytree`, the denied root the one account that must read it could
not otherwise reach.

> **Launch note.** The broker takes its repository fence from `process.cwd()`, so it must run with cwd
> = the primary checkout. A bare `node --import tsx …` fails there with `Cannot find package 'tsx'`,
> because tsx resolves only through a workspace and the checkout ROOT has none. Register the loader
> from an explicit path, as `packages/cli/launch.mjs` already does.

---

## 3. The fence, measured against the installed hook

Every line below is the **installed** hook's own decision and its own wording, driven exactly as
Codex invokes it (`pre-tool-use`, event on stdin, real cwd). This is criterion 7's stated
precondition — confirm the hook is installed and firing before reading anything else as a pass.

| # | case | cwd | verdict | the hook's own reason |
|---|---|---|---|---|
| A | lobby write | lobby | **DENY** | the Storytree lobby is read-only and no bootstrap actuator is installed |
| B | write in own claimed worktree | own | **ALLOW** | — |
| C | reach into sibling worktree | own | **DENY** | target resolves outside the current claimed worktree |
| D | walk into sibling worktree | sibling | **DENY** | no live work claim exists for this session/current branch |
| E | write own `.git` metadata | own | **DENY** | target resolves to protected repository/session metadata |
| F | lobby read | lobby | **ALLOW** | — |

C and D together are ADR-0364's isolation property proved against the installed fence, in **both**
directions, under a profile that permits the whole worktrees area at the OS layer — the case the
per-worktree profile used to catch and no longer does.

Two measurement traps, each of which produced a refusal that would have read as a pass for the wrong
reason:

- **A detached sibling fails closed at topology** (`current linked worktree is detached`) before the
  claim fence is consulted. The sibling must be on a branch or the test answers a different question.
- **PowerShell prepends a UTF-8 BOM** to anything piped to a native process, and the hook fails closed
  on the malformed JSON. Windows PowerShell 5.1 also has neither `ProcessStartInfo.ArgumentList` nor
  `StandardInputEncoding`, so a probe written there silently passed *no arguments* and node evaluated
  the event as a script. The probe is written in Node for this reason.

---

## 4. ⚠ The blocker: the fence's latency budget is marginal, and the verdict is nondeterministic

The hook re-reads live claims on every covered tool call, spawning the standalone claim probe with a
**30-second** timeout (`run()` in the generated hook). The probe builds a Cloud SQL connector and
impersonates the scoped read principal **per invocation** — there is no warm connection to reuse.

Measured, back to back, same machine, same request:

```
attempt 1: 18,976 ms, exit 0   -> {"claims":[ ...two live work claims... ]}
attempt 2: 48,192 ms, exit 0   -> {"claims":[ ...same two claims... ]}
```

One inside the budget, one nearly double it. The consequence is visible directly in the table above:
**case B returned `FAILED CLOSED` on one run and `ALLOW` on the next, with identical inputs.**

```
RESULT : FAILED CLOSED -> ...spawnSync ...node.exe ETIMEDOUT     (first run)
RESULT : ALLOWED (hook emitted no denial)                        (second run)
```

This is **not a security hole** — it fails closed, which is the correct direction, and the probe's
answer is correct whenever it arrives. It is a *usability* blocker, and it blocks the smoke:
criterion 6 ("a source write in that worktree succeeds") cannot be met reliably while a legitimate
write is refused on a coin flip, and every covered tool call pays a full connector build.

The fix is a design fork, not a tuning knob — raising the timeout accepts a ~50 s pause on every
write; caching weakens the per-call re-read ADR-0364 depends on; asking the **already-resident
broker**, which holds a warm pool, composes with ADR-0368 but widens a deliberately narrow verb set
(ADR-0368 D4 kept `claimsFor` unbrokered on purpose, because an empty answer would render "no other
sessions"). Recorded as an open question on the arc rather than decided here.

---

## 5. What `codex-lobby-to-write-live-smoke` still needs

Against its twelve criteria:

| criteria | state |
|---|---|
| 1–5 (lobby start, one bootstrap request, claim before worktree, `work` grade, same task writes) | **not run** — needs a live Codex task in the lobby |
| 6 (source write succeeds) | **blocked** by §4 |
| 7–8 (lobby + sibling + wrong-session refusals, by the hook) | **substance demonstrated** in §3, but with a Claude session's claim, not from the journey |
| 9 (workspace commands via the pinned toolchain) | **mechanism proven** (`9.15.0`, §1.6); not yet from a freshly minted worktree |
| 10 (Playwright under worktree-local scratch) | **not run** |
| 11 (credential paths unreadable) | machine ACLs **in place** (§1.6); not yet observed from a sandboxed process |
| 12 (recorded) | this document |

The precondition increment `codex-managed-toolchain-payload` **is** satisfied on this host: the pinned
`dist/pnpm.cjs` is staged, hash-verified against the generator's own pin, and carried in the bootstrap
envelope. Its repository half was already complete; what was missing was the route to configure the
other two payloads, which is §1.1.

Nothing here entitles any surface to describe the ADR-0355 lifecycle as operational.
