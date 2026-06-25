---
status: accepted
decided: 2026-06-25
amends: [20]
load_bearing: false
---
# ADR-0104: Per-node proof-timeout override beside the spine-wide default

## Status

accepted (2026-06-25) — **owner-requested this session** as the per-node alternative surfaced by
[PR #350](https://github.com/HuaMick/storytree/pull/350) (the spine-wide proof timeout). The spine-wide
10-min default shipped in #350 is sufficient on its own; the owner asked to ALSO expose a deliberate
per-node override for a genuinely-slow proof. Built and green this session
(`packages/orchestrator/src/proof-config.ts` `RealProofConfig.timeoutMs`, plumbed through
`resolve-prove-spec.ts` `realProofCommand`). This **amends
[ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md)**: the gate's CONFIRM-observation timeout
backstop gains a per-node budget knob — the spine-wide value is no longer the only dial.

## Context

PR #350 closed a real wedge: the spine OBSERVES red/green by spawning a proof command through one
runner (`runShellCommand`), and a proof that leaks an OS handle (a DB connector / socket / timer) and
never exits hung the CONFIRM observation INDEFINITELY, wedging the whole gate (hit driving
`library#gate-5`, 2026-06-25). The fix bounds every spawn with an `execFile` `timeout` +
`killSignal: "SIGKILL"`, so a hung proof is killed and observed as a fail-closed RED (`code: null`)
instead of an infinite wedge. The budget is `ShellCommand.timeoutMs ?? DEFAULT_PROOF_TIMEOUT_MS` (the
constant = 10 min). `ShellCommand.timeoutMs` was honoured but **spine-controlled** — deliberately NOT
in the zod `ShellCommandSchema`, so a node author could not inject it.

#350 left an **OWNER CALL** surfaced in the code (`shell-test-executor.ts`, `proof-config.ts`): keep
ONE spine-wide default, or expose a per-node override. The forces:

1. **The default must clear the slowest LEGITIMATE proof**, so the timeout only ever kills a genuine
   hang, never false-REDs real work. The slow case is a `db: true` node ([ADR-0064](0064-widen-the-inner-loop-proof-envelope-db-backed-proofs-spine-d.md))
   whose first Cloud SQL connection rides a cold-start / idle-wake handshake — measured ~5–6 min, and
   it can APPROACH the 10-min default. A single global value must be generous enough for that worst
   case, which makes it loose for everything else.
2. **A fast builtins-only `node:test`** would benefit from a TIGHTER budget so a genuine hang is caught
   in seconds, not after 10 idle minutes — the opposite pull from (1). One global number cannot serve
   both.
3. **The proof config is already the node's deliberate authoring surface** ([ADR-0057](0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md)):
   a node declares HOW it is proved in its `proof:` block (`real.testFile` / `sourceFile` / `scope` /
   `proofCommand` / `db` / `addDeps` / …). A per-node budget belongs there — declared, validated,
   reviewed — not injected on the inner command.

## Decision

**Both: the spine-wide default stays the FALLBACK, and a node may OVERRIDE it per-node.** Add an
optional `timeoutMs?: number` to `RealProofConfig` — the deliberate, schema-validated authoring surface
for the override:

- **The field is on the node's PROOF SPEC, not the inner `proofCommand`.** `ShellCommand.timeoutMs`
  stays absent from `ShellCommandSchema` (a node author still cannot inject a budget on the raw command
  string); `RealProofConfig.timeoutMs` is the one validated place the override is declared.
  `RealProofConfigSchema` accepts a **positive int** (ms) — `execFile` reads `0`/absent as NO timeout,
  so a `0`/negative budget would silently disable the fail-closed backstop and is refused.
- **One oracle, one budget.** `realProofCommand` stamps the declared `timeoutMs` onto the SINGLE
  resolved proof command, so BOTH the spine's out-of-band CONFIRM observation AND the leaf's `run_proof`
  feedback ride the same budget — they can never diverge (the existing one-oracle property the db-env
  spread already relies on).
- **Absent → the spine-wide default.** A node that declares nothing keeps `timeoutMs` OFF its config
  (absent-not-undefined spread), so it rides `DEFAULT_PROOF_TIMEOUT_MS` and its registry-vs-spec parity
  `deepEqual` stays byte-for-byte intact (the migrated nodes are untouched).

The motivating use: a `db: true` node whose cold Cloud SQL handshake can approach 10 min declares a
longer `real.timeoutMs` to remove the false-RED risk; conversely a fast node declares a tighter one so a
hang is caught sooner.

## Consequences

**Good.**
- A genuinely-slow proof (the cold-connector `db: true` case) can no longer false-RED because the
  spine-wide default was tuned for the average; it declares its own budget, in the open.
- A fast proof can fail a hang FAST instead of waiting out the global 10-min ceiling.
- The honesty wall is unchanged: the override only sets the wall-clock BUDGET; it cannot forge a green
  (a real red must still be observed first), cannot inject a command/cwd/env, and a non-positive budget
  is refused — the backstop can never be silently disabled.

**Bad / costs / follow-on.**
- A node author can now declare a budget; an over-generous per-node value re-opens the "slow to fail a
  hang" window for THAT node (a local, reviewed trade-off, not a global regression). Bounding it is the
  same PR-diff review that bounds the rest of the `proof:` block.
- The override is owner-gated by need: most nodes should declare nothing and ride the default. This ADR
  adds the dial; it does not mandate using it.

## References

- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — **amended**: the gate's CONFIRM
  observation fails closed on a hung proof; its timeout budget is now per-node overridable, not
  spine-wide only.
- [ADR-0057](0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md) — the node-borne `proof:` block this field extends
  (`RealProofConfig`).
- [ADR-0064](0064-widen-the-inner-loop-proof-envelope-db-backed-proofs-spine-d.md) — the `db: true`
  cold-connector proof that motivates a longer per-node budget.
- [PR #350](https://github.com/HuaMick/storytree/pull/350) — the spine-wide proof timeout
  (`DEFAULT_PROOF_TIMEOUT_MS`, the SIGKILL backstop) this override sits beside.
- `packages/orchestrator/src/proof-config.ts` (`RealProofConfig.timeoutMs` + schema),
  `packages/orchestrator/src/resolve-prove-spec.ts` (`realProofCommand` stamps it on the one command),
  `packages/orchestrator/src/shell-test-executor.ts` (`DEFAULT_PROOF_TIMEOUT_MS`, the fallback) — the
  mechanism this ADR records.
</content>
</invoke>
