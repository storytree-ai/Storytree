# Re-installing the Codex boundary so ADR-0375 is in force, and re-measuring the fence

> **HISTORICAL RECORD — not instruction.** ADR-0390 (2026-08-20) withdrew the managed Codex
> containment boundary, and the `codex-retire-the-containment-machinery` increment deleted the
> code this document describes. Its §8 install commands drive a generator that no longer exists — running them installs nothing.
> Kept as the record of how the boundary was built and measured. Do not follow its procedures.
> Current state: `storytree arc show codex-factory-parity-arc --pg`, and the journey survey at
> `docs/research/codex-onboarding-journey-survey-2026-08-22.md`.

**Date:** 2026-08-16 · **Arc:** `codex-factory-parity-arc` ·
**Increment:** `codex-reinstall-the-boundary-so-adr0375-is-in-force` ·
**Decisions:** ADR-0355, ADR-0364, ADR-0368, ADR-0375

PR #1364 landed ADR-0375 — the resident claim authority moves into the desktop app and the managed
hook reads through it — and with it the fix for the blocker measured on 2026-08-15: a per-tool-call
Cloud SQL connector build that took 18,976 ms on one run and 48,192 ms on the next against a 30 s
budget, so the same legitimate write was refused once and admitted once.

**The fix was landed but not in force.** The installed artefacts live under `%ProgramData%` and do not
follow the repository, so the dev host kept running the boundary installed on 2026-08-15 — including
the blocker. This records closing that gap.

It deliberately does **not** claim `codex-lobby-to-write-live-smoke` as passed. That increment asks
for a *journey* starting from a Codex task in the lobby; what is recorded here is the machine state
that journey requires. This arc was closed once on a bar that had drifted, so the distinction is kept
sharp.

---

## 1. What was stale on the host, measured before touching anything

The standing policy on disk at `sessions\standing-6bb0f51b663e19dfb4cbba11.json` read:

```json
{
  "schemaVersion": 2,
  "mode": "standing",
  "claimProbeCommand": [
    "C:\\ProgramData\\OpenAI\\Codex\\Storytree\\payloads\\node.exe",
    "C:\\ProgramData\\OpenAI\\Codex\\Storytree\\storytree-codex-live-claim-probe.mjs"
  ]
}
```

So the installed hook was still spawning the standalone probe per covered tool call, and the coin-flip
refusals continued. Three further pieces of stale state, each confirmed on disk:

| # | stale state | evidence |
|---|---|---|
| 1 | policy at `schemaVersion: 2` carrying `claimProbeCommand` | the JSON above |
| 2 | the hook script is base64-embedded in the actuator, so it reaches the host only through regenerate + re-install | `Install-Policy` in the generated actuator |
| 3 | `storytree-codex-live-claim-probe.mjs` (1,796,629 bytes) still installed, its source deleted from the repository by ADR-0375 D8 | `%ProgramData%\OpenAI\Codex\Storytree\` listing |
| 4 | logon scheduled task `Storytree Codex Claim Broker` still registered — a second broker racing the desktop app for the same handshake | `schtasks /query`, status `Ready` |

---

## 2. The regenerated bundle

Generated **through the managed Node**, with all three payload pins, per the four install traps
recorded on 2026-08-15 (all still apply):

```
C:\ProgramData\OpenAI\Codex\Storytree\payloads\node.exe packages/cli/launch.mjs \
  write-authority codex --pg \
  --codex-payload          C:\ProgramData\OpenAI\Codex\Storytree\payloads\codex-0.145.0\bin\codex.exe \
  --worktree-create-payload C:\ProgramData\OpenAI\Codex\Storytree\payloads\node.exe \
  --toolchain-payload      C:\ProgramData\OpenAI\Codex\Storytree\payloads\pnpm.cjs
