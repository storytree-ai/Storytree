---
status: accepted
decided: 2026-07-29
amends: [120]
---
# ADR-0263: Narrow the live-to-seed export scope to the durable tier: an allowlist, not a denylist

## Status

accepted (2026-07-29) — the owner opened this fork in conversation ("are they all genuinely
export-scope, or is the export scope itself too wide? … the outcome should be a decided, documented
floor") and delegated the call, so design-time alignment IS the ratification (ADR-0110). It is also
the direct application of two already-accepted decisions to kinds that did not exist when either was
written — [ADR-0183](0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md) D2's
seed-exclusion of a live-only kind, and [ADR-0120](0120-live-to-seed-reconciliation-export-corpus-and-unit-status-to.md)
D4's ruling that the work-hierarchy tier stays out of the knowledge tier — so it is flipped green at
authorship (ADR-0084). Nothing in ADR-0120's owner-directed calls is re-decided: this ADR changes
WHICH KINDS the export covers, never its conflict policy.

## Context

ADR-0120 decision 3 built the live→seed export and set its scope in code, as a **denylist**:

```ts
// packages/library/src/store/export-corpus.ts
export function isExportScopeKind(kind: string): boolean {
  return STRUCTURED_KINDS.has(kind) && kind !== AGENT_KIND && !EPHEMERAL_KINDS.has(kind);
}
```

Every structured kind is in scope unless something remembers to exclude it. That predicate landed
`5d8977f8` (2026-06-27). **Three of today's kinds post-date it:**

| kind | introduced | commit | ever given a scope decision? |
| --- | --- | --- | --- |
| `friction` | 2026-07-06 | `ba1fe78d` | no |
| `arc` | 2026-07-11 | `9df5ce41` | no |
| `plan` | 2026-07-11 | `9df5ce41` | **yes** — ADR-0183 D2 excluded it |
| `uat-criterion` | 2026-07-18 | `fadedb03` | no |

`plan` was excluded in the same commit that introduced `arc`, and only `plan`. The other three joined
the seed export **silently, by default**, because a denylist enrols anything nobody thinks to deny.
This is not a bug in anyone's reasoning; it is the failure mode of the predicate's SHAPE.

**What that silently enrolled, measured against the live store on 2026-07-29:**

```
live-only export-scope artifacts the export would ADD to knowledge.json:  236
  friction         177        arc               23        uat-criterion    22   →  222  (94%)
  guardrail          4        definition         3        process           2
  pattern            2        principle          2        techstack         1   →   14  (6%)
```

The seed has **never held one of them.** Its 172 entries are `principle` 56, `definition` 48,
`pattern` 22, `process` 14, `guardrail` 13, `agent` 12, `techstack` 6, `open-question` 1 — zero
`friction`, zero `arc`, zero `uat-criterion`. Running the sanctioned drain today is measured at
**+6074 / −108 lines**, taking `knowledge.json` from 584 KB to 2.17 MB (**3.7×**), of which 94% is
material the durable seed has never carried.

Three properties make this worse than a large diff.

**1. It is a one-way ratchet.** `computeExportedSeed` NEVER deletes (ADR-0120's own invariant, and a
correct one), and `diffCorpusContent` SKIPS any seed id live has no row for. So a friction item
exported into the seed and later adjudicated-and-removed live leaves a seed entry that is permanent
AND invisible to every check. The transient tiers are precisely the ones that drain; the seed is
precisely the surface that cannot.

**2. It converts the drain ceiling into a growth counter.** The V axis of `check:corpus-content`
counts artifacts present in BOTH sides whose bodies differ. Editing a seeded artifact live is
therefore +1 V. And the transient kinds are edited by ORDINARY CEREMONY, not by curation:

- an `arc` gains an increment-log entry on **every landing** — that append is a step of the merge
  ceremony itself (ADR-0183 D1);
- a `friction` item has `route` / `routeReason` written at adjudication (ADR-0168 D5);
- a `uat-criterion` is stamped as legs are attested.

Seeding 222 such artifacts would mean routine work reds a shared gate continuously. The ceiling
would become undrainable by construction — the exact condition ADR-0252 D3 built it to prevent.

**3. Two accepted decisions already cover two of the three.** ADR-0183 D2 excluded `plan` from "the
seed and every seed ceremony" for a reason stated in the ADR — *"else every live plan reads as seed
drift forever"* — that is a property of live-only lifecycle, not of the word `plan`. And ADR-0120's
OWN decision 4 kept the work-hierarchy tier out of the knowledge tier, routing unit status to a
separate generated file so it would not enter `knowledge.json`; `uat-criterion` ids are
story-scoped (`drive-machinery#uat-1`, `library-review#uat-3`) and are that same tier.

## Decision

**The seed export scope becomes an explicit ALLOWLIST of the durable tier**, `SEED_SCOPE_KINDS`,
declared once in `packages/library/src/knowledge.ts` next to `EPHEMERAL_KINDS`:

```
definition · principle · pattern · guardrail · techstack · process · open-question · proposal
```

Excluded, each for a decision already on the record:

| excluded kind | why | decision |
| --- | --- | --- |
| `agent` | seed-canonical; owned by `sync-agents` | ADR-0055 |
| `template` | generated by `libraryTemplates()`, not authored | ADR-0210 |
| `plan` | ephemeral, live-only choreography | ADR-0183 D2 |
| `friction` | transient signal; files and DRAINS, durable essence graduates OUT | ADR-0168 / ADR-0095 |
| `arc` | initiative STATE + pointers, not durable guidance; mutated by every landing | ADR-0183 D1 |
| `uat-criterion` | work-hierarchy tier, kept out of the knowledge tier | ADR-0120 D4 |

Two structural consequences of the shape, both load-bearing:

1. **A new kind is OUT until deliberately admitted.** The default flips from enrol to exclude, so the
   silent-enrolment path that produced this backlog cannot recur. Admitting a kind is an edit to one
   named constant with this ADR's table to answer to.
2. **One predicate, both directions.** `export-corpus`'s `isExportScopeKind` and `sync-corpus`'s
   `seedScope` are today two near-duplicate filters that must agree; both now derive from
   `SEED_SCOPE_KINDS`, so ADR-0183 D2's requirement that *every* seed ceremony ignore an
   out-of-scope kind is satisfied by construction rather than by remembering twice.

**This narrowing does not, and may not, move the gate's number.** `check:corpus-content`'s V axis
counts only ids present in BOTH seed and live, and all 13 currently drifted are durable-tier
(`definition` ×5, `process` ×4, `techstack` ×3, `principle` ×1). V is therefore **13 before and 13
after** — verified, not assumed. Narrowing a measured population to make a ceiling look better is the
named gaming failure mode on `process:verification-decay-detection`; this change is exempt from that
charge by measurement, and the exemption is the reason the measurement is recorded here.

## Consequences

**Good — the sanctioned drain becomes usable, and the backlog becomes drainable to zero.** The batch
export drops from 13 updates + 236 additions to **13 updates + 14 additions**: a reviewable diff a
librarian can actually read per-artifact. `corpus-content-drain.ts` predicted this repair in its own
header — *"a future increment may find the honest repair is a per-artifact export verb rather than a
lower V"* — and the measurement says the cheaper repair is the right one: all-or-nothing is only
dangerous because the "all" is 249 artifacts. At a drained backlog, "all" is "the thing I changed",
and the verb needs no splitting.

**Good — the 14 remaining additions are exactly what the seed is for.** They are graduated durable
artifacts that live-only (ADR-0095 graduation output) — among them `process:verification-decay-detection`,
ADR-0252 D4's own process artifact, which has been invisible on disk since it was authored.

**Done in this landing, and the reason the narrowing was worth doing rather than merely correct.** The
drain was run: a `librarian-curator` pass judged direction on all 13 drifted artifacts and found **11
live-canonical and 2 MIXED** — `stack-claude-agent-sdk` and `stack-pi-coding-agent`, where an
ADR-0232-era live rewrite had dropped four corpus-unique, code-verified facts (the SDK version pin, the
`Bash`-excluded leaf tool surface, the bounded `mcp__spine__*` feedback tools, and the pivot-out
re-export tripwire) while correctly adding Codex. Those two live bodies were repaired FIRST, then the
export ran: **+390 / −108**, and `check:corpus-content` now reports OK across 174 export-scope
artifacts. A blanket export at the old scope would have destroyed those four facts *and* written 222
transient artifacts — the same act, twice wrong.

**Consequent — the drain ceiling is tightened from V=14 to V=0** (`corpus-content-drain.ts`), which is
tightening-only as ADR-0252 D3 requires and is what that file already named as "the wanted resting
place". Zero is affordable now precisely because of this ADR: the remedy for a breach is one command
(`export-corpus --pg --write`) that, at a drained backlog, carries only the artifact the breaching
session edited. The header's own prediction — that the honest repair would be a per-artifact export
verb — is recorded there as resolved the other way: the defect was the population, not the verb's
granularity.

**Bad, and accepted — the transient tiers stay invisible offline.** Friction, arcs, and UAT criteria
remain unreadable without a DB, which is already a filed friction
(`offline-friction-list-reports-zero-as-nothing-to-report`). This ADR does not fix that and should not:
the remedy, if it is ever wanted, is ADR-0120 D4's own shape — a separate, clearly-`@generated` view
that is a projection and not an edit surface — never the canonical seed, which cannot delete and so
cannot track a tier that drains.

**Bound — a degraded live body in an excluded kind stops being reported.** `map-connection-legibility-arc`
currently surfaces as the exporter's one REFUSED body; once `arc` leaves the scope, the exporter
ignores it rather than refusing it. The fault is real but was never gate-visible anyway (the D axis
compares only ids present in both sides, and it is live-only), so nothing regresses — but it is
recorded here so the disappearance of that line is not read as a repair.

## References

- [ADR-0120](0120-live-to-seed-reconciliation-export-corpus-and-unit-status-to.md) — the export this
  amends: its conflict policy (decision 3, owner-directed) is unchanged; only the kind scope moves.
  Its decision 4 is the precedent for keeping the work-hierarchy tier out of `knowledge.json`.
- [ADR-0183](0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md) D2 — the
  seed-exclusion this generalises, and D1's "an arc is not durable guidance … state and pointers only".
- [ADR-0252](0252-verification-decay-detection-continuous-mechanical-warns-a-j.md) D3 — the drain
  ceiling this unblocks; its remedy is a drain, never a raise, and this ADR is what makes the drain
  reachable.
- [ADR-0168](0168-session-retro-friction-every-session-feeds-friction-to-the-l.md) /
  [ADR-0095](0095-agent-memory-graduates-into-the-library-as-a-signal-sourc.md) — friction files,
  drains, and graduates its durable essence OUT; the item itself is signal, not knowledge.
- [ADR-0055](0055-the-library-agent-tier-is-seed-canonical-sync-agents-reconci.md) /
  [ADR-0210](0210-retire-the-generated-apps-studio-data-assets-json.md) — the two pre-existing
  exclusions the allowlist preserves.
- Code: `packages/library/src/knowledge.ts` (`SEED_SCOPE_KINDS`),
  `packages/library/src/store/export-corpus.ts` (`isExportScopeKind`),
  `packages/library/src/store/sync-corpus.ts` (`seedScope`),
  `packages/cli/src/corpus-content-drain.ts` (the ceiling this unblocks).
