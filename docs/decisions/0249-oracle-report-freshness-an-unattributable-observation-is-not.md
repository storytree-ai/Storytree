---
status: accepted
decided: 2026-07-26
arc: verification-integrity-arc
amends: [211]
---
# ADR-0249: Oracle-report freshness: an unattributable observation is not evidence

## Status

accepted (2026-07-26) — decided/directed by the owner in conversation on 2026-07-26, as increment 1 of
the `verification-integrity-arc` charter: the owner named the defect, named both acceptable fixes ("a
run nonce + phase in the report" or "unlink the report immediately before each CONFIRM spawn"), and
directed that a new ADR carry the re-decision. Design-time alignment IS the ratification (ADR-0110);
no second end-of-flow ask. **amends [ADR-0211](0211-assert-oracle-integrity-close-the-in-process-forged-green-ho.md)**
— it repairs the freshness assumption inside ADR-0211's protocol without changing its decision;
ADR-0211's two layers (freeze + out-of-band accounting) and its `>= 1` floor all stand.

## Context

ADR-0211 closed a forged-green hole with two layers: a guard preload that freezes `node:assert` and
counts real assertion invocations, and a spine-side cross-check that refuses an `exit 0` whose
out-of-band report shows fewer than one assertion. The layer is documented, throughout, as
**fail-closed**: "a missing/unreadable report, or a zero count, REFUSES the green".

**It was fail-OPEN.** The cross-check read a file it had never established belonged to the observation
it had just made.

- `oracleReportPath(runId, unitId)` *(the then-name; since renamed `allocateOracleReportPath` and no
  longer keyed on those two alone — see the correction under Consequences)* returns ONE fixed temp path
  per (runId, unitId). `resolve-prove-spec.ts` computes it once and closes over it for the proof
  command's env AND for `verifyGreen` — so CONFIRM_RED, every leaf `run_proof` feedback run, and
  CONFIRM_GREEN all write and read the same path.
- The report body was `{"assertions": N}`: no run nonce, no timestamp, no phase. Nothing in it
  identifies which observation produced it.
- The protocol bridged that gap with an assumption stated in that function's own doc comment —
  "the guard truncates on every run". The guard truncates only if its `process.on("exit")` hook RUNS.

So when a run's exit hook does not fire, nothing truncates, and the spine reads the **previous**
observation's count as if it were this one's.

Two doors reach that state, and the second needs no exception at all:

- **(a) the swallowed write.** `assert-oracle-guard.mjs`'s write is wrapped in `try {} catch {}` whose
  comment read "an unwritable report → the spine reads none → refuses the green fail-closed". That was
  simply false: the spine read the *previous* report.
- **(b) `process.removeAllListeners("exit")` in IMPLEMENT-phase source.** ADR-0211 defends
  `process.exit(0)` (its vector B) by registering the hook FIRST. Registering first does nothing
  against source that REMOVES the listener. This requires no I/O failure, no race, and no privilege.

Measured against the real mechanism (Node 24, the committed guard, one shared report path):

```
CONFIRM_RED   exit=1  report={"assertions":1}     # honest test, wrong source: the assertion ran, then threw
CONFIRM_GREEN exit=0  report={"assertions":1}     # process.removeAllListeners("exit"); process.exit(0)
HONEST        exit=0  report={"assertions":1}     # the honest green — byte-identical
```

`verifyOracleExercised` returns `{ok: true}` on the middle row. `proveUnit` signs
`Verdict{outcome: "pass"}`, and under `--real --store pg` persists a `healthy` promotion row, for an
observation that executed **zero** assertions. Note the last row: the forged report and the honest
report are indistinguishable, which is the property that makes this class invisible from outside.

**This is a different and more serious class than ADR-0211's honestly-stated limit.** That limit (a
determined attacker running one dummy `assert.equal(1, 1)` to reach count 1) leaves the layer working
as designed and merely sets its floor low. This defect **inverts the degradation mode**: a layer built
to fail closed failed open, and every artefact describing it — the ADR, three doc comments, the
regression suite — asserted the opposite.

