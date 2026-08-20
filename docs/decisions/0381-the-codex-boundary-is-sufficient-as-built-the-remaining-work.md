---
status: accepted
decided: 2026-08-18
arc: codex-factory-parity-arc
amends: [355, 364]
---
# ADR-0381: Unevidenced Codex hardening stops; the remaining work is exercise

## Status

accepted (2026-08-18) — decided/directed by the owner in conversation on 2026-08-18: *"I really just
want codex to work, we haven't really been able to give it a chance to do the work and stress test it
against the harness. can we update the arc and adrs to reflect this objective rather then build walls
around it that may not even be needed."* Design-time alignment IS the ratification (ADR-0110).

Originally amended **ADR-0355** and **ADR-0364** in their investment posture only.
[ADR-0390](0390-codex-runs-at-claude-parity-and-the-managed-containment-boun.md) subsequently
superseded both mechanisms and **amends this ADR**: this ADR's evidenced-hazard bar and exercise-first
direction stand, while its claims that the fence itself remained current do not.

## Context

**Historical measurement, not current delivery state.** The Codex containment boundary was finished
and, as of 2026-08-18, measured working. The fence
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

**D1. No containment hardening without an evidenced hazard.** A
restriction may be added or tightened when something actually observed motivates it — a Codex session
that reached somewhere it should not, a fence that admitted what it should have refused. "It would be
safer" is no longer sufficient. This reverses the arc's working posture, and it is the whole point of
this ADR. ADR-0390 later withdrew the boundary itself and preserved this bar for any proposal to
re-fence Codex.

**D2. The arc's remaining objective is EXERCISE: give Codex real work and stress-test it against the
harness.** ADR-0390 retired the containment-shaped `codex-lobby-to-write-live-smoke`; the replacement
parity unit then completed the ordinary claim, direct `--pg`, toolchain, gate and PR journey. What
comes after it is evidence-backed parity work, not more fence.

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

**D4. RE-DECIDED by ADR-0390.** This ADR originally closed the Claude/Codex asymmetry question without
levelling either fence. After exercise exposed that Codex's boundary failed open and blocked the
legitimate journey, the owner directed Codex to run at Claude parity and withdrew the containment.
The measured comparison above remains evidence; the no-levelling conclusion does not.

## Interaction with ADR-0390

ADR-0390 supersedes the former fence, broker and resident authority decisions. Interactive Codex now
runs with `danger-full-access`, readable credentials and network access at Claude parity; the managed
hook/profile composition is not a current fallback. The one procedural rule that survives from the
former boundary is that an agent does not remove its own installed fence: the operator performed the
withdrawal before the parity session began. Re-fencing remains subject to D1's observed-hazard bar.

## Consequences

**The arc's shape changes and its worklist shortens.** Work that exists only to harden further is
descoped. ADR-0390 later removed the containment-shaped smoke and sidecar machinery after the parity
journey succeeded; only concrete differences found by running real work remain.

**Exercise, not modelling, supplies the next requirement.** The first real workload showed the fence
both failed open and blocked legitimate work, which is the evidence ADR-0390 acted on. D3 keeps future
findings as defect evidence rather than invitations to hypothetical hardening.

**The accepted risk, stated plainly.** A real hazard could appear that a wall would have caught. That
risk is now the same broad repository/credential blast radius already accepted for Claude, and it is
revisited by observed behaviour under ADR-0390 D6 rather than by adding speculative controls.

## References

- [ADR-0390](0390-codex-runs-at-claude-parity-and-the-managed-containment-boun.md) — amends this
  exercise-first posture and supersedes its former containment mechanism.
- [ADR-0364](0364-codex-write-authority-is-a-standing-worktrees-grant-narrowed.md) / [ADR-0355](0355-interactive-codex-writes-only-in-its-current-claimed-worktre.md) — superseded historical
  fence and lifecycle decisions.
- [ADR-0375](0375-the-resident-claim-authority-lives-in-the-desktop-app-and-th.md) /
  [ADR-0379](0379-the-desktop-hosts-the-codex-claim-authority-whenever-the-bou.md) — the resident
  authority and its self-detection.
- [ADR-0284](0284-the-write-authority-wall-stays-static-worktree-to-worktree-i.md) — where the
  Claude-side asymmetry lives, if it is ever taken up.
- `codex-lobby-to-write-live-smoke` — retired containment-shaped exercise; the parity unit replaced
  it under D2.
