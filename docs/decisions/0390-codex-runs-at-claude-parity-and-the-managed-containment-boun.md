---
status: accepted
decided: 2026-08-20
supersedes: [355, 364, 368, 375, 379]
amends: [255, 257, 284, 381]
arc: codex-factory-parity-arc
---
# ADR-0390: Codex runs at Claude parity and the managed containment boundary is withdrawn

## Status

accepted (2026-08-20) — decided/directed by the owner in conversation on 2026-08-20: *"yes give codex
the same access i give claude"*. Design-time alignment IS the ratification (ADR-0110); no second
end-of-flow ask.

**Supersedes** ADR-0355, ADR-0364, ADR-0368, ADR-0375 and ADR-0379. Every one of them exists to serve
a single premise — that an interactive Codex session must be contained by machinery storytree builds
and operates — and that premise is withdrawn. ADR-0355 decided writes are confined to the current
claimed worktree; ADR-0364 made the OS grant standing and put the managed hook in front of it as the
only fence; ADR-0368 built the loopback claim broker precisely because the sandbox was denied a
credential; ADR-0375 moved that authority into the desktop app to survive the fence's per-call
latency; ADR-0379 made its hosting self-detecting. Remove the containment and none of them has a
subject left. They are superseded rather than amended because this is a re-decision, not a
correction: their reasoning was sound for the posture they served, and the posture is what changed.

**Amends** ADR-0255, ADR-0257, ADR-0284 and ADR-0381. The first three stay current for the static
Claude file-tool wall and the shared-checkout incident they answer, but their harness-neutral and
Codex-specific mechanical write-authority clauses no longer bind interactive Codex. ADR-0381's
exercise-first direction and evidenced-hazard bar stand, while its instruction to keep the existing
fence does not. For Codex, claims survive as coordination and the standard landing ceremony, not as a
filesystem grant.

This does **not** supersede ADR-0381, which directed the arc to stop building walls and go get
evidence. This ADR is that direction carried to its conclusion, on the evidence ADR-0381 asked for.

## Context

### The containment was elaborate, and on 2026-08-20 it did not hold

The first Codex desktop task to produce a real result wrote a file into the read-only lobby.
`apply_patch` created `C:\code\storytree\codex-lobby-write-smoke-probe.txt` with no refusal, and the
file's owner is `MicksMSpro\CodexSandboxOffline` — the sandboxed account itself, so this is not a
misattributed operator write.

Both layers were open, for different reasons:

- **The OS layer.** The `storytree_codex_current` profile is `extends = ":read-only"` with write
  granted only to `.claude\worktrees`, and on Windows it is materialised as deny ACEs by the elevated
  sandbox implementation. The lobby root carries **zero** deny ACEs for the sandbox SID. Its `.git`
  carries two. Part of the setup pass had run and part had not.
- **The hook layer.** The hook's logic is intact — invoked by hand against a synthetic lobby
  `apply_patch` event, the installed hook returns exit 0 and the correct deny JSON. And no decision it
  can reach would have permitted this write: a `lobby` topology hits `decideLobby`, which refuses
  everything but SessionStart and reads; a `worktree` topology hits `authority()`, which requires
  `claim.grade === "work"` while the session held only `exploring`.

So the write proceeded because the hook returned **no decision at all**, and a hook that returns no
decision is an allow. The mechanism is in the generated hook's own shape: `emitDecision` writes a deny
as JSON on **stdout**, while the error path (`fail()`) writes only to **stderr** and sets
`process.exitCode = 2`. An allow is also silence on stdout. "The hook errored" and "the hook allowed"
are byte-identical on the channel that carries the verdict, separated only by an exit code.

`docs/research/codex-lobby-to-write-install-and-fence-2026-08-15.md` §4 already recorded this and drew
the wrong conclusion from it. Its own two-run table reads `FAILED CLOSED -> spawnSync node.exe
ETIMEDOUT` then `ALLOWED (hook emitted no denial)`, and its prose concludes *"This is not a security
hole — it fails closed, which is the correct direction."* The second line falsifies the first.

Under ADR-0364 the hook was the only fence. So the only fence failed open, and it had been documented
failing open for five days without being read that way.

### The asymmetry was never justified by evidence

The measured comparison recorded in ADR-0381's Context: Claude is fenced by 144 static path rules
binding **three** file tools, with Bash unbound, sibling worktrees permitted, credentials readable and
network free (ADR-0255/ADR-0257 as scoped by ADR-0284). Codex was fenced per tool call, with
credentials denied and network disabled. Nothing in the record documents a Codex session misbehaving.
ADR-0381 D4 closed the *question* of that asymmetry; it did not close the asymmetry itself.

### The containment is also what stopped the work

