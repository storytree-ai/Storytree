---
id: "witnessable-verdict"
tier: contract
story: drive-machinery
title: "Select a live-artifact witness for the REAL-build UAT leg"
outcome: "A pure function selects, from a set of signed verdict rows, the newest spine-driven DRIVEN-tier passing verdict for a drive-machinery node that is recent and lands in main's ancestry — or reports why none qualifies — so a cheap gate can witness that a real --real build happened without re-running it."
status: proposed
proof_mode: contract-test
depends_on: []
# Node-borne proof config (ADR-0057): authoring THIS block is what makes the node buildable — no
# NODE_BUILD_REGISTRY edit. NET-NEW, dependency-free (no install): witnessable-verdict.ts imports
# only relative files + defines its OWN local interfaces (no cross-package value import), so the red
# is genuine — the file does not exist at HEAD, so the authored test's `import { selectWitnessableVerdict }
# from "./witnessable-verdict.js"` fails until IMPLEMENT writes it. This node is the pure core of the
# ADR-0184 leg-3 observe gate (drive-machinery#gate-6); its own --real verdict IS leg 3's live proof.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "test"]
  scope:
    testGlobs: ["packages/drive/src/**/*.test.ts"]
    sourceGlobs: ["packages/drive/src/**/*.ts"]
  real:
    testFile: "packages/drive/src/witnessable-verdict.test.ts"
    sourceFile: "packages/drive/src/witnessable-verdict.ts"
    scope:
      testGlobs: ["packages/drive/src/witnessable-verdict.test.ts"]
      sourceGlobs: ["packages/drive/src/witnessable-verdict.ts"]
---

# Select a live-artifact witness for the REAL-build UAT leg

**Outcome —** A pure function selects, from a set of signed verdict rows, the newest spine-driven
DRIVEN-tier passing verdict for a drive-machinery node that is recent and lands in `main`'s ancestry —
or reports why none qualifies — so a cheap gate can witness that a real `--real` build happened
without re-running it.

