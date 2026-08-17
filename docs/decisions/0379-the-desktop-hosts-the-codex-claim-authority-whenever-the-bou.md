---
status: accepted
decided: 2026-08-18
arc: codex-factory-parity-arc
amends: [375]
---
# ADR-0379: The desktop hosts the Codex claim authority whenever the boundary is installed

## Status

accepted (2026-08-18) — decided/directed by the owner in conversation on 2026-08-18 ("the desktop app
is meant to be self contained, users should not need to set env variables or run specific start up
commands"). Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

Amends **ADR-0375** in exactly one place: D9's discriminator. Everything else in ADR-0375 survives
verbatim — D1 (the desktop is the holder), D2 (a second, separately-scoped pool, never the desktop's
own), D3 (the `claims` verb), D4 (an unreachable authority is a refusal, never an empty list), D5 (the
handshake path comes from the administrator-owned policy), D7 and D8. ADR-0368 D1 is untouched and
still load-bearing: **Codex must never LAUNCH the broker.**

## Context

ADR-0375 D9 made hosting opt-in behind `STORYTREE_CODEX_CLAIM_AUTHORITY=1`, off by default. The reason
was sound and still is: hosting opens a second Cloud SQL pool and impersonates the scoped claim-writer
service account, and an ordinary member holds no impersonation grant on that account. An unconditional
attempt would open a connector, fail, and log a credential error on every launch for everyone not
running the Codex factory.

The reasoning was right and the discriminator was wrong.

**The question worth answering is "is the Codex containment boundary installed on this host?" — a
property of the machine, directly observable. The variable asked "did a human remember?" instead.**
Those two coincide exactly until someone forgets, and then they diverge silently: with no authority
hosted, the managed hook — which under ADR-0364 is the ONLY fence — refuses every covered write, and
nothing anywhere states the cause. The failure presents as "Codex cannot write files", which is a very
long way from "an environment variable is unset on a GUI app".

Three forces made this worth changing rather than documenting harder:

- **It made the boundary a two-step install whose second step was a human remembering.** The elevated
  `install` is a real, deliberate, ~35-minute operator action. The variable was a second action with
  none of that weight, no artifact, and no failure signal — the easiest possible thing to drop.
- **The evidence that documentation was not the fix.** `infra/codex-claim-broker.md` asserted "start
  the app and the authority is up; there is no separate thing to remember", never naming the variable
  at all — false since D9 was written, and corrected only on 2026-08-16 (PR #1368). A gate that the
  runbook itself got wrong is a gate shaped badly, not a gate under-documented.
- **The signal it needs was already installed, and is already read by two other consumers.** The
  actuator writes a standing policy receipt to `%ProgramData%\OpenAI\Codex\Storytree\sessions\standing-*.json`.
  The managed hook is handed that file on argv (it is where D5 puts the handshake path), and the fence
  re-measurement harness already auto-detects "the single `standing-*.json`" as its default. Nothing
  new has to exist for the app to answer the question the machine can already answer.

## Decision

**D1. Hosting is gated on an installed standing policy, not on an environment variable.** The desktop
backend hosts the resident claim authority when it finds at least one `standing-*.json` under
`%ProgramData%\OpenAI\Codex\Storytree\sessions`. Installing the boundary is therefore the only action
that turns hosting on, and there is nothing for an operator to set, remember, or carry into the
process environment. A shortcut launch is sufficient.

**D2. ADR-0375 D9's protected property is preserved exactly, by the same test it always deserved.** An
ordinary member's laptop has no standing policy, so it opens no pool, impersonates nothing, and logs
no credential error. What changed is only how that host is RECOGNISED. Every failure direction of the
probe — no `%ProgramData%` (any non-Windows host), no managed directory, a directory this process
cannot read — answers "not installed", because none of them describe a host that should attempt.

**D3. `STORYTREE_CODEX_CLAIM_AUTHORITY` survives as an override in both directions, needed by nobody
in the ordinary case.** `1`/`true`/`yes`/`on` forces hosting on a host with no policy installed;
`0`/`false`/`no`/`off` forces it off for debugging. Retaining the name means the variable an operator
may already have set keeps working and keeps meaning what they meant.

**D4. An UNRECOGNISED value falls through to detection rather than reading as off**, and the log names
the value it ignored. Under D9's parser anything that was not `1`/`true`/`yes` meant off, so a typo on
a factory host would re-create precisely the silent failure this ADR removes. Falling through means
the machine's own answer wins and the typo is stated rather than obeyed.

**D5. The gate is a pure function, tested separately from the composition.** `decideHosting` takes the
environment and a policy probe and returns a decision plus the REASON it reached it, which the backend
logs. The failure being guarded is invisible at runtime — a gate that silently answers "no" on a
factory host produces a desktop that launches perfectly and a Codex that cannot write a single file —
so it is asserted directly rather than inferred from the composition's behaviour.

## Consequences

**Installing the boundary is now sufficient.** The operator sequence for the Codex lifecycle loses a
step, and loses the step most likely to be dropped. The affected criterion is
`codex-reinstall-the-boundary-so-adr0375-is-in-force`'s number 5 — "the desktop app runs with
`STORYTREE_CODEX_CLAIM_AUTHORITY=1`, and its stderr names the port, the identity, and the primary
checkout it pinned" — whose first clause is now satisfied by "the desktop app is running". The
stderr-evidence clause is unaffected and still binds. It was met on 2026-08-18 under the old mechanism
(the variable set at user scope), so this is a simplification of a MET criterion and not a moved bar;
the increment's body records both. `codex-lobby-to-write-live-smoke`'s twelve criteria do not mention
the variable and are untouched — and per ADR-0364 D7, any criterion this decision does affect is
rewritten BEFORE that smoke runs rather than after, because this arc was closed once on a bar that had
drifted between writing and measuring.

**The blast radius of being wrong is one logged line, and it is bounded by ADR-0375's own design.**
A host that has the boundary installed but no impersonation grant will now attempt and fail. That
failure was already typed and degrade-quiet — the composition never throws, and an absent authority is
a Codex-lifecycle outage and never a desktop outage — so the cost is a logged refusal on launch. On
the only class of host that can hit it (a machine someone installed the Codex boundary on), that
refusal is useful information rather than noise.

**The cost accepted knowingly: the gate now depends on a filesystem probe of a directory this
repository does not own.** If the actuator ever changes where it writes the standing policy, hosting
silently stops. That is mitigated but not eliminated: the same path is already depended on by the
managed hook and the re-measurement harness, so a move breaks three consumers loudly rather than this
one quietly, and the reason string names the exact directory it searched. A stronger form — having the
actuator write a machine-readable marker this repository does own — was rejected as more machinery for
the same answer.

**What this does NOT do.** It does not widen the sandbox, expose ADC, or change which identity the
authority holds (still the narrow `storytree-codex-claim-writer@…`, still a second pool, still
asserted on the options). It does not let Codex start the broker: a desktop app spawned by a sandboxed
Codex runs as `CodexSandboxUsers` with ADC denied and can impersonate nothing, so its pool construction
fails and no broker starts — detection changes when hosting is ATTEMPTED, never who may succeed.

## References

- [ADR-0375](0375-the-resident-claim-authority-lives-in-the-desktop-app-and-th.md) — the amended
  decision; D9 is the clause this replaces, the rest stands.
- [ADR-0368](0368-the-claim-broker-holds-the-credential-the-sandbox-may-not-an.md) — D1, Codex must
  never launch the broker. Untouched.
- [ADR-0364](0364-codex-write-authority-is-a-standing-worktrees-grant-narrowed.md) — the managed hook
  is the only fence, which is why a silently absent authority is a total Codex write outage. D6 (an
  agent may never edit its own fence) is why installing remains operator work.
- `apps/desktop/src/backend/claim-authority.ts` — `decideHosting`, `standingPolicyDirectory`.
- `infra/codex-claim-broker.md` — the operator runbook.