The same boundary blocked the journey it was built to make safe. Criterion 2 of the live smoke fails
at `cannot open '.git/FETCH_HEAD': Permission denied` — `git worktree add` writes bookkeeping into the
main repository's `.git/worktrees/` wherever the new tree lives, and the lobby's `.git` is denied, so
a contained task cannot mint a worktree at all. A contained task also cannot read the Library
(`--pg` fails at credential resolution before any network call), cannot run the workspace toolchain
without a pinned payload, and pays a multi-minute permission walk on its first action. Six of the
seven open increments on `codex-factory-parity-arc` existed to work around one of these.

### What was actually protecting the repository was never the sandbox

Nothing about the managed profile protects `main`. That is done by the prove-it gate, the non-draft
PR, and CI (ADR-0020, ADR-0022) — all of which are unchanged by this decision and apply to Codex
exactly as they apply to Claude. The sandbox protected the *machine and the credentials*, which is a
real thing to protect and is the only thing this ADR trades away.

## Decision

**D1 — Codex runs at Claude parity on this host.** The access an interactive Codex session has is
defined by pointing at how Claude already runs, not by a separately-designed profile: broad write
access to the repository and its worktrees, readable credentials, and network enabled. Where the two
could differ, parity is the tie-breaker, and the reference is ADR-0284's description of the Claude
wall. Parity is a *ceiling as well as a floor* — this ADR does not grant Codex anything Claude does
not have.

**D2 — The managed containment boundary is withdrawn, in both halves.** The managed configuration
(`C:\ProgramData\OpenAI\Codex\requirements.toml`: `default_permissions`, `allow_managed_hooks_only`,
the three `storytree_codex_*` profiles, and the SessionStart/PreToolUse/PermissionRequest hook wiring)
is disabled, and the deny ACEs that boundary applied to the filesystem are removed. **Both are
required and the second is easy to forget:** the ACEs are on disk and survive the config's removal, so
a boundary that is only half-removed leaves `.git` unwritable and Codex still unable to create a
worktree — the exact failure this decision exists to clear.

**D3 — Credentials are readable, and that is the one line being crossed deliberately.** The profile
denied `~/.storytree/secrets.json`, gcloud ADC, `~/.config/gcloud` and `~/.codex/auth.json`. Those are
live keys to the shared Cloud SQL instance and to funded subscriptions. Claude can read all four, so
this is parity rather than escalation — but it is the only part of D1 that is not already symmetric,
and it is recorded here as an accepted cost rather than an oversight. It is what lets a Codex session
read the Library, use `--pg`, and run the DB-backed gate rungs, which is what "drive the
infrastructure itself" requires.

**D4 — The claim ledger survives as coordination, and stops being enforcement.** The noticeboard stays
exactly as it is for Codex as for Claude: capability-grain claims, a binding refusal (ADR-0346 D1),
and the merge ceremony's release step. What ends is the idea that an OS profile or a per-call hook
*enforces* it. Sibling-worktree isolation is now discipline for both agents, which is what ADR-0284
already accepted for Claude with zero evidenced instances against it.

**D5 — The broker path is retired after the replacement was exercised.** ADR-0368's broker,
ADR-0375's resident authority and ADR-0379's self-detection ceased to be the required path when this
ADR was accepted. The condition that initially parked physical deletion is now met: a Codex session
drove a real Storytree unit end to end with direct `--pg` access, ordinary worktree/toolchain use and
the standard gate/PR ceremony, without the broker or resident authority. The retirement increment on
`codex-factory-parity-arc` therefore deletes those components, the managed policy/hook/profile
generator, its worktree bootstrap bundle and the obsolete phase scope hook. The operator-only
boundary-withdrawal script, claim ledger, Codex phase author and IAM identity remain because none is
the retired interactive containment path.

**D6 — Re-fencing requires an evidenced hazard, and the hazard bar now has a worked example.**
ADR-0381 D1 stands and is strengthened, not weakened, by this ADR: the first evidenced fence failure
on this arc was a fence that failed *open*, found by exercising rather than by modelling. Any proposal
to re-contain Codex must name an observed behaviour, not a hypothetical, and must say why the gate and
CI do not already cover it.

**D7 — An agent still does not remove its own fence.** ADR-0364 D6's rule outlives the fence it was
written for. The `requirements.toml` change and the ACE removal are operator actions requiring
elevation; a Codex session may neither perform nor request them. The sequence is: the operator
withdraws the boundary, and only then does a Codex session take work under it.

