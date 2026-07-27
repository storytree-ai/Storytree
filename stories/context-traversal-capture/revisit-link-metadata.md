---
id: "revisit-link-metadata"
tier: capability
story: context-traversal-capture
arc: linked-session-context-arc
title: "A repeat read names the earlier visit it repeats"
outcome: "A visit to a node this session already read carries the earlier visit's id, and carries none when it does not."
status: proposed
proof_mode: integration-test
depends_on: [traversal-trace-sink, terminal-boundary-observations]
decisions: [235, 241]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/context-traversal-capture", "test"]
  scope:
    testGlobs: ["packages/context-traversal-capture/src/revisit-links.test.ts"]
    sourceGlobs: ["packages/context-traversal-capture/src/revisit-links.ts"]
  real:
    testFile: "packages/context-traversal-capture/src/revisit-links.test.ts"
    sourceFile: "packages/context-traversal-capture/src/revisit-links.ts"
    scope:
      testGlobs: ["packages/context-traversal-capture/src/revisit-links.test.ts"]
      sourceGlobs: ["packages/context-traversal-capture/src/revisit-links.ts"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-capture", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-capture", "typecheck"]
---

# A repeat read names the earlier visit it repeats

## Guidance

Author the five contracts below under these ids, VERBATIM — the leaf's test titles must name them:
`prior-visit-id-names-the-latest-earlier-visit-to-the-same-node`,
`a-first-visit-carries-no-prior-link`,
`links-never-cross-a-node-or-a-session`,
`linking-is-idempotent-and-never-self-referential`,
`composed-coverage-declares-prior-visit-links-and-stays-exhaustive`.

**Shape.** Export one pure function and one constant from `revisit-links.ts`:

```ts
linkRevisits(
  observed: readonly ContextTraversalEvent[],
  priorEvents: readonly ContextTraversalEvent[],
): ContextTraversalEvent[];
export const REVISIT_LINK_COVERAGE: ContextTraversalCoverage;
```

**`linkRevisits` is total and pure.** No clock, no filesystem, no id generation. It returns the
observed events with `priorVisitId` set on each VISIT event that has an earlier same-session,
same-`nodeId` visit — searching `priorEvents` first and then the earlier members of `observed` itself,
so a batch carrying two visits to one node links internally. Non-visit events pass through untouched.

**Order, never time.** "The earlier visit" is the LAST matching visit in the given order, which is the
append order `readTraversalSession` already returns. The implementation must not read the `at` field —
that is what keeps ADR-0235's no-timestamp-causality rule intact at the producer.

**Absent means absent.** When there is no earlier visit the KEY must not be present at all, not
present-and-`undefined`. `exactOptionalPropertyTypes` is on and the sink writes
`JSON.stringify(parsed.data)`, so assert on the JSON round-trip rather than on an in-memory
`undefined`.

**Coverage composes, it never rewrites.** `REVISIT_LINK_COVERAGE` is built FROM
`TERMINAL_CLI_DISPATCH_COVERAGE` (imported from `./observe-cli.js`) by moving `field:prior_visit_id`
from `omitted` to `supported`, keeping `adapterId: "terminal-cli-dispatch"` and every other feature
exactly where the base put it. **Do not edit `observe-cli.ts` or `observe-cli.test.ts`** — the base
constant honestly describes the bare argv observer, whose green test hard-asserts
`field:prior_visit_id` in `omitted` (`observe-cli.test.ts:173-200`); the composed constant describes
what the WIRED composition produces. Keeping the same `adapterId` is load-bearing: the activation UAT
matches `/coverage: adapter=terminal-cli-dispatch supported=\[.*\] omitted=\[.*\]/`
(`terminal-capture.uat.test.ts:218`), which tolerates widened sets but not a renamed adapter.

**Fences.** No filesystem, no `@storytree/drive` import (nothing in this arc may make `drive` reach a
traversal package), no new package, no retention/pruning/cap of any kind, and no `followed_edge` or
`field:candidate_follow_causality` production — this increment ships no causality claim and contract 5
asserts that.

**Files.** `packages/context-traversal-capture/src/revisit-links.ts` and `revisit-links.test.ts`. The
package scaffold already exists — add nothing to `package.json`.

