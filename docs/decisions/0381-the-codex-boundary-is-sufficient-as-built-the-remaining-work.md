---
status: accepted
decided: 2026-08-18
arc: codex-factory-parity-arc
amends: [355, 364]
---
# ADR-0381: The Codex boundary is sufficient as built; the remaining work is exercise

## Status

accepted (2026-08-18) — decided/directed by the owner in conversation on 2026-08-18: *"I really just
want codex to work, we haven't really been able to give it a chance to do the work and stress test it
against the harness. can we update the arc and adrs to reflect this objective rather then build walls
around it that may not even be needed."* Design-time alignment IS the ratification (ADR-0110).

Amends **ADR-0355** and **ADR-0364** in their INVESTMENT posture only. Every mechanism either decides
stands unchanged and is explicitly NOT weakened here — see "What this does not do".

## Context

The Codex containment boundary is finished and, as of 2026-08-18, measured working. The fence
re-measurement ran 6/6 cases green across three repeats: the lobby refused, the session's own claimed
worktree admitted, a sibling refused BOTH when reached into and when walked into, `.git` refused,
lobby reads allowed — each matching the expected reason text verbatim. Latency landed at 560–911 ms
against a 5 s authority-fetch abort and a 30 s hook kill, closing the defect where identical inputs
returned different verdicts depending on database weather.

**And in all that time, Codex has not once done a unit of real work through it.** The arc is named for
parity and has spent its length on enforcement. `codex-lobby-to-write-live-smoke` — the increment that
would actually exercise the lifecycle — has never run.

Meanwhile the boundary accumulated restrictions well past what was ever asked for, each justified
individually and never totalled. Measured side by side on the same host on 2026-08-18:

| | Claude (interactive) | Codex |
|---|---|---|
| Enforcement | 144 static path rules in a settings file | OS profile + a hook on every tool call |
| Tools bound | 3 (`Edit`/`Write`/`NotebookEdit`); **Bash unbound** | all tool calls |
| Sibling worktree | **permitted — nothing refuses it** | refused both directions, per call |
| Credentials | readable | gcloud / `~/.storytree` / `~/.codex/auth.json` denied |
| Network | unrestricted | **disabled** |
| Claim awareness | none — claim-blind | live claim re-read per call |

Two agents doing the same work on the same box, under opposite regimes. The asymmetry was never
decided; it accumulated, because Codex arrived with `danger-full-access` available and no notion of
claims — so its work was framed as containment — while the interactive Claude session sat inside a
harness with a discipline layer, so its fence was framed as a guardrail against accidents. ADR-0284
went as far as de-scoping the sibling-worktree hazard for Claude on the grounds of **zero evidenced
instances**, while the identical hazard earned Codex a mechanical fence and a falsification test.

Both were defensible alone. Together they are incoherent, and the incoherence points one way: the
containment work outran its evidence. Nothing in the record documents a Codex session that misbehaved.
The fence was built against a hazard model, not against observed behaviour — which is the correct order
for a first fence, and the wrong order for the fifth.

## Decision

**D1. The boundary is DONE. No further containment hardening without an evidenced hazard.** A
restriction may be added or tightened when something actually observed motivates it — a Codex session
that reached somewhere it should not, a fence that admitted what it should have refused. "It would be
safer" is no longer sufficient. This reverses the arc's working posture, and it is the whole point of
this ADR.

**D2. The arc's remaining objective is EXERCISE: give Codex real work and stress-test it against the
harness.** `codex-lobby-to-write-live-smoke` is the next unit, and it stops being an attestation
ceremony and becomes the ordinary way this gets used. What comes after it is more Codex work, not more
fence.

**D3. A restriction that BLOCKS legitimate work is a defect, and is now to be reported and removed
rather than worked around.** The prime suspect this clause was written around has since been TESTED,
and it is REFUTED (2026-08-18, PR #1405): all three managed profiles carry `network.enabled = false`,
and it does **not** block the bootstrap's loopback call to the claim broker. Under both the lobby and
current profiles a lobby write is refused `EPERM` and an external TCP connect is refused `EACCES` — so
the sandbox is engaged and the network fence is live, and the result is not vacuous — yet loopback
connects and the broker's own router answers. It does block the network generally, which is a real
constraint on any workspace command that needs one. Evidence: §9 of
`docs/research/codex-boundary-reinstall-adr0375-2026-08-16.md`.

The clause itself is unchanged, and it is the clause that matters rather than the example: where a
restriction does prove to block the lifecycle, the profile is wrong and gets narrowed — not the
lifecycle re-engineered around it. This is what operationalises "walls that may not even be needed":
we find out by running. The first run found one restriction innocent and no restriction guilty, which
is the outcome this clause has to be able to record as readily as the other.

**D4. The Claude/Codex asymmetry is NOT to be closed by levelling Codex's fence up or down, and the
question is closed rather than parked.** The measured comparison above stands as the record. Whether
the interactive Claude session should gain a claim-aware fence is a separate matter for ADR-0284's own
line, on its own evidence, and is explicitly not this arc's work. No `open-question` is authored: the
owner answered it — stop building walls, go get evidence.

## What this does NOT do

Nothing here weakens the fence, and nobody may read it as licence to.

- ADR-0364's core stands verbatim: the managed hook is the ONLY fence, and anyone weakening it weakens
  everything. It is now measured correct in all six directions.
- ADR-0368 D1 stands: Codex must never LAUNCH the broker. Authority comes from who started a process.
- ADR-0375 and ADR-0379 stand: the desktop app hosts the authority on a separately-scoped narrow
  identity, self-detected from the installed policy.
- The credential denials stand. `danger-full-access` stays refused at the config layer — it bypasses
  hooks entirely, so enabling it would not be "more permissive", it would be **no fence at all**.
- ADR-0364 D6 stands: an agent may never edit its own fence. D3 above is a REPORTING route, not a
  self-service one — a blocking restriction is surfaced to the owner with its evidence, and the owner
  installs any change.

## Consequences

**The arc's shape changes and its worklist shortens.** Work that exists only to harden further is
descoped. What remains is the smoke, its toolchain precondition, the intermittent sidecar death (which
is a RELIABILITY defect blocking exercise, not a containment one), and whatever running real work
turns up.

**We will probably find the fence is wrong somewhere, and that is the point.** A fence tested only by
its authors against its own hazard model has never met a real workload. D3 says the first such finding
is a defect report rather than a redesign.

**The accepted risk, stated plainly.** Relaxing the posture on hardening means a real hazard could
appear that a further wall would have caught. That is accepted knowingly: the fence already refuses
every direction it was built to refuse, it is the only one of the two agents on this box that is fenced
at all, and the cost of continuing to build unevidenced walls is now concrete — an arc that spent its
length on enforcement while the thing it was for never ran once.

## References

- [ADR-0364](0364-codex-write-authority-is-a-standing-worktrees-grant-narrowed.md) — the standing grant
  and the hook as the only fence. Unweakened; D6 still binds.
- [ADR-0355](0355-interactive-codex-writes-only-in-its-current-claimed-worktre.md) — the lifecycle this
  exercises.
- [ADR-0375](0375-the-resident-claim-authority-lives-in-the-desktop-app-and-th.md) /
  [ADR-0379](0379-the-desktop-hosts-the-codex-claim-authority-whenever-the-bou.md) — the resident
  authority and its self-detection.
- [ADR-0284](0284-the-write-authority-wall-stays-static-worktree-to-worktree-i.md) — where the
  Claude-side asymmetry lives, if it is ever taken up.
- `codex-lobby-to-write-live-smoke` — the next unit under D2.
