---
id: "agent-ref-descent"
tier: capability
story: context-traversal-capture
arc: linked-session-context-arc
title: "An agent's essentials render descends its floor refs"
outcome: "Each floor ref the agents render resolves becomes a child visit naming the agent's visit as its parent, and no other CLI shape descends anything."
status: proposed
proof_mode: integration-test
depends_on: [traversal-trace-sink, terminal-boundary-observations]
decisions: [235, 241]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/context-traversal-capture", "test"]
  scope:
    testGlobs: ["packages/context-traversal-capture/src/descend-agent-refs.test.ts"]
    sourceGlobs: ["packages/context-traversal-capture/src/descend-agent-refs.ts"]
  real:
    testFile: "packages/context-traversal-capture/src/descend-agent-refs.test.ts"
    sourceFile: "packages/context-traversal-capture/src/descend-agent-refs.ts"
    scope:
      testGlobs: ["packages/context-traversal-capture/src/descend-agent-refs.test.ts"]
      sourceGlobs: ["packages/context-traversal-capture/src/descend-agent-refs.ts"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-capture", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-capture", "typecheck"]
---

# An agent's essentials render descends its floor refs

## Guidance

Author the seven contracts below under these ids, VERBATIM — the leaf's test titles must name them
(`spec.contracts` never reaches the leaf, so `check:coverage` reads 0/7 unless the ids appear here):
`descent-resolves-only-the-rendered-floor-refs-in-render-order`,
`only-the-bare-agents-name-shape-descends`,
`a-missing-or-non-agent-doc-descends-nothing-and-never-throws`,
`each-resolved-ref-becomes-a-front-matter-child-naming-the-agent-visit-as-parent`,
`descent-is-a-no-op-without-an-agent-visit-and-never-self-parents`,
`the-agent-visit-still-leads-its-children-in-a-replay-ordered-by-at`,
`composed-coverage-declares-parent-visit-links-and-stays-exhaustive`.

**Why this boundary.** `storytree agents <name>` runs `agentsCommand`
(`packages/cli/src/agents.ts:21`), which calls `renderAgentEssentials`
(`packages/library/src/store/render-agent.ts:199`). That renderer walks `FLOOR_SECTIONS`
(`render-agent.ts:168` — `rules` then `antiPatterns`), and for each id in those arrays calls
`store.getDoc(id)` and pushes that ref's ONE-LINE lead assertion into the prompt. The edges are
explicit ids authored on the parent node (`refIds`, `render-agent.ts:32`, which strips an `asset:`
prefix), it is one process and one call stack, and the children are honestly `front_matter_read`
because the essentials view renders the lead line and never the full ref bodies. So `parentVisitId`
here is a fact about the call, not a correlation — none of ADR-0235 clause 3's banned inputs
(ordering, adjacency, timestamps) is touched.

**`context` refs are NOT descended.** The essentials render resolves them only to populate
`missingRefs` and then prints `storytree library artifact <id>` pull-hints
(`render-agent.ts:250-266`). Those are OFFERS, not reads — `candidate_set` territory, which is
explicitly out of scope for this increment.

**Shape — three exports from `descend-agent-refs.ts`:**

```ts
export interface AgentDocStore {
  getDoc(id: string): Promise<{ readonly id: string; readonly kind: string; readonly doc: unknown } | null>;
}
export type AgentDescentDeps = Pick<ObserveCliDeps, "sessionId" | "nextVisitId" | "now">;
export function resolveAgentDescent(argv: readonly string[], store: AgentDocStore): Promise<readonly string[]>;
export function descendAgentRefs(
  observed: readonly ContextTraversalEvent[],
  refIds: readonly string[],
  deps: AgentDescentDeps,
): ContextTraversalEvent[];
export const AGENT_DESCENT_COVERAGE: ContextTraversalCoverage;
```

The store port is STRUCTURAL — `@storytree/storage-protocol`'s `Store` satisfies it as-is. Declare
the port locally; import no new package and add nothing to `package.json`. ADR-0235 clause 6 stays
intact: the port reads `id`, `kind`, and two ref-ID arrays off the doc — never a title, a body, or
any content.