**Why the shipped regression suite could not see it.** `oracle-accounting.test.ts` ran exactly ONE
observation per report path. Reuse across observations is the entire mechanism of the defect, so no
amount of care within a single-observation test could have caught it. The suite was not weak; it was
testing a different shape than production runs.

## Decision

**The spine CLEARS the oracle report immediately before every observation it intends to trust, and
treats a report that survives the clearing as a refusal.** Freshness by construction, not by
convention: after a successful reset, a report can exist only because the guard wrote it *during this
observation*.

1. **`resetOracleReport(reportPath)`** (`proof/oracle-accounting.ts`) removes the report, then
   **verifies its absence**. Missing is the normal first-observation case and succeeds silently. A
   report that survives returns a fail-closed refusal — the unlink error is NOT swallowed, because an
   uncleared report is exactly the stale read the reset exists to prevent.
2. **`ShellTestResolver.beforeRun?`** (`shell-test-executor.ts`) — a pre-observation seam, the
   necessary counterpart to ADR-0211's `verifyGreen`. A non-ok result makes the observation a
   fail-closed RED **without spawning**: if the spine cannot trust what it is about to read, it must
   not go on to read it.
3. **`resolve-prove-spec.ts` wires `beforeRun` and `verifyGreen` as a PAIR**, at the one site that
   already computes the report path — never one without the other.

This is the owner's second named option. It was chosen over the run-nonce option because it needs no
change to the shared proof command's env, and so preserves the **one-oracle property** (ADR-0211 /
`prove-spec-resolution`): the spine's CONFIRM command and the leaf's `run_proof` stay byte-identical. A
per-observation nonce in that env would have made them diverge. The nonce's only advantage — naming a
surviving stale report as *stale* rather than merely *unattributable* — is worth nothing once the reset
guarantees no stale report survives.

**One fix closes both doors.** Door (a) needed no separate change: with the reset in place, a failed
write leaves no report, "the guard did not write" becomes indistinguishable from "no report", and the
guard's comment becomes true rather than aspirational. The comment now says so, and says that it rests
on the reset — so the two cannot be separated by a later reader without warning.

**The regression test exercises the real multi-observation sequence** (`ATTACK C`): a genuine red that
leaves a positive count, then the attack source, over ONE report path. It is accompanied by a
**differential control** (`ATTACK C differential`) showing the same source on a FRESH path was already
refused — which establishes that staleness, and nothing else, was the gap. Both were confirmed RED
before the fix and GREEN after.

## Consequences

- **The documented fail-closed behaviour is now the actual behaviour**, for the specific claim the code
  makes about itself. ADR-0211's guarantee is restored, and its floor is unchanged.
- **The reset can only turn a green into a red**, never the reverse — so like ADR-0211's cross-check it
  can never manufacture a pass. The added false-RED surface is a report path the spine cannot clear
  (a permissions or file-lock anomaly on the OS temp dir), which fails loudly and recoverably.

  *(Corrected 2026-08-04 — that enumeration was incomplete, and the missing entry was not an OS anomaly
  but a consequence of this decision's own shape. Pairing a MANDATORY delete with a DETERMINISTIC path
  makes every such path a mutual-destruction site: two observers that derive the same name each clear
  the other's report, and the robbed one reads none and refuses its own honest green. The direction
  stayed fail-closed — the sentence above is still right that no pass can be manufactured — but the
  refusal was then a verdict on a stranger rather than on the proof it judged. FIRST SEEN 2026-08-03,
  three concurrent runs of the orchestrator suite: two honest proofs refused, in one of the three runs.
  RE-MEASURED 2026-08-04 once tests drove the collision rather than waiting to lose the race: without
  the fix 3/3 runs exited 1 with 6, 10 and 14 spurious refusals; with it, 4/4 exited 0 with none.
  `oracleReportPath` is therefore now **`allocateOracleReportPath`**, returning a path unique per CALL
  (pid + random token; runId/unitId survive in the name for forensic attribution only). This does NOT
  reopen the run-nonce option rejected under Decision: the token is per-BUILD, allocated once at the
  one site step 3 already names and closed over, so the spine's CONFIRM command and the leaf's
  `run_proof` stay byte-identical and the one-oracle property holds. Production was never demonstrated
  to collide — its single caller passes a real per-run `runId` — so there the hazard was LATENT, and it
  bit the suites, which keyed the path off fixture constants. The decision above is unchanged and
  strengthened: freshness by construction now rests on a path no stranger can derive.)*