```

The emitted policy is what the increment asked for:

```json
{
  "schemaVersion": 3,
  "mode": "standing",
  "primaryCheckout": "C:\\code\\storytree",
  "worktreesRoot": "C:\\code\\storytree\\.claude\\worktrees",
  "claimBrokerHandshake": "C:\\Users\\mickh\\AppData\\Local\\Storytree\\codex-broker\\handshake.json"
}
```

`claimProbeCommand` is gone and `claimBrokerHandshake` is absolute.

**The policy FILENAME is unchanged, and that is by design.** Its identity hashes only
`{mode, primaryCheckout, worktreesRoot}`, so a re-install replaces the file in place rather than
leaving an orphan beside it — which is also why the `Write-Atomic` `$null` bug fixed on 2026-08-15
had to be fixed before any re-install could work at all.

The emitted actuator is 1,186,012 bytes against the installed 4,362,603. The drop is the probe
bundle no longer being embedded — ADR-0375 D8 visible as a file size.

---

## 3. Two pieces of prose the regeneration falsified, corrected in place

Both were found by reading the emitted bundle against its own actuator, and both would have cost the
next operator real time.

**3.1 The generated operator readme said the actuator installs the probe.** Trap 4 read *"It writes
the hook, probe, creator, policy and requirements itself"*, while the actuator's own `Install-Policy`
carries the opposite comment (*"No live-claim probe script any more (ADR-0375 D8)"*). The readme is
the surface an operator reads while installing, so it now says what is actually true and adds the
consequence the increment exists to clean up: **`install` writes only what it owns, so a re-install
over a pre-ADR-0375 set leaves the retired reader on disk, and it must be deleted by hand.**

A test asserted `doesNotMatch(operatorReadme, /live-claim probe/i)` as its D8 proxy. That assertion is
kept — it is doing real work — and two positive assertions were added beside it, so the removal
guidance cannot be deleted silently later.

**3.2 The managed hook's own module doc-comment still described the probe protocol** it no longer
speaks (`stdin carries {readMode:"live-claims-required", …}`, `stdout must be {claims:[...]}`). The
hook now does a loopback `fetch` to the resident authority with the handshake path taken from the
policy. Corrected in place, and while correcting it two things were written down that the source
proves and no prose stated:

- **There are TWO budgets, not one.** The hook aborts the authority fetch at **5 s**
  (`AbortSignal.timeout(5000)`), and Codex kills the whole hook at the **30 s** declared in
  `requirements.toml`. The 2026-08-15 blocker was measured against the 30 s figure alone.
- The handshake path comes from the administrator-owned policy and never the environment (D5), and an
  unreachable authority is a refusal and never an empty list (D4).

**3.3 ADR-0355's attestation paragraph** still asserted in the present tense that *"the claim hook
reaches the live ledger only through a dedicated keyless impersonated service account"*. True of the
installed host on the day it was attested; false of the repository since ADR-0375 D8. The decision did
not change, so this is a correct-in-place under ADR-0139 rather than a new ADR: the sentence now reads
as the attestation history it is, and points at where the narrow-credential property moved.

---

## 4. `infra/codex-claim-broker.md` claimed the authority starts itself

The runbook said, of the desktop host: *"Start the app and the authority is up; there is no separate
thing to remember."*

That is false, and it is the one line that stood between this host and criterion 5. Hosting is
**opt-in and off by default** (ADR-0375 D9) — without `STORYTREE_CODEX_CLAIM_AUTHORITY=1` the backend
opens no pool and logs `not hosting the Codex claim authority`. **The variable appeared nowhere in the
runbook**, and the only concrete start command in the document was for the headless fallback. An
operator following it verbatim would conclude the authority was up when it was not, and would then be
debugging a fence that refuses every covered write.

Corrected, with the opt-in stated where the holder is named, and a `Starting the desktop host` section
carrying the actual command, the success block to read, and the stderr-capture fallback.

---

## 5. The blocker that had nothing to do with %ProgramData%

The desktop app serves its studio bundle **and its backend sidecar** from the pinned runtime worktree
named in `~/.storytree/desktop.runtime.json` (ADR-0181), not from the checkout you launch in. On this
host that worktree was at `ef2dc203` — three commits behind the ADR-0375 merge — and
`apps/desktop/src/backend/claim-authority.ts` **did not exist in it**.

Launching with the environment variable set would therefore have produced neither the success block
nor the refusal line, because the code that logs either was not there. The only symptom is silence,
which is the worst shape a precondition can have.

Advanced with `git merge --ff-only origin/main` + `pnpm install`; the file is now present. This is
recorded because nothing about it is visible from `%ProgramData%`, from the policy, or from the
repository — it is a property of a *different worktree* that decides whether the fence has an
authority to read at all.

---

## 6. The retired reader identity, and why revoking it is ORDERED, not optional

`storytree-codex-claim-reader@storytree-498613.iam.gserviceaccount.com` is unused by the repository
after ADR-0375 D8. Proven three ways over the worktree at `47097436` — ripgrep, `git grep` over all
4,188 tracked files, and a PowerShell scan including gitignored and hidden files. **Three hits, all
ADR prose; zero live code or config references.** Neither codex identity is under Terraform
management, so removing it cannot drift `infra/` state.

Its live cloud footprint, read directly:

| surface | state |
|---|---|
| service account | exists, enabled, `uniqueId 102854735207157558008` |
| project IAM | `roles/cloudsql.client` + `roles/cloudsql.instanceUser`, both **unconditional** (the staged runbook intended instance conditions; they were never applied) |
| impersonation | `roles/iam.serviceAccountTokenCreator` to one member, the operator |
| Cloud SQL | present as a `CLOUD_IAM_SERVICE_ACCOUNT` user on `storytree-pg` |
| Postgres | `SELECT` on `events.node_claim`, `USAGE` on schema `events`. Owns nothing. No default ACLs. 1 of 19 tables |

**The sequencing hazard, which is the actual finding.** Until the reinstall lands, the *installed*
hook still reads live claims by spawning the probe, which authenticates **as this reader**. Revoking
it before the re-install would make the installed hook fail closed and refuse every covered Codex
write, arriving with no warning and looking like a fence defect. So the revocation is not merely
"outstanding" — it is **ordered after** the re-install and after a covered write is proven through the
desktop-hosted authority.

There is no argument for keeping it permanently: it grants `SELECT` on one table, owns nothing, and
re-minting it is six commands. Recorded here rather than executed, per the increment's own
"or a reason to keep it is recorded" — the reason is the ordering, and it expires.

⚠ **When it is revoked: `reader` and `writer` sit in the same two project `members` lists and differ
by one word.** A mistyped `--member` strips the *writer's* Cloud SQL access and silently kills the
ADR-0375 claim authority. Paste the member string; do not retype it.

⚠ **There is no committed minting record for the reader.** `docs/research/` holds one for the *writer*
(2026-08-14) and none for the reader, which predates it — its minting survives only in ADR-0355 prose
and an uncommitted administrator runbook recoverable from local Codex logs. The table above is
therefore the record, and deleting the account without it would leave nothing to re-mint from.
That is a reason to keep this section, not a reason to keep the identity.

---

## 7. The fence, re-measured

Driven by `codex-boundary-reinstall-adr0375-2026-08-16/fence-remeasure.mjs`, committed beside this
document so the next re-measurement does not re-author it. It invokes the **installed** hook exactly
as Codex does — `pre-tool-use` plus the policy path on argv, one JSON event on stdin as a raw UTF-8
buffer — and times each invocation. It writes nothing, installs nothing and starts nothing; run it
with `--repeat 3`, and `--help` lists the overrides.
Written in Node rather than PowerShell for the reason §3 of the 2026-08-15 document records: PS 5.1
prepends a UTF-8 BOM to anything piped to a native process and the hook fails closed on the malformed
JSON, and 5.1 has neither `ProcessStartInfo.ArgumentList` nor `StandardInputEncoding`.

It also honours that document's first measurement trap: siblings are selected only if they are **on a
branch**, verified with the hook's own predicate, because a detached sibling fails closed at topology
*before* the claim fence is consulted and reads as a pass for the wrong reason.

### 7.1 Baseline — the installed pre-ADR-0375 hook, measured 2026-08-16

Case B (a write in the session's own claimed worktree, the case §4 found nondeterministic), three
back-to-back invocations against the still-installed schemaVersion-2 hook:

```
attempt 1: ALLOW, 7,672.3 ms
attempt 2: ALLOW, 6,261.3 ms
attempt 3: ALLOW, 6,498.3 ms
```

**This revises the shape of the blocker, and the revision matters.** ADR-0375 cites 18,976 ms and
48,192 ms. Today the same code path, on a warm database, costs 6.3–7.7 s. So the 2026-08-15 figures
were **the tail of a distribution, not the norm** — the defect was never "the probe always takes
~50 s"; it is that a per-invocation Cloud SQL connector build has a tail that crosses a fixed budget,
so identical inputs return different verdicts depending on the day. That is a stronger argument for
ADR-0375's fix than the two cited numbers alone, because a fence whose correctness depends on
database weather cannot be made sound by raising the timeout.

Even at the good end, every covered tool call was paying **6+ seconds**, and all three invocations sat
past the 5 s authority-fetch abort the new hook uses.

### 7.2 After the re-install — measured 2026-08-18, GREEN 6/6 across three repeats

Driven by `fence-remeasure.mjs --own <a worktree holding a live work claim> --repeat 3` against the
installed ADR-0375 hook. The hook's own verbatim refusal reasons, each matching §3 exactly:

```
A  lobby write             DENY   "the Storytree lobby is read-only and no bootstrap actuator is installed"
B  own claimed worktree    ALLOW  (no denial emitted)
C  sibling reached-into    DENY   "target resolves outside the current claimed worktree"
D  sibling walked-into     DENY   "no live work claim exists for this session/current branch"
E  own .git                DENY   "target resolves to protected repository/session metadata"
F  lobby read              ALLOW  (no denial emitted)
```

Both sibling directions refused is ADR-0364's property, re-confirmed against the new hook rather than
carried over from the 2026-08-15 table — which this run deliberately did not copy, per the warning
retained below.

**The latency defect is closed, and this is the number the whole of ADR-0375 was for.** Across all 18
invocations: **min 559.9 ms, max 910.9 ms**; claim-reading cases (B, C, D, E) 608–911 ms. Against the
§7.1 baseline of 6,261–7,672 ms and the 18,976 / 48,192 ms cited in ADR-0375. Every invocation sat
inside **both** budgets — the 5 s authority-fetch abort and the 30 s Codex hook kill — with an order
of magnitude to spare. There is no longer a per-call connector to have a tail, so the
verdict-depends-on-database-weather defect is gone rather than merely rarer.

⚠ Attribution the harness prints and worth preserving: elapsed time includes managed-Node process
start and five `git rev-parse`/`worktree` calls, and cases A and F read no claims at all — so ~560 ms
is the floor to subtract before attributing cost to the claim read itself.

**Do not fill this in from §3 of the 2026-08-15 document.** That table was measured against a
different hook. The whole point of the criterion is that the six directions are re-run, not assumed —
which is why the table above is the 2026-08-18 run and not a transcription of the older one.

---

## 8. What remains, and exactly how to finish it

Everything below is machine state, a scheduled task, a desktop app an operator starts, or a GCP
grant. ADR-0364 D6 — an agent may never edit its own fence — is why these are separated from the
repository change rather than automated beside it.

**Elevated (Windows PowerShell, Run as Administrator).** The actuator probes the *configured* primary
checkout rather than the shell's directory, so cwd does not matter.

```powershell
Copy-Item '<staged actuator>' 'C:\ProgramData\OpenAI\Codex\Storytree\storytree-codex-trusted-actuator.ps1' -Force
& 'C:\ProgramData\OpenAI\Codex\Storytree\storytree-codex-trusted-actuator.ps1' install
Remove-Item 'C:\ProgramData\OpenAI\Codex\Storytree\storytree-codex-live-claim-probe.mjs' -Force
```

`install` takes roughly 35 minutes on this host and is **not** a hang: sandbox setup grants the
standing ACE across the whole worktrees area, 81 slots at the time of writing. The reaper reported
**0 reapable** — every slot was held (64 cooling, plus unmerged, dirty, locked, detached and the
anchor) — so there was nothing to drain first, and the cost had to be paid rather than reduced.

**Unelevated.** Quit the desktop app first, then relaunch it hosting the authority:

```powershell
pnpm --filter desktop start
```

⚠ **Corrected in place 2026-08-18 (ADR-0379).** This block used to set
`$env:STORYTREE_CODEX_CLAIM_AUTHORITY = '1'` first. That opt-in is retired: hosting is now
SELF-DETECTED from an installed `standing-*.json`, because the variable asked "did a human remember"
rather than "is the boundary installed", and forgetting was silent — the hook is the only fence, so it
refused every covered write with no stated cause. The variable survives only as a two-way override.
Detection was proven in force on this host on 2026-08-18 with the variable REMOVED from the user
environment. Also note ADR-0181: the desktop serves its sidecar from the pinned runtime worktree
`C:\code\storytree-runtime`, so advance that worktree before concluding anything about a
desktop-hosted change.

Read the `repository:` line it prints: it must name the primary checkout, never a worktree
(ADR-0375 D7). Then re-run the fence harness with `--repeat 3`, since §4's defect was a *nondeterministic*
verdict and a single invocation cannot see it.

**Then, and only then**, the reader identity in §6 becomes revocable.

---

## 9. The named prime suspect, tested and REFUTED — measured 2026-08-18

ADR-0381 D3 and the `codex-lobby-to-write-live-smoke` increment both name one untested restriction as
the prime suspect for blocking the lifecycle at its very first step:

> ⚠ all three managed profiles carry `network.enabled = false`, which plausibly blocks the
> bootstrap's own loopback call to the claim broker — and if it does, criterion 2 fails at the very
> first step and the failure will LOOK like a broker fault rather than a profile one.

**It does not block it.** The restriction is real and live, and loopback is exempt from it.

### How it was tested without a Codex desktop task

`codex sandbox` runs an arbitrary command under the same Windows restricted-token sandbox and the same
named managed profile a task gets — so the question is answerable directly, out of band:

```
codex sandbox -P <profile> --include-managed-config -- <managed node.exe> -e <probe>
```

The probe deliberately carries its own controls, because a network test that passes because the
sandbox never engaged is worthless:

| # | Probe | `storytree_codex_lobby` | `storytree_codex_current` |
|---|---|---|---|
| 0 | **FS control** — write into the lobby | `DENIED EPERM` | `DENIED EPERM` |
| 1 | Read `%LOCALAPPDATA%\Storytree\codex-broker\handshake.json` | `OK` (port 50162) | `OK` (port 50162) |
| 2 | **Network control** — TCP `1.1.1.1:443` | `ERROR EACCES` | `ERROR EACCES` |
| 3 | TCP loopback to the broker port | **`CONNECT`** | **`CONNECT`** |
| 4 | HTTP POST to the broker | `404 {"ok":false,"reason":"no such endpoint"}` | `404 {"ok":false,"reason":"no such endpoint"}` |

Row 0 proves the sandbox was fencing rather than absent. Row 2 proves `network.enabled = false` is in
force and blocking. Rows 3 and 4 are therefore not vacuous: **the fence is live, and loopback passes
through it anyway.** Row 4 is the strongest of the four — that 404 is the broker's *own router*
answering, so reachability is proven at the application layer and not merely at TCP.

Row 1 matters on its own account: it is ADR-0368's handshake-location design point measured in force.
`~/.storytree` is a denied root, so a handshake placed there would be unreadable by the one process
that must read it; `%LOCALAPPDATA%\Storytree\codex-broker` is readable from inside the sandbox.

### What this changes, and what it does not

It **removes the leading hypothesis** for a criterion-2 failure. If the bootstrap cannot reach the
broker during the live smoke, the profile's network setting is no longer the first thing to suspect —
look at authority liveness instead (TCP-connect the port the handshake names; the file existing proves
nothing) and at `codex-sidecar-dies-under-electron`.

It does **not** advance any of the twelve criteria. This is a reachability measurement made out of
band by the harness, not a journey run by a Codex task; criterion 5 requires the same task that made
the bootstrap request to write in the worktree it minted, which nothing here does. The distinction is
the one §intro keeps sharp, and it is kept sharp here for the same reason.

⚠ One measurement note, recorded so it is not mistaken for a defect: the third profile,
`storytree_codex_phase_author`, cannot be exercised this way — `codex sandbox` refuses it with
`workspace-write sandbox has no writable root capability SIDs`. That is an artefact of driving the
profile with no workspace root attached, not a finding about the profile; the worktree it names
(`wt-workaround-probe`) does exist on this host.

---

## 10. The managed toolchain, exercised — and criterion 9 has a hidden precondition

Same instrument as §9, pointed at criterion 9's mechanism: the pinned managed toolchain
(`<managed node.exe> <pinned dist/pnpm.cjs>`), run under `storytree_codex_current` with the working
directory set to a worktree. It had never been exercised.

**It works — but only after criterion 10's step, and that ordering was not previously stated.**

```
# no environment preparation
EPERM: operation not permitted, lstat 'C:\Users\mickh\AppData'
    at Object.realpathSync (node:fs:2776:29)
    at .../temp-dir@2.0.0/index.js   (evaluated at REQUIRE time)

