# Re-installing the Codex boundary so ADR-0375 is in force, and re-measuring the fence

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

Driven by a harness that invokes the **installed** hook exactly as Codex does — `pre-tool-use` plus
the policy path on argv, one JSON event on stdin as a raw UTF-8 buffer — and times each invocation.
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

### 7.2 After the re-install — NOT YET MEASURED

The harness is written and exercised; what it needs is the installed set to measure. It refuses to
score a `FAILED CLOSED` as a pass, so a run against an unreachable authority reports `INCONCLUSIVE`
rather than a fence verdict — which is the distinction ADR-0375 D4 exists to make legible, and the
reason this section is empty rather than optimistic.

**Do not fill this in from §3 of the 2026-08-15 document.** That table was measured against a
different hook. The whole point of the criterion is that the six directions are re-run, not assumed.

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
$env:STORYTREE_CODEX_CLAIM_AUTHORITY = '1'
pnpm --filter desktop start
```

Read the `repository:` line it prints: it must name the primary checkout, never a worktree
(ADR-0375 D7). Then re-run the fence harness with `--repeat 3`, since §4's defect was a *nondeterministic*
verdict and a single invocation cannot see it.

**Then, and only then**, the reader identity in §6 becomes revocable.
