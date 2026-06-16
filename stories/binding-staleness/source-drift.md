---
id: "source-drift"
tier: contract
story: binding-staleness
title: "A pure source-drift classifier over the derives_from DAG"
outcome: "A pure classifier mirrors classifyDrift but over an artifact's derives_from upstreams (ADR-0017) — an upstream ADR/artifact whose content changed makes the artifact source-drifted; a described change → stale, an undescribed one → demoted, none → fresh — the second of ADR-0016's two drift signals."
status: proposed
proof_mode: contract-test
depends_on: []
decisions: [16]
# Node-borne proof config (ADR-0057 keystone A): authoring THIS block is what makes the node
# inner-loop buildable. NET-NEW, install-free leaf: source-drift.ts uses ONLY `import type` from
# ./anchor.js (erased by tsx) and reimplements the one-line described-change check inline, so it has NO
# runtime dependency — the fresh worktree needs no node_modules, the default `node --import tsx --test`
# proof on the single test file resolves it. The red is genuine: source-drift.ts does not exist at HEAD,
# so the authored test's `import { classifySourceDrift } from "./source-drift.js"` fails until IMPLEMENT
# writes the module. (No install ⇒ no typecheck/regression backstop — the same shape as the blind-dogfood
# net-new leaves; the module is type-checked at CI.)
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/core", "test"]
  scope:
    testGlobs: ["packages/core/src/**/*.test.ts"]
    sourceGlobs: ["packages/core/src/**/*.ts"]
  real:
    testFile: "packages/core/src/source-drift.test.ts"
    sourceFile: "packages/core/src/source-drift.ts"
    scope:
      testGlobs: ["packages/core/src/source-drift.test.ts"]
      sourceGlobs: ["packages/core/src/source-drift.ts"]
---

# A pure source-drift classifier over the derives_from DAG

**Outcome —** A pure classifier mirrors `classifyDrift` but over an artifact's `derives_from` upstreams
(ADR-0017) — an upstream ADR/artifact whose content changed makes the artifact **source-drifted**; a
described change → `stale`, an undescribed one → demoted, none → `fresh` — the second of ADR-0016's two
drift signals.

> **The gap this closes (ADR-0016 §4 — "Two drift signals").** Code-drift (a binding's covered span
> changed) is handled by [`classifyDrift`](../../packages/core/src/anchor.ts). The OTHER signal is
> **source-drift**: an artifact's source ADR or upstream artifact changed (the `derives_from` DAG,
> ADR-0017). This unit adds the pure, standalone classifier for it — the same three honest states, the
> same described-change gate, but keyed on the upstreams' content rather than one span's. It is
> deliberately STANDALONE (no store, no DAG walk, no new dependency): it takes the resolved upstream
> hashes + change log and classifies. Walking the real `derives_from` graph to gather those inputs is a
> later wiring slice.

## Guidance

ONE net-new pure module `packages/core/src/source-drift.ts`. **Type-only imports only**, so the module
has NO runtime dependency (keeps the inner-loop leaf install-free — `anchor.ts` imports `zod`, so a
VALUE import of anything from it would pull `zod` into a worktree with no `node_modules`):

```ts
import type { ChangeEvent, DriftState } from "./anchor.js";
```

Export these and nothing else:

```ts
/** One `derives_from` upstream of an artifact: its id + the content-hash bound when the artifact derived from it. */
export interface SourceRef {
  /** The upstream artifact/ADR id (a `derives_from` edge target). */
  id: string;
  /** The upstream's content-hash (hashSpan) bound at derive time — the source anchor this drifts against. */
  boundHash: string;
}

/** The result of a source-drift check — ADR-0016 §4's signal, mirroring DriftFlag's three honest states. */
export interface SourceDriftFlag {
  /** `fresh` | `stale` | `drifted-undescribed` (the same DriftState as code-drift). */
  state: DriftState;
  /** True iff ANY upstream's current hash differs from the hash bound at derive time. */
  drifted: boolean;
  /** The ids of the upstreams that changed (current hash ≠ bound hash), in `sources` order. */
  changedSources: string[];
  /** The latest DESCRIBED change explaining a changed upstream — present ONLY for `stale`. */
  description: string | undefined;
}

export function classifySourceDrift(
  sources: readonly SourceRef[],
  currentHashes: ReadonlyMap<string, string>,
  changes: readonly ChangeEvent[],
): SourceDriftFlag;
```