# with TEMP/TMP pointed at <worktree>\.storytree-scratch
9.15.0
```

`9.15.0` matches the repository's `pnpm@9.15.0` pin, so the pinned payload is the right pnpm and it
executes inside the sandbox.

**Why the failure is worth recording rather than merely fixing.** `temp-dir` calls
`realpathSync(os.tmpdir())` at **module evaluation time**, reached through pnpm's own
`plugin-commands-env` → `node.fetcher` require chain. So pnpm resolves the temp directory before it
does anything else; `os.tmpdir()` defaults to `C:\Users\mickh\AppData\Local\Temp`, and resolving that
path lstats `C:\Users\mickh\AppData`, which the profile does not grant. The process dies at startup,
before argument parsing — `--version` never runs.

The consequence for the live smoke: **criterion 9 cannot pass unless criterion 10's step is performed
first.** They read as independent checks and they are not. The failure mode is also actively
misleading — an EPERM naming `C:\Users\mickh\AppData` with a `temp-dir` frame suggests a broken
toolchain payload or a missing credential grant, and points nowhere near "TEMP was not set". Expect a
session that hits it to misdiagnose it.

**This is NOT reported as an ADR-0381 D3 blocking restriction, and the distinction matters.** D3 is
about restrictions that block *legitimate work*. Here the documented step — which the increment
already requires, and which no launcher performs since ADR-0364 removed the launcher — makes the work
succeed. Widening the profile to grant `%LOCALAPPDATA%` would be engineering around a non-problem, and
is exactly the kind of wall ADR-0381 D1 forbids adding.

⚠ Same caveat as §9: this advances no criterion. It is the mechanism proven runnable by the harness,
not a workspace command run by a Codex task from a worktree it minted itself.

---

## 11. A contained task cannot read the Library — measured 2026-08-18, and both walls are by design

Same instrument as §9/§10. A live Library read from inside the sandbox, run from a worktree that has
`node_modules`, under `storytree_codex_current`:

```
Error: createPool: no IAM principal resolved; set STORYTREE_DB_USER to the operator IAM email
    at createPool (packages/library/src/store/connection.ts:76:11)