**The descent rule mirrors the real dispatch, not a length check.** Per
`packages/cli/src/commands.ts:2259-2264`: `--help` short-circuits to `agentsHelp()`, a `--step` value
routes to `agentStepCommand` (which renders `next:` pull-hints, NOT ref assertions), and only the
bare form reaches `agentsCommand`. So descend when `argv[0] === "agents"` AND `argv[1]` is present
and does not start with `-` AND argv contains neither `--step` nor `--help`/`-h`.
`["agents","x","--pg"]` STILL descends.

**Never throws.** Any store rejection, absent doc, non-`agent` kind, or odd field shape resolves to
`[]`. Telemetry never breaks a command.

**Coverage composes, it never rewrites.** `AGENT_DESCENT_COVERAGE` is built FROM
`REVISIT_LINK_COVERAGE` (imported from `./revisit-links.js`) by moving `field:parent_visit_id` from
`omitted` to `supported` and changing nothing else — the same composition move
`revisit-links.ts:66-84` already makes over the base. `adapterId` STAYS `terminal-cli-dispatch`: the
activation UAT matches `/coverage: adapter=terminal-cli-dispatch supported=\[.*\] omitted=\[.*\]/`
(`terminal-capture.uat.test.ts:218`), which tolerates a widened set but not a rename. **Do NOT edit
`observe-cli.ts` or `observe-cli.test.ts`** — the base constant honestly describes the bare argv
observer, and its green test hard-asserts the base lists.

**`surface:agents` stays OMITTED.** It names the `agents` RUNTIME surface, not the CLI's `agents`
command; moving it would require editing `observe-cli.test.ts:186`, a green capability's test.

**Absent means absent.** `exactOptionalPropertyTypes` is on and the sink writes
`JSON.stringify(parsed.data)`. Build the child with a conditional spread, never
`parentVisitId: undefined`, and assert absence on the JSON round-trip.

**No `as` casts of any kind in the test file.** Narrow the `ContextTraversalEvent` union through the
exported `isContextVisitEvent` plus an explicit `assert.ok`, the way `terminal-capture.uat.test.ts`'s
`expectVisit` helper does. The proof run is tsx-driven so types are stripped: a cast makes the
assertion prove nothing while `check:coverage` still counts the test. `parentVisitId` is OPTIONAL, so
narrow presence before any comparison rather than comparing two possibly-`undefined` values — that
reds the package typecheck AFTER the verdict is signed.

**Fences.** No filesystem, no `@storytree/drive` import, no new package, no new dependency, no
retention/pruning/cap. No `followed_edge`, no `candidate_set`, no `candidateSetId` produced anywhere
— contract 7 asserts it.

**Files.** `packages/context-traversal-capture/src/descend-agent-refs.ts` and
`descend-agent-refs.test.ts`. The package scaffold already exists.

## Contracts

1. **`descent-resolves-only-the-rendered-floor-refs-in-render-order`**
   - **asserts —** over a stub store holding an `agent` doc with `rules: ["asset:a","asset:b"]`,
     `antiPatterns: ["asset:c"]` and `context: ["asset:d"]`, `resolveAgentDescent(["agents","x"],
     store)` returns exactly `["a","b","c"]` — the `asset:` prefix stripped, the `context` ref
     EXCLUDED, and `rules` ahead of `antiPatterns` as `FLOOR_SECTIONS` renders them.
     **Falsifiability —** a first run that comes back green is the diagnosis, not the result: this
     assertion must fail against an implementation that includes the `context` ref, against one that
     returns the raw `asset:`-prefixed strings, and against one that emits `antiPatterns` before
     `rules`.
2. **`only-the-bare-agents-name-shape-descends`**
   - **asserts —** `["agents","x"]` and `["agents","x","--pg"]` both resolve the agent's refs, while
     `["agents","x","--step","3"]`, `["agents","--help"]`, `["agents"]`, `["tree","x"]` and
     `["library","artifact","x"]` each resolve `[]` — mirroring the real dispatch at
     `commands.ts:2259-2264`. **Falsifiability —** a first run that comes back green is the
     diagnosis, not the result: this assertion must fail against an implementation keying on
     `argv[0] === "agents"` alone (the `--step` case would descend), and against one keying on
     `argv.length === 2` (the `--pg` case would not).
3. **`a-missing-or-non-agent-doc-descends-nothing-and-never-throws`**
   - **asserts —** an absent id, a doc whose `kind !== "agent"`, and a store whose `getDoc` REJECTS
     each yield `[]` from an awaited `resolveAgentDescent` call with no error thrown. **Falsifiability
     —** a first run that comes back green is the diagnosis, not the result: this assertion must fail
     against an implementation that lets the store's rejection propagate, and against one that
     descends a non-`agent` doc's `rules` array.