Behaviour — a faithful mirror of `classifyDrift`, lifted from one span to a set of upstreams:

1. **`changedSources`** — the ids of every `s` in `sources` whose CURRENT hash is present and differs
   from its bound hash: `currentHashes.get(s.id) !== undefined && currentHashes.get(s.id) !== s.boundHash`.
   (An upstream absent from `currentHashes` is "unknown", NOT drifted — the conservative, ADR-0016 bias:
   don't manufacture staleness from a missing input. Keep `changedSources` in `sources` order.)
2. **`drifted`** = `changedSources.length > 0`.
3. **`fresh`** — `!drifted`: `{ state: "fresh", drifted: false, changedSources: [], description: undefined }`.
4. Otherwise, the DESCRIBED-change gate (ADR-0016 §2-3). Of the `changes`, the ones that EXPLAIN a
   changed upstream are those whose `unitId` is in `changedSources` AND whose `description` is non-blank
   (reimplement the check inline — do NOT import `isDescribed` as a value, that would pull `zod`):
   `changes.filter((c) => changedSources.includes(c.unitId) && c.description !== undefined && c.description.trim().length > 0)`.
   - **none** → `{ state: "drifted-undescribed", drifted: true, changedSources, description: undefined }`
     (demoted — a source moved but nothing describes why; never a re-UAT trigger).
   - **some** → `{ state: "stale", drifted: true, changedSources, description: <latest by `at`> }` — the
     latest described change wins (`reduce((a, b) => (b.at >= a.at ? b : a))`, taking its `description`).

Keep it total and dependency-light: no `process`, no `fs`, no network, no `zod`, no value import from
`anchor.ts`. Copy array fields where needed so the result never aliases the input.

**The red the spine observes (before IMPLEMENT):** the test imports `classifySourceDrift` from
`./source-drift.js`, which does not exist at HEAD, so the import fails — a genuine red. After IMPLEMENT
the module exists and every assertion passes.

## Contract

1. **`source-drift-mirrors-the-three-states`** — `classifySourceDrift` flags an artifact's source-drift
   over its `derives_from` upstreams with the same three honest states and described-change gate as
   `classifyDrift`.
   - **asserts —**
     - **fresh** — one upstream `{ id: "adr-16", boundHash: "h1" }`, `currentHashes` = `{ "adr-16" => "h1" }`,
       no changes → `state: "fresh"`, `drifted: false`, `changedSources: []`, `description: undefined`;
     - **drifted-undescribed** — same upstream but `currentHashes` = `{ "adr-16" => "h2" }`, no changes (or
       only a blank-description change) → `state: "drifted-undescribed"`, `drifted: true`,
       `changedSources: ["adr-16"]`, `description: undefined`;
     - **stale** — same changed upstream plus a described change
       `{ unitId: "adr-16", hashBefore: "h1", hashAfter: "h2", description: "reworded the north star", author: "x", at: "2026-06-16T00:00:00.000Z" }`
       → `state: "stale"`, `drifted: true`, `changedSources: ["adr-16"]`, `description: "reworded the north star"`;
     - **conservative on a missing input** — an upstream absent from `currentHashes` is NOT counted as
       changed (e.g. two upstreams, only one present-and-equal → `fresh`);
     - **latest described wins** — two described changes on the changed upstream → the one with the
       greater `at` supplies `description`.
   - **proven by —** `packages/core/src/source-drift.test.ts` (authored by the leaf inside the gate's
     AUTHOR_TEST phase; the spine observes the red — the missing `./source-drift.js` module — before
     IMPLEMENT writes it).
