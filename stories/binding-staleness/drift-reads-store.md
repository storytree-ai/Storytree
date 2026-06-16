---
id: "drift-reads-store"
tier: capability
story: binding-staleness
title: "storytree drift reads a unit's stored anchor + change log"
outcome: "storytree drift <unit> reads the unit's stored Anchor + change log from the store, re-fingerprints the bound file, and classifies fresh | stale | drifted-undescribed — so drift runs on a LIVE unit's stored binding instead of requiring explicit --bound/--change args."
status: proposed
proof_mode: integration-test
depends_on: [change-event-store]
decisions: [16]
# Node-borne proof config (ADR-0057 keystone A): authoring THIS block is what makes the node
# inner-loop buildable. EDIT-EXISTING (ADR-0057 §3 expansion C): the leaf adds a regression test that
# FAILS against current behaviour, then edits the EXISTING packages/cli/src/drift.ts. The red is
# genuine: at HEAD there is no store-reading path — the new test imports `runDriftFromStore` from
# `./drift.js`, which does not exist, so the call fails until IMPLEMENT adds it. `install: true` +
# typecheck because drift.ts imports @storytree/core across packages (fresh worktree needs the
# lockfile-only install; tsx strips types, ADR-0031 §2). Single source file → the default node:test
# proof on the one test file is legal; the change is purely additive (a new exported function), so the
# cli regression suite stays green at the backstop.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/cli", "test"]
  scope:
    testGlobs: ["packages/cli/src/**/*.test.ts"]
    sourceGlobs: ["packages/cli/src/**/*.ts"]
  real:
    testFile: "packages/cli/src/drift-from-store.test.ts"
    sourceFile: "packages/cli/src/drift.ts"
    scope:
      testGlobs: ["packages/cli/src/drift-from-store.test.ts"]
      sourceGlobs: ["packages/cli/src/drift.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/cli", "typecheck"]
    editsExisting: true
---

# storytree drift reads a unit's stored anchor + change log

**Outcome —** `storytree drift <unit>` reads the unit's stored `Anchor` + change log from the store,
re-fingerprints the bound file, and classifies **fresh | stale | drifted-undescribed** — so drift runs
on a LIVE unit's stored binding instead of requiring explicit `--bound`/`--change` args.