- **Negligible cost.** One `rmSync` + one `existsSync` per observation. No env change, no new services.
- **The leaf's `run_proof` feedback runs still write to the shared path and are still not reset** —
  correctly. Their reports are never trusted; the next CONFIRM observation clears whatever they left.

### Named residuals (not closed here)

- **IMPLEMENT-phase source can forge the report body directly.** The report path reaches the proof
  process via `STORYTREE_PROOF_REPORT`, so source can write `{"assertions": 99}` itself. This is not a
  regression — it predates this ADR — and it is not closable while a unit test loads its source
  in-process: hiding the path fails too (source can read `process.execArgv`). It sits squarely inside
  ADR-0211's stated threat model, where the goal is to make forgery require conspicuous,
  reviewable, intent-revealing code rather than to be impossible. Recorded here because it was found
  while fixing the freshness hole and should not have to be rediscovered.
- **ADR-0211's two follow-ons**: the maximal declared-count cross-check stands undone. The custom-command
  one is PARTLY done — since `custom-proof-command-red-accounting` (`parallel-red-green-arc`,
  2026-08-09) the guard is wired by CAPABILITY rather than by route, so a declared command running
  `node --test` over the node's own test file is accounted exactly as the default one is. What remains
  exit-code-only is the package-suite and vitest population, and for a measured reason rather than an
  unfinished one: a suite's report is overwritten LAST by node:test's runner parent with its own count
  of zero, and vitest asserts through an API this guard does not count.

### The generalisable lesson

A cross-check against evidence of **unknown provenance** is not fail-closed, whatever its own logic
does — the check can be satisfied by evidence from an earlier, healthy run. Establishing provenance is
part of the check, not a precondition someone else can be assumed to have arranged.

*(Corrected in place 2026-08-06 — this paragraph said the lesson "is being authored" as Library
guidance. It HAS been: both halves landed as guardrails in the `verification-integrity-arc`'s durable
half — `asset:an-unattributable-observation-is-not-evidence` for the provenance rule above, and
`asset:an-assert-oracle-proof-that-cannot-fail-is-not-a-proof` for its sibling. Those artifacts are
now the guidance an agent reads at the moment it authors a cross-check; this paragraph is the source
decision's record of the lesson, and cites rather than restates them.)*

## References

- [ADR-0211](0211-assert-oracle-integrity-close-the-in-process-forged-green-ho.md) (the amended
  decision — the assert-oracle guard + out-of-band accounting whose freshness assumption this repairs),
  [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) (the spine-observed red/green guarantee
  both serve), [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) (born-accepted).
- Code: [`proof/oracle-accounting.ts`](../../packages/orchestrator/src/proof/oracle-accounting.ts),
  [`proof/assert-oracle-guard.mjs`](../../packages/orchestrator/src/proof/assert-oracle-guard.mjs),
  [`shell-test-executor.ts`](../../packages/orchestrator/src/shell-test-executor.ts),
  [`resolve-prove-spec.ts`](../../packages/orchestrator/src/resolve-prove-spec.ts).
- Proof: [`proof/oracle-accounting.test.ts`](../../packages/orchestrator/src/proof/oracle-accounting.test.ts)
  (`ATTACK C`, its differential control, and the `resetOracleReport` fail-closed cases).