**D8 — Codex gets no bespoke memory layer without an observed continuity failure.** Owner direction
on 2026-08-20 closes `codex-graduation-ceremony-has-an-honest-source` without implementation. Arcs,
their increment logs, ADRs and the noticeboard already hold the durable state a later session needs;
the absence of Claude Code's private memory-directory convention has not prevented Codex from driving
the harness. If repeated Codex work later shows a concrete continuity failure that these shared
surfaces do not cover, memory may be reconsidered against that evidence. The first move is then to
evaluate established open-source memory libraries and product-supported sources, not to hand-craft a
Storytree-specific Codex memory format. Until that evidence exists, the graduation leg records the
honest free outcome that there is no compatible Codex memory source and leaves every other librarian
duty in force.

## Consequences

**Good.** A Codex session can finally do the thing the arc exists to test: read the Library, mint a
worktree, run the workspace toolchain, take a unit through the prove-it gate and open a PR. Six of the
seven open increments on the arc are mooted outright rather than delivered — the pinned pnpm payload,
the library read door, the shell-write fence question, the ACE-walk latency, the boundary reinstall,
and most of the twelve-criterion smoke, whose criteria were about a lifecycle that no longer exists. A
large amount of machinery stops needing to be maintained, and the failure modes that ate this arc for
three weeks — a fence whose verdict depended on database weather, a handshake outliving a dead sidecar,
a bundle that had to be reinstalled to ship a one-line message change — stop existing rather than
getting further engineering.

**Bad, and accepted knowingly.** A Codex session can now read live credentials and write anywhere in
the repository, including the primary checkout and sibling worktrees. The blast radius of a
misbehaving or confused session is the same as Claude's, which is to say: real, and previously
accepted for the agent that does most of the work. There is no longer any mechanical barrier between
two concurrent sessions writing the same worktree — only the claim ledger, which neither agent is
forced to obey. If a Codex session does misbehave, we will find out by observing it rather than by
being protected from it, and D6 is what turns that observation into a decision.

**Delivery correction (2026-08-20).** The operator performed D2 and the subsequent Codex parity run
confirmed direct Library/credential access and ordinary workspace operation. The retirement
increment now deletes `infra/codex-lobby-to-write-smoke-handoff.md` and the worktree bootstrap bundle
that served the superseded lifecycle. The live-smoke criteria remain historical evidence, not a
current delivery path. `infra/codex-boundary-withdraw.ps1` remains as the operator-only
cleanup/recovery surface; retaining it is not a new fence.

**A hazard this ADR does not address.** The hook's silent error path is a defect in a component being
retired, so it is not fixed. If the boundary is ever reinstated, that defect is still there and must
be fixed first: a fence must emit its refusal on the channel the caller reads, and must not rely on an
exit code to mean "deny".

**No memory subsystem is implied by parity.** Codex reaching the ordinary work lifecycle is evidence
that the shared corpus is presently sufficient. D8 keeps a future memory choice reversible and
evidence-led instead of turning one Claude-specific storage convention into a cross-agent requirement.

**Parity finalisation (2026-08-20).** Three formerly ambiguous seams are now explicit. First,
`storytree worktree create` names its Claude-farm ownership in help and accepts only
`--runtime claude`; `--runtime codex` refuses before claiming or writing because Codex Desktop owns
Codex worktree creation, recovery and `~/.codex/worktrees`. That refusal is an ownership boundary, not
a missing parity feature. Second, Desktop's Build control carries the selected runtime through the UI,
HTTP route and drive worker: Claude continues through Storytree's Claude credential broker, while
Codex uses the official CLI's saved ChatGPT authentication and never forges a Claude credential.
Third, the historical Electron-sidecar death could not be reproduced in the freshly built runtime:
its build stamp matched `HEAD`, its pnpm virtual-store lock matched the committed lockfile, and the
sidecar remained live under Electron. The actionable lifecycle defect was nevertheless real — a child
that died after its port handshake left a healthy-looking window and Retry remained pinned to the dead
ephemeral port. Electron now surfaces the captured exit in-window, marks the backend unavailable, and
Retry starts a replacement which the long-lived proxy follows. If the underlying process death recurs,
the surfaced stderr tail is the evidence a future session should start from; do not infer stale
dependencies without that capture.

## References

- Superseded: ADR-0355, ADR-0364 (standing grant, hook-as-only-fence), ADR-0368 (claim broker),
  ADR-0375 (resident authority), ADR-0379 (self-detected hosting).
- Standing and unchanged: ADR-0381 (stop building walls; D1's evidenced-hazard bar), ADR-0284 (the
  Claude-side wall this ADR takes as the parity reference), ADR-0020/ADR-0022 (the prove-it gate and
  approval-gated trunk — the actual protection for `main`), ADR-0346 (a claim refusal binds).
- Evidence for the fail-open: `codex-lobby-to-write-live-smoke` (the 2026-08-20 round-3 record) and
  `docs/research/codex-lobby-to-write-install-and-fence-2026-08-15.md` §4, whose conclusion this ADR
  corrects.
- The operator runbook for D2 lives on `codex-factory-parity-arc` as its first increment.