> **The ADR-0184 leg-3 witness core.** Story UAT leg 3 ("The REAL build") converts from `human` to
> `machine` (ADR-0184): the heavy, subscription-funded `--real` run stays OUT-OF-BAND (a live SDK
> spawn never runs on a gate pass, ADR-0010 §5), and a cheap observe gate (`drive-machinery#gate-6`)
> VERIFIES the persisted signed artifact instead. This pure function is that gate's core: given the
> `events.verdict` rows (read by the gate's runnable), an injected git-ancestry oracle, and a clock,
> it decides whether a genuine live proof exists. A DRIVEN-tier verdict (`contract`/`capability`/
> `story` — one of the three tiers' automated red→green ladders, ADR-0007) is required: the
> observe-and-sign `adopted` mode (ADR-0085) is explicitly NOT a driven red→green and must be
> rejected. Freshness is the ADR-0016 ageing floor — an ancient verdict is too stale to witness a
> "we still build for real" claim, forcing a periodic deliberate re-run (ADR-0184 d.3/d.5). NET-NEW
> and dependency-free so the prove-it-gate's red is genuine; the authored status stays `proposed`
> forever (`healthy` is only ever derived from signed verdicts, ADR-0020).

## Guidance

ONE dependency-free pure function in `packages/drive/src/witnessable-verdict.ts`. Define these local
interfaces + constant and export them alongside the function (NO cross-package import — keep it a pure
data transform over its own shapes, so the worktree needs no install):

```ts
/** One signed-verdict row read from events.verdict (only the fields the witness check reads). */
export interface VerdictRow {
  readonly unitId: string;
  readonly proofMode: string; // contract | capability | story | operator-attested | adopted
  readonly outcome: string; // pass | fail
  readonly signer: string;
  readonly commitSha: string;
  readonly at: string; // ISO-8601 timestamp
}

/** The DRIVEN proof modes — the three tiers' automated red→green ladders (ADR-0007). */
export const DRIVEN_PROOF_MODES = ["contract", "capability", "story"] as const;

export interface WitnessPolicy {
  /** The drive-machinery node ids a witnessing verdict's unitId must be one of. */
  readonly driveMachineryNodeIds: readonly string[];
  /** Freshness floor: a verdict older than this many days is too stale to witness (ADR-0016). */
  readonly freshnessDays: number;
}

export interface WitnessDeps {
  /** True when commitSha is an ancestor of HEAD (git merge-base --is-ancestor). Injected → shallow-safe test. */
  ancestorOfHead(sha: string): boolean;
  /** The current time (injected → deterministic test). */
  now(): Date;
}

export type WitnessResult =
  | { ok: true; verdict: VerdictRow }
  | { ok: false; reasons: string[] };

export function selectWitnessableVerdict(
  rows: readonly VerdictRow[],
  policy: WitnessPolicy,
  deps: WitnessDeps,
): WitnessResult;
```

Semantics — a row QUALIFIES iff ALL hold:
- `outcome === "pass"`;
- `proofMode` is one of `DRIVEN_PROOF_MODES` (never `"adopted"` / `"operator-attested"` — those are
  not a driven red→green);
- `unitId` is in `policy.driveMachineryNodeIds`;
- age in days `(deps.now() − Date.parse(row.at)) / 86_400_000 ≤ policy.freshnessDays` (a verdict dated
  in the future is fine — age ≤ 0 ≤ freshnessDays);
- `deps.ancestorOfHead(commitSha)` is true.

Note on the `signer` field: a DRIVEN-tier verdict is by definition spine-PRODUCED — the
prove-it-gate walked a genuine red→green and emitted it (ADR-0020), which is exactly why the
`proofMode` check IS the "spine-driven, not adopted" test. Its `signer` records the accountable
human (the operator, per the ADR-0097 signer/approvedBy split); the `adopted` mode — the one
actually signed by the spine principal `spine@storytree` — is precisely what the
`proofMode ∈ DRIVEN_PROOF_MODES` check excludes. So the function reads `signer` only for the reason
messages, never as a qualification criterion. Keep the `signer` field on `VerdictRow` (the gate's
runnable reads it from the DB column).

Return `{ ok: true, verdict }` with the NEWEST qualifying row (max `at`); if none qualifies, return
`{ ok: false, reasons }` with ONE human-readable reason per row that was a near-miss (naming the unit
+ what disqualified it), plus a catch-all line when `rows` is empty. Keep it total — never throw on a
malformed `at` (treat an unparseable timestamp as a disqualifying reason, not a crash). Do not mutate
the input. Type-only discipline: no `process`, no `fs`, no network, no cross-package import.

## Contract

1. **`witnessable-verdict-selects-the-live-proof`** — `selectWitnessableVerdict` returns the newest
   genuine live-build witness, or an honest refusal naming what disqualified each candidate.
   - **asserts —**
     - a row that is a `pass`, `contract`-mode, spine-driven, drive-machinery-node, recent, and
       ancestor-of-HEAD verdict → `{ ok: true }` with that row as `verdict`;
     - an otherwise-valid row whose `proofMode` is `"adopted"` is REJECTED (the DRIVEN teeth — an
       observe-and-sign verdict is not a driven red→green); likewise `"operator-attested"`;
     - a row whose `unitId` is not in `policy.driveMachineryNodeIds` is rejected;
     - a row older than `policy.freshnessDays` is rejected (the freshness floor);
     - a row whose `commitSha` the injected `ancestorOfHead` returns false for is rejected;
     - a `fail`-outcome row is rejected;
     - an empty `rows` array → `{ ok: false }` with a non-empty `reasons`;
     - when MULTIPLE rows qualify, the one with the greatest `at` is returned.
   - **proven by —** `packages/drive/src/witnessable-verdict.test.ts` (authored by the leaf inside the
     gate's AUTHOR_TEST phase; the red is observed by the spine before `witnessable-verdict.ts` exists).