4. **`each-resolved-ref-becomes-a-front-matter-child-naming-the-agent-visit-as-parent`**
   - **asserts —** `descendAgentRefs([agentVisit], ["a","b"], deps)` returns three events: the agent
     visit FIRST and unchanged (still `full_payload_read`, and on
     `JSON.parse(JSON.stringify(returned))` carrying NO `parentVisitId` key at all), then two
     `front_matter_read` children with `nodeId` `a` and `b`, each with
     `parentVisitId === agentVisit.visitId`, mutually distinct `visitId`s, the agent visit's
     `surfaceId`, and every returned event parsing through `ContextTraversalEvent`. Read the returned
     events, never a value the test composed. **Falsifiability —** a first run that comes back green
     is the diagnosis, not the result: this assertion must fail against an implementation that stamps
     a `parentVisitId` onto the agent visit itself, against one that emits `full_payload_read`
     children, and against one that reuses the parent's `visitId` on a child.
5. **`descent-is-a-no-op-without-an-agent-visit-and-never-self-parents`**
   - **asserts —** with a non-empty `refIds` but an `observed` batch holding no visit event on the
     agents surface, nothing is appended; no returned event names its own `visitId` as its
     `parentVisitId`; and re-running `descendAgentRefs` over its own output appends nothing new. The
     non-self-reference claim is asserted DIRECTLY on the returned events, not through a parse —
     `packages/context-traversal-telemetry/src/traversal-events.ts` contains no `superRefine` for
     this field, so a self-parenting visit WOULD parse and a parse-only assertion would prove nothing.
     **Falsifiability —** a first run that comes back green is the diagnosis, not the result: this
     assertion must fail against an implementation that attaches children to whatever visit it finds
     first, and against one that re-descends already-descended output (duplicating the children).
6. **`the-agent-visit-still-leads-its-children-in-a-replay-ordered-by-at`**
   - **asserts —** feeding the returned batch through `createContextTraversalTrace()`'s `append` and
     then `replay(sessionId)`, with an injected `now` returning THE SAME instant for every event, the
     replayed `events` still begin with the agent visit followed by both children, and
     `replay.relationships` holds exactly two `parent_visit` edges whose `fromId` is the agent's
     `visitId`. `replay` sorts by `at` (`traversal-trace.ts:106`), so identical timestamps survive
     only on stable-sort insertion order — this contract makes that mechanical rather than lucky.
     **Falsifiability —** a first run that comes back green is the diagnosis, not the result: this
     assertion must fail against an implementation that returns the children before the parent, and
     against one that puts `parentVisitId` on the parent rather than on the children.
7. **`composed-coverage-declares-parent-visit-links-and-stays-exhaustive`**
   - **asserts —** `ContextTraversalCoverage.parse(AGENT_DESCENT_COVERAGE)` succeeds; `adapterId` is
     still `terminal-cli-dispatch`; `field:parent_visit_id` is in `supported` and NOT in `omitted`;
     every feature `REVISIT_LINK_COVERAGE` declared supported — INCLUDING `field:prior_visit_id` — is
     still supported; `event:followed_edge`, `field:candidate_follow_causality` and
     `event:candidate_set` are ALL still omitted; and
     `supported.length + omitted.length === CoverageFeature.options.length`. **Falsifiability —** a
     first run that comes back green is the diagnosis, not the result: this assertion must fail
     against a declaration that adds the feature to `supported` without removing it from `omitted`
     (the schema refuses both-ways), against one that drops `field:prior_visit_id`, and against one
     that also claims `event:followed_edge`.

## Integration evidence

`packages/context-traversal-capture/src/descend-agent-refs.test.ts` runs entirely in memory over
hand-built event fixtures and a stub store; no temporary directory, no real `HOME`, and no filesystem
is involved, because this unit touches none of them. Every assertion reads what
`resolveAgentDescent` and `descendAgentRefs` RETURNED — never a value the test composed — and parses
those events through increment 1's `ContextTraversalEvent` vocabulary; the absent-key claim is made
on the JSON round-trip so it describes the bytes the sink will write rather than an in-memory
`undefined`. The coverage contract asserts through `ContextTraversalCoverage.parse` so the
closed-enum exhaustiveness is enforced by the schema rather than by a hand-counted list.