## Contracts

1. **`prior-visit-id-names-the-latest-earlier-visit-to-the-same-node`**
   - **asserts —** given prior events holding two visits to node `X` (`v1` then `v2`) and one newly
     observed visit `v3` to `X`, the returned `v3` carries `priorVisitId === "v2"`, and the returned
     event still parses through `ContextTraversalEvent`. Read the returned events, never a value the
     test composed. **Falsifiability —** a first run that comes back green is the diagnosis, not the
     result: this assertion must fail against an implementation that returns `observed` unchanged, AND
     against one that picks the FIRST earlier visit.
2. **`a-first-visit-carries-no-prior-link`**
   - **asserts —** a visit to a node with no earlier occurrence comes back with no `priorVisitId` KEY
     at all, proven on `JSON.parse(JSON.stringify(returned))` so the claim is about the shape the sink
     will write. **Falsifiability —** a first run that comes back green is the diagnosis, not the
     result: this assertion must fail against an implementation that sets `priorVisitId: undefined`,
     and against one that falls back to the chronologically-previous visit regardless of node.
3. **`links-never-cross-a-node-or-a-session`**
   - **asserts —** an earlier visit to a DIFFERENT `nodeId` never becomes a prior link, and an earlier
     visit carrying a DIFFERENT `sessionId` never becomes one even when its `nodeId` matches — both
     read off the returned events. **Falsifiability —** a first run that comes back green is the
     diagnosis, not the result: this assertion must fail against an implementation that keys on
     `nodeId` alone, and against one that keys on position alone.
4. **`linking-is-idempotent-and-never-self-referential`**
   - **asserts —** running `linkRevisits` over an already-linked batch returns the same links, no
     returned event names its own `visitId` as `priorVisitId`, and every returned event PARSES.
     (Corrected 2026-07-27: this clause used to say the vocabulary's `superRefine` rejects
     self-reference, so that a parse WAS the assertion. It does not — `traversal-events.ts` has no
     `superRefine` at all, and its three `.refine()` calls guard spawn-edge validity and coverage
     exhaustiveness, never `priorVisitId`, so a self-referential visit parses fine. The test's own
     non-self-reference assertion is direct — `revisit-links.test.ts:124` and `:141` compare
     `priorVisitId` against the event's own `visitId` — and was always the real pin; only this
     rationale was wrong, so no assertion changed and the signed verdict is untouched.)
     **Falsifiability —** a first run that comes back green is the diagnosis, not the
     result: this assertion must fail against an implementation that appends the observed batch to its
     own prior list before searching, which would make a single visit link to itself.
5. **`composed-coverage-declares-prior-visit-links-and-stays-exhaustive`**
   - **asserts —** `ContextTraversalCoverage.parse(REVISIT_LINK_COVERAGE)` succeeds; `adapterId` is
     still `terminal-cli-dispatch`; `field:prior_visit_id` is in `supported` and NOT in `omitted`;
     every feature the base `TERMINAL_CLI_DISPATCH_COVERAGE` declared supported is still supported;
     `event:followed_edge` and `field:candidate_follow_causality` are still OMITTED; and
     `supported.length + omitted.length === CoverageFeature.options.length`. **Falsifiability —** a
     first run that comes back green is the diagnosis, not the result: this assertion must fail against
     a declaration that adds the feature to `supported` without removing it from `omitted` (the schema
     refuses both-ways), against one that drops a base feature, and against one that also claims
     `event:followed_edge`.

## Integration evidence

`packages/context-traversal-capture/src/revisit-links.test.ts` runs entirely in memory over hand-built
event fixtures; no temporary directory and no real `HOME` is involved, because this unit touches no
filesystem. Every assertion reads the events `linkRevisits` RETURNED and parses them through increment
1's `ContextTraversalEvent` vocabulary, and the absent-key claim is made on the JSON round-trip so it
describes the bytes the sink will write rather than an in-memory `undefined`. The coverage contract
asserts through `ContextTraversalCoverage.parse` so the closed-enum exhaustiveness is enforced by the
schema rather than by a hand-counted list.