```

**It fails at credential resolution, before any network call** — which is not where the reasoning that
led here expected it to fail. `~/.storytree` is a denied path (ADR-0368's credential ACLs), so
`STORYTREE_DB_USER` cannot hydrate from `secrets.json` the way it does outside the sandbox.

Behind that sits a **second, independent wall**: outbound network is refused. DNS resolves
(`sqladmin.googleapis.com` → an address) but TCP 443 to it is `EACCES`, so the Cloud SQL connector
could not dial out even holding a credential. The store door is no escape either — it is HTTPS on 443,
the same wall.

**Neither is a defect, and neither is an ADR-0381 D3 blocking restriction to remove.** Denying the
sandbox credentials is the point of the fence; ADR-0368 built the loopback broker precisely because
the bootstrap must operate without one. What is worth stating plainly is the consequence, because it
is easy to discover the expensive way mid-journey:

- **Claims are unaffected.** They go through the broker over loopback. A claim operation failing is a
  real finding; a Library read failing is not.
- **A contained task cannot read its own work definitions** — criteria, arcs, increments, stories. Any
  runbook that tells it to `storytree library artifact … --pg` is giving it an instruction that cannot
  succeed. `infra/codex-lobby-to-write-smoke-handoff.md` carried exactly that instruction and has been
  corrected: reading the criteria is the operator's job, and the outline in the prompt is what the
  session runs from.

Whether a Codex driver that cannot read the Library is *sufficient* is a question for the live smoke
to answer with evidence, not for this document to pre-judge — which is the posture ADR-0381 D1 asks
for. It is recorded here so the smoke recognises it instantly instead of diagnosing it.