**Depends on —** [`change-event-store`](change-event-store.md) (the `ChangeStore.readChangeEvents`
contract this reads the unit's change log through).

> **The gap this closes (ADR-0016 — the headline of these slices).** Today `storytree drift`
> (`packages/cli/src/drift.ts`) works only on EXPLICIT args: you hand it `--bound <hash>` and
> `--change "<why>"`. That makes the engine demoable but not LIVE — no unit's drift is computed from its
> own stored binding. This unit adds the store-reading core: given a unit id and a store, read the unit's
> stored `Anchor` (its `boundHash` + the file it covers) and its change log, re-fingerprint the file with
> `hashSpan`, and classify via the existing `classifyDrift` + `driftEnvelope`. The CLI dispatch that lets
> an operator type `storytree drift <unit>` (no flags) is wired spine-side AFTER promotion — this unit is
> the pure-ish store core (offline-provable against `InMemoryStore`), mirroring how `runDrift` is the
> core behind the flag-driven surface.

## Guidance

ONE net-new exported function in `packages/cli/src/drift.ts` (do not change `runDrift`, `driftEnvelope`,
or `driftHelp` — they stay the explicit-args surface; this ADDS the store-reading sibling). Extend the
existing imports:

```ts
// from @storytree/core (extend the existing import): add the value `Anchor` and the types `Store`, `ChangeStore`
import { hashSpan, classifyDrift, Anchor, type ChangeEvent, type DriftFlag, type DriftState, type Store, type ChangeStore } from "@storytree/core";
```

Add the function (it REUSES `driftEnvelope` + `classifyDrift` — it must not re-render or re-classify):

```ts
/**
 * `storytree drift <unit>` (ADR-0016): the STORE-reading drift surface. Reads the unit's stored
 * {@link Anchor} (kind `"anchor"`, id = the unit id) and its change log, re-fingerprints the bound file
 * with {@link hashSpan}, and classifies via the same {@link classifyDrift} + {@link driftEnvelope} the
 * flag-driven {@link runDrift} uses — so drift runs on a LIVE unit's stored binding, not explicit args.
 * `readFile` is injectable for tests. The anchor is stored as a doc (a later "bind" surface writes it);
 * an absent anchor is a clean usage error, never a crash.
 */
export async function runDriftFromStore(
  unitId: string,
  store: Store & ChangeStore,
  readFile: (path: string) => string = (path) => readFileSync(path, "utf8"),
): Promise<Envelope> {
  const id = unitId.trim();
  if (id === "") return usage("missing <unit> (the unit id whose stored anchor to read)");

  const doc = await store.getDoc(id);
  if (doc === null) {
    return {
      ok: false,
      body: `drift: no stored anchor for "${id}" — bind it first (no Anchor doc in the store).`,
      next: ['storytree drift --file <path> --bound <hash>   (the explicit-args surface)'],
    };
  }
  let anchor: Anchor;
  try {
    anchor = Anchor.parse(doc.doc);
  } catch (err) {
    return { ok: false, body: `drift: the stored anchor for "${id}" is malformed — ${(err as Error).message}`, next: [] };
  }

  let content: string;
  try {
    content = readFile(anchor.file);
  } catch (err) {
    return { ok: false, body: `drift: cannot read ${anchor.file} — ${(err as Error).message}`, next: [] };
  }

  const currentHash = hashSpan(content);
  const changes: ChangeEvent[] = await store.readChangeEvents({ unitId: id });
  return driftEnvelope(id, classifyDrift(anchor.boundHash, currentHash, changes));
}
```

Notes for the leaf:

- `Anchor` is a zod schema VALUE (in `@storytree/core`) — import it as a value (not type-only) so you can
  call `Anchor.parse`. `Store` and `ChangeStore` are types (`type` import).
- REUSE `driftEnvelope(label, flag)` and `classifyDrift(boundHash, currentHash, changes)` already in this
  file — do NOT duplicate the rendering or the classification. The whole-file re-fingerprint (read the
  file, `hashSpan` it) mirrors `runDrift`'s "whole-file in this slice" simplification.
- `usage(...)` already exists in this file — reuse it for the empty-id case.

**The red the spine observes (before IMPLEMENT):** the test imports `runDriftFromStore` from `./drift.js`,
which does not exist at HEAD, so the call fails — a genuine red. After IMPLEMENT it classifies from
`InMemoryStore` data and every assertion passes.

### The test

`packages/cli/src/drift-from-store.test.ts`, offline, against `InMemoryStore` (which is both a `Store`
and — after [`change-event-store`](change-event-store.md) — a `ChangeStore`). Seed an anchor doc + change
events, inject `readFile`, assert the envelope. Skeleton:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryStore, hashSpan } from "@storytree/core";
import { runDriftFromStore } from "./drift.js";

const V1 = "export const x = 1;\n";
const V2 = "export const x = 2;\n";
const anchorDoc = (file: string, content: string) => ({ file, boundHash: hashSpan(content) });
```

Write the four cases in the Contract below (seed via `store.upsertDoc({ id, kind: "anchor", doc: anchorDoc(...) })`
and, for the stale case, `store.appendChangeEvent({ unitId: id, hashBefore: ..., hashAfter: ..., description: "...", author: "x", at: "2026-06-16T00:00:00.000Z" })`).

## Contract

1. **`drift-classifies-from-the-stored-binding`** — `runDriftFromStore` reads a unit's stored anchor +
   change log and classifies the three honest states, reusing the existing envelope.
   - **asserts —** (seed `store.upsertDoc({ id: "uat-1", kind: "anchor", doc: anchorDoc("src/x.ts", V1) })`)
     - **fresh** — `readFile` returns `V1` (its `hashSpan` equals the stored `boundHash`) and there are no
       change events → the envelope is `ok: true` and its `body` contains `"FRESH"`;
     - **drifted-undescribed** — `readFile` returns `V2` (a different hash) and there are no change events
       → `body` contains `"DRIFTED"` (and not `"FRESH"`/`"STALE"`);
     - **stale** — `readFile` returns `V2` AND a DESCRIBED change is appended for `"uat-1"`
       (`description: "renamed x → count"`) → `body` contains `"STALE"` and `"changed: renamed x → count"`;
     - **missing anchor** — for an id with no stored doc, the result is `ok: false` and its `body`
       mentions `"no stored anchor"` (a clean usage refusal, not a crash).
   - **proven by —** `packages/cli/src/drift-from-store.test.ts` (authored by the leaf inside the gate's
     AUTHOR_TEST phase; the spine observes the red — the missing `runDriftFromStore` export — before
     IMPLEMENT adds the store-reading core).
