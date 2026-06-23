---
status: proposed
decided: 2026-06-23
amends: [7, 20]
---
# ADR-0099: Synthetic smoke verdicts must not derive a green unit

## Status

proposed — surfaced 2026-06-23 by the session that resolved the `library` false-green crown (the
story-author reliability assessment + the synthetic-verdict retirement). The owner directed this be
drafted as a proposed ADR (escalated, not silently decided): the **principle** below — a synthetic
smoke must never derive a green unit — is the owner's stated intent, but the **enforcement mechanism**
(options A/B in the Decision) is left for owner ratification + build-time choice. It **amends
[ADR-0007](0007-proof-model.md)** (the proof-mode vocabulary gains a synthetic/real distinction) and
**[ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md)** (the no-forged-healthy enforcement
extends to the `--live` persistence path). It overturns no honesty wall — it CLOSES a hole in one.

## Context

The `library` story crown derived **GREEN** when its real reliability did not warrant it. The
story-author root cause (genuinely-untested pockets with no `build-tests` gate) is fixed in the same
unit as this ADR. This ADR is about the **second, deeper** root cause the incident exposed.

`events.verdict` held **22 verdicts** for the `library` story + its 7 capabilities, all pinned to the
sentinel commit `live-smoke-synthetic-tree`, signed by a human, proofMode `capability` / `story`, from
`story build library --live --store pg` runs on 2026-06-14/17. A `--live` smoke runs the SDK leaf
against a **synthetic `add(2,3)` task** in a temp workspace — it proves the GLUE (spec → ProveSpec →
gate → signed verdict → rollup), **NOT the capability's real feature** (the honest framing is already
printed by `packages/cli/src/node-build.ts`). Yet each such verdict is signed with proofMode
`capability` — **identical to a real capability proof** — and `rollupStatus`
([rollup.ts](../../packages/orchestrator/src/proof/rollup.ts)) grants `healthy` from any `pass`
verdict whose proofMode is one of the automated ladders. So a synthetic glue-smoke marked all seven
capabilities `healthy`, including `seed-corpus-scripts` (which has **no real test at all**).

The forces that let this happen:

1. **The proof model has no synthetic/real axis ([ADR-0007](0007-proof-model.md)).** `ProofMode` is
   `contract | capability | story | operator-attested | adopted`. Those name the proof's TIER and its
   BASIS (driven vs operator-attested vs adopted-observed) — but nothing records that a `capability`
   pass came from a synthetic `add(2,3)` smoke rather than the cap's real proof command. `--live`
   (synthetic task) and `--real` (the cap's real Phase-F proof command) sign the **same** proofMode.
2. **`--store pg` is refused for dry-runs but ALLOWED for `--live`** (`node-build.ts` refuses pg only
   for the scripted walk — "a dry-run's PASS is synthetic by construction"). The exact same reasoning
   applies to a `--live` smoke (its task is equally synthetic), but the refusal does not extend to it,
   so a synthetic PASS persists into the shared verdict log and greens the unit.
3. **[ADR-0094](0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md) disowned the
   approach but did not ENFORCE it.** It removed the library's synthetic `real:`/live arms because a
   live-smoke over a mature artifact proves nothing about the artifact — but that is an authoring
   guideline; nothing in the spine STOPS a `--live --store pg` run from persisting a greening verdict.
4. **It defeats the [ADR-0097](0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md)
   coverage guarantee.** ADR-0097 makes a green crown MEAN "the untested pockets got real coverage": a
   capability greens only via its own real proof or an adopted gate that `(covers:)` it. A synthetic
   `capability` verdict is a **back-door** straight past that — it greens a cap with no real proof and
   no honest gate. Retiring the 22 rows fixed the symptom; nothing stops the next `--live --store pg`
   from re-creating it.

The sentinel sha (`live-smoke-synthetic-tree`) was historical — the current `--live` path signs with a
**real** HEAD sha (`story-build.ts`). That makes the gap WORSE, not better: a synthetic verdict can no
longer even be spotted by its commit. The only durable signal is the proof's NATURE, recorded at sign
time.

## Decision

**The principle (owner's stated intent): a synthetic smoke proof must never derive a `healthy` /
green unit.** A `--live` glue-smoke may prove the pipeline works and may be visible as activity, but
it must be IMPOSSIBLE for it to green a capability, story, or contract — green stays reserved for a
real driven proof ([ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md)), an `adopted`
observation ([ADR-0085](0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md)), or an
`operator-attested` human witness. This refines [ADR-0007](0007-proof-model.md): the proof model gains
an explicit **synthetic ⟂ real** distinction, alongside the existing tier and basis axes.

**The enforcement mechanism is the open call for the owner to ratify** (both honour the principle;
they trade recorded-visibility against simplicity):

- **Option A — a distinct non-greening proof marker (richer; keeps the smoke recordable).** A `--live`
  smoke signs with a synthetic marker — either a new `smoke` `ProofMode` or a `synthetic: true` flag on
  the `Verdict` — and `rollupStatus` treats it like a `building` activity mark: visible in the log and
  the world, but it NEVER sets `healthy`. This mirrors how `adopted` is "first-class but weaker, never
  silently equated with a driven pass" ([ADR-0085](0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md)).
  Cost: a verdict-shape + rollup change threaded through proof-protocol → orchestrator → the readers.
- **Option B — refuse `--store pg` for `--live` (minimal; the smoke simply does not persist).** Extend
  the existing dry-run pg refusal to the `--live` smoke: a synthetic PASS is never written to the
  shared log at all, so it can never green anything. `--live` stays a real, billed SDK smoke whose
  value is the live console walk, not a persisted verdict; `--real` (the cap's real Phase-F proof
  command) remains the only `--store pg`-eligible live path. Cost: a `--live` run can no longer record
  any durable mark of having run — acceptable if a synthetic proof should leave no persisted trace.

**Recommended:** start with **Option B** (it directly closes the persistence hole ADR-0094 already
disowned, is a few-line spine change, and is fully fail-closed), and adopt **Option A** later only if
a real need to RECORD live-smoke activity as a non-greening signal emerges. Either way, the rollup
must be the backstop: even if a synthetic verdict reaches the log, `rollupStatus` must not grant
`healthy` from it. Retiring already-persisted synthetic verdicts (as done for `library`'s 22) is a
one-time data cleanup, not the fix — the fix is that the spine can never persist a greening synthetic
verdict again.

## Consequences

**Good.**
- A green crown / plant means a REAL proof, an adopted observation, or a human witness — never a glue
  smoke. The [ADR-0097](0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md) coverage
  guarantee becomes structurally enforceable, not just authored.
- The `--live` smoke keeps its legitimate role (prove the pipeline cheaply) without the power to forge
  a healthy — closing the gap [ADR-0094](0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md)
  named but did not wall off.
- No honest signal is lost: real `--real` proofs, `adopted` gates, and `operator-attested` witnesses
  are untouched.

**Bad / costs / follow-on.**
- A behaviour change to `--live` (Option B refuses a flag combination that works today; Option A
  changes the verdict shape). Either touches the spine and its tests; Option A also touches every
  verdict reader.
- The model is the decision; the **enforcement mechanism is unbuilt** pending the owner's A/B choice.
- **Surfaced, not decided here:** whether ALREADY-persisted synthetic verdicts in OTHER stories
  (beyond `library`'s now-retired 22) should be swept. A live query + targeted retirement is the same
  one-time cleanup; out of scope for this model decision.
- A guard test is owed (a synthetic `pass` verdict must NOT derive `healthy` in `rollupStatus`) — the
  red→green that earns whichever option is chosen.

## References

- [ADR-0007](0007-proof-model.md) — the proof model + `ProofMode` vocabulary (**amended**: gains an
  explicit synthetic ⟂ real distinction).
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — red-green enforcement, "a scripted /
  synthetic PASS persisted would be a forged healthy" (**amended**: the no-forged-healthy enforcement
  extends to the `--live` persistence path, not just dry-runs).
- [ADR-0094](0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md) — disowned the
  library's synthetic live arms as an authoring guideline; this ADR makes it a spine-enforced wall.
- [ADR-0097](0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md) — the coverage
  guarantee this protects (a green crown MEANS the untested pockets got real coverage).
- [ADR-0030](0030-all-in-on-claude-agent-sdk.md) — `--live` is the subscription-funded SDK smoke whose
  contract this refines.
- `packages/orchestrator/src/proof/rollup.ts` (`rollupStatus` — the backstop), `packages/cli/src/node-build.ts`
  (the `--store pg` refusal that currently exempts `--live`), `packages/proof-protocol/src/enums.ts`
  / `proof.ts` (the `ProofMode` / `Verdict` shape an Option-A marker would extend) — the compute +
  shapes this model touches.
- `stories/library/story.md` — the incident's canonical story; its 22 synthetic verdicts (commit
  `live-smoke-synthetic-tree`) were the retired evidence.
