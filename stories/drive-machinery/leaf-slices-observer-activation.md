---
id: "leaf-slices-observer-activation"
tier: capability
story: drive-machinery
arc: linked-session-context-arc
title: "A real build actually calls its leaf-slices observer with that node's own run accounting"
outcome: "An offline real chain invokes the leaf-slices observer once per node with that node's own run accounting, and a canned live author still cannot move a verdict."
status: proposed
proof_mode: integration-test
depends_on: [live-author-accounting-override, story-real-chain]
decisions: [243, 235, 20]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "test"]
  scope:
    testGlobs: ["packages/drive/src/leaf-slices-activation.test.ts"]
    sourceGlobs:
      - "packages/drive/src/story-build.ts"
      - "packages/drive/src/node-build.ts"
  real:
    testFile: "packages/drive/src/leaf-slices-activation.test.ts"
    sourceFile: "packages/drive/src/story-build.ts"
    scope:
      testGlobs: ["packages/drive/src/leaf-slices-activation.test.ts"]
      sourceGlobs:
        - "packages/drive/src/story-build.ts"
        - "packages/drive/src/node-build.ts"
    install: true
    editsExisting: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/drive", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/drive", "typecheck"]
---

# A real build actually calls its leaf-slices observer with that node's own run accounting

**Outcome —** An offline real chain invokes the leaf-slices observer once per node with that node's
own run accounting, and a canned live author still cannot move a verdict.

**Depends on —** [`live-author-accounting-override`](live-author-accounting-override.md) supplies the
resolver option this passthrough threads (the drive half cannot even typecheck until the resolver
accepts it); [`story-real-chain`](story-real-chain.md) owns the offline `--real` chain over one
worktree that this capability's proof drives.

ADR-0243 D1 + D3 + D4. The failure this exists to close is real and already happened: increment 1 of
`linked-session-context-arc` landed an observer seam that **nothing composed**, and no test noticed.
"Is the observer wired in — does anything call it?" has a compiler, and after
`live-author-accounting-override` it has a harness, so per ADR-0247 D1 this is a `machine`
proposition and no operator signature is spent on it (ADR-0243 D2).

## Proof walkthrough (written first)

Given a throwaway fixture git repo, a fixture stories directory, a scripted per-node `PhaseAuthor`,
and a canned `LiveAuthor` per node:

1. run an offline `storyBuild` over a ONE-node fixture story with `real: true`, `promote: false`,
   `verdictStore: "memory"` and a SPY observer, and read the spy's single call back — its `unitId`,
   `runId`, and `runs`;
2. run the identical chain with `liveAuthorOverride` omitted and read the spy's call count — zero;
3. run the same byte-identical rosy canned accounting twice, once behind a scripted author writing a
   PASSING impl and once a FAILING one, and read the two envelopes and the two verdict event sets
   out of the injected store;
4. read the injected in-memory store back for the usage rows, and re-run with an observer that
   THROWS, comparing envelope, exit status, and verdict against the non-throwing run; and
5. run a TWO-node fixture chain in dependency order and read the spy's two calls back.

The observable is the spy's recorded call list plus the injected in-memory store's event sequence —
never an in-process field on the drive's own objects.

## Guidance

**The source you author.** Two existing files, both in scope:

- `packages/drive/src/node-build.ts` — add `liveAuthorOverride?: LiveAuthor` to `RealBuildArgs`,
  beside `authorOverride` (`:707`), and spread it into the `resolveOptions` literal (`:750`) with the
  same `...(x !== undefined ? { x } : {})` idiom every sibling option uses (`exactOptionalPropertyTypes`
  is on — a bare `liveAuthorOverride: args.liveAuthorOverride` will not typecheck).
- `packages/drive/src/story-build.ts` — add
  `liveAuthorOverride?: (spec: NodeSpec, worktreeRoot: string) => LiveAuthor | undefined` to
  `StoryBuildOpts`, beside `authorOverride` (`:291`); **resolve it ONCE per node** next to `:678`
  (where `authorOverride` is already resolved once) and spread the result into the `buildNodeReal`
  call at `:679-698`. Resolve-once is not a style preference: the comment at `:677` already warns
  that a stateful factory must not be called twice, and contract 5 is its falsifier.

**The composition site the proof reaches** is `packages/drive/src/story-build.ts:701` —
`opts.onLeafSlices?.({ runId, unitId: spec.id, runs: built.liveAuthor.runs })`, inside the `--real`
arm of the chain's `buildNode`. Reaching it needs no new injectable beyond `liveAuthorOverride`:
`storyBuild` already exposes `storiesDir`, `repoRoot`, `authorOverride`, `promote`, `onLeafSlices`,
and the `verdictStore` seam, and `packages/cli/src/story-real-build.test.ts` already drives that
whole path offline against a fixture repo today.

**Never let an adapter emit from inside `drive`.** `packages/drive` must import NOTHING from any
`@storytree/context-traversal-*` package, and no such `dependencies` entry may appear in its
`package.json`. `drive → context-traversal-spawn → context-traversal-capture →
context-traversal-telemetry → drive` is a cycle `check:boundaries` refuses. The observer stays a seam
drive OWNS and the composition root (`packages/cli`) injects; **the proof uses a SPY observer the
test itself defines.**

**The canned live author is a genuine `ClaudeAgentAuthor` with a THROWING `queryFn`.** Same rule as
[`live-author-accounting-override`](live-author-accounting-override.md): reuse the existing exported
`LiveAuthor` union, widen nothing, inject the offline `queryFn` seam
(`packages/agent/src/sdk-author.ts:167`, which sets `#usesRealSdk` false so nothing spawns), and push
canned `SdkRunInfo` entries into the public `runs` array. The throwing `queryFn` is what makes
"the canned author never authors" falsifiable rather than decorative.

**The fixture builds its OWN tmpdir git repo.** Never assume the ambient checkout: this test runs
INSIDE a spine-cut build worktree and cuts a nested one. Increment 2 of this arc lost a cycle to an
environment assumption that inverted between the spine's temp build worktree and a real session
worktree. The glue commit at HEAD supplies `packages/drive/src/real-chain-fixture.ts`
(`fixtureRepo()`, `fixtureStories()`, `scriptedAuthors()`, `cannedLiveAuthor()`) — consume it; do not
re-author the git plumbing, and do not refactor `packages/cli/src/story-real-build.test.ts`, which is
another story's green proof.

**Contract ids — the test names must START with these strings, verbatim** (`spec.contracts` never
reaches the leaf; `assemblePrompts` builds the brief from id/tier/title/outcome/guidance only, and
`check:coverage` scans only `real.testFile` and matches test names by contract-id PREFIX, so a
paraphrased title reads 0/5):

- `the-leaf-slices-observer-fires-with-the-canned-run-accounting`
- `no-live-author-override-leaves-the-observer-silent`
- `a-canned-live-author-cannot-move-a-verdict`
- `the-canned-accounting-dies-in-the-injected-store`
- `each-chained-node-reports-its-own-slices`

Files: `packages/drive/src/story-build.ts` and `packages/drive/src/node-build.ts` (edits), plus
`packages/drive/src/leaf-slices-activation.test.ts` (new).

## Integration test

**Goal —** The real `storyBuild` `--real` chain, driven offline over a fixture repo, actually invokes
its leaf-slices observer with each node's own run accounting — and the canned accounting reaches
neither the verdict nor any store outside the injected one.

Every case runs offline against a throwaway tmpdir git repo and a fixture stories directory with
`promote: false` and `verdictStore: "memory"`: no DB, no network, no credential, no model, no push.
The observer is a spy the test owns.

## Contracts (5)

1. **`the-leaf-slices-observer-fires-with-the-canned-run-accounting`**
   - **asserts —** an offline `storyBuild` over a ONE-node fixture story, with a scripted
     `authorOverride` and a `liveAuthorOverride` returning a canned live author, calls the spy
     EXACTLY ONCE, with `unitId` equal to the fixture node's id, `runId` equal to the run id the
     envelope reports, and `runs` deep-equal to the canned `SdkRunInfo[]`.
   - **falsifiability —** goes RED against a passthrough that drops the option on the floor (the spy
     is never called); against one that hands the observer the SCRIPTED author's accounting (the
     scripted `PhaseAuthor` has no `runs`, so the payload is empty or absent); and against one that
     synthesises runs of its own — the canned entries carry distinctive phase/turn/cost/token values
     that no default and no derivation from the fixture would produce, so a fabricating
     implementation FAILS rather than coincides.

2. **`no-live-author-override-leaves-the-observer-silent`**
   - **asserts —** the identical chain with `liveAuthorOverride` OMITTED (the scripted
     `authorOverride` still present) never calls the spy — zero invocations — while the build still
     reaches its normal passing envelope.
   - **falsifiability —** this is the pre-ADR-0243 status quo, and the falsifier for a passthrough
     that FABRICATES a `LiveAuthor` whenever an `authorOverride` is present. That implementation
     would make every offline test in the repo start emitting usage accounting for authoring no model
     did. Asserted as a zero call count, never as an absent field on a payload.

3. **`a-canned-live-author-cannot-move-a-verdict`** *(ADR-0243 D3 — the refusal test)*
   - **asserts —** the SAME rosy canned accounting (a `success` subtype, non-zero turns and cost) is
     run twice over the same fixture: once behind a scripted author that writes a PASSING impl, once
     behind one that writes a FAILING impl. The first yields a passing envelope and a passing signed
     verdict for that node in the injected store; the second yields a HALT/FAIL envelope and no
     passing verdict for it. The two runs' canned `runs` payloads are asserted deep-equal to each
     other AND to the fixture, so the only thing that moved the verdict was the spine's own red/green
     observation.
   - **falsifiability —** goes RED against any implementation that lets the injected author's
     reported `subtype`, `costUsd`, or `turns` reach the verdict — for example one that reads a
     `success` subtype as evidence of green. **Both halves must live in one contract:** a single
     rosy-and-passing run proves nothing, because there the accounting and the verdict agree by
     coincidence; only the pair, with byte-identical accounting and opposite verdicts, is falsifiable.

4. **`the-canned-accounting-dies-in-the-injected-store`** *(ADR-0243 D4)*
   - **asserts —** after the passing run, the canned slice usage appears as usage events in the
     INJECTED in-memory store and NOWHERE else — no live/pg store is constructed and no
     `events.usage_event` / `events.verdict` write is attempted; the signed verdict for the node
     carries no accounting field; the node's verdict/signing event PRECEDES its usage events in the
     injected store's event sequence; and an observer that THROWS changes neither the envelope, the
     process exit status, nor the verdict, compared against the non-throwing run.
   - **falsifiability —** goes RED against an implementation that lets the observer's exception
     escape and fail the build (the advisory posture `appendSliceUsage` already holds would be lost),
     and against one that appends accounting BEFORE the verdict is decided — an ordering inversion is
     the only way accounting could ever influence a verdict, and it is invisible to any assertion
     made on final state alone, so the ordering must be read off the store's event sequence.

5. **`each-chained-node-reports-its-own-slices`**
   - **asserts —** a TWO-node fixture chain (node B `depends_on` node A) produces EXACTLY two
     observer calls, in dependency order, with distinct `unitId`s, each carrying that node's OWN
     canned runs — the `liveAuthorOverride` factory returns a differently-valued canned author per
     spec id, and a counter inside the factory asserts it was called exactly once per node id.
   - **falsifiability —** goes RED against a resolve-once bug that reuses node A's author for node B
     (both calls then carry A's distinctive values), and against one that calls the factory twice per
     node — which the comment at `story-build.ts:677` already warns about for the sibling
     `authorOverride`, and which a stateful factory would silently corrupt. The per-node distinctive
     values are what make the first half falsifiable: two identical canned authors would let the
     reuse bug pass.

## Named limitations (ADR-0243 D5 — name them, do not hide them)

- **A canned `LiveAuthor` is a FIXTURE, and fixtures drift.** This leg proves the CALL happens. It
  proves nothing about whether a real SDK run still produces the assumed `SdkRunInfo` shape — that
  stays covered by the compile-time `keyof ModelUsage` pin landed earlier in this arc, plus any real
  build the owner runs. ADR-0243 D5 chose naming this over a leg that silently assumed fidelity.
- **Two sibling composition sites stay UNPROVEN by this capability, for structural reasons:**
  - `packages/drive/src/node-build.ts:1204` — inside `runNodeBuild`. Offline-unreachable without
    adding `repoRoot`, `authorOverride`, `promote`, and the claim/identity seams to `NodeBuildOpts`,
    a materially larger change to the live CLI build path than this increment is scoped for.
  - `packages/drive/src/story-build.ts:737` — the live-smoke arm, reachable only with a real leaf.

  The residual is BOUNDED because both are fed by the SAME single object literal —
  `nodeStoryBuildOpts`, `packages/cli/src/commands.ts:1454` — which is also what feeds the proven
  site. Proving the drive side is composed therefore leaves one reviewed line, not a class of
  failure.
- **The end-to-end "wrote the expected bytes" assertion is DEFERRED, deliberately.**
  Bytes-from-run-accounting is already proven red→green on signed `--real` verdicts by
  `context-traversal-spawn`'s `build-spawn-capture`; re-asserting it here would re-prove another
  story's green capability. The only package that may legally compose drive with the spawn adapter is
  the composition root `packages/cli` (any closer coupling closes the `check:boundaries` cycle), and
  the composing code already exists there — a `cli` capability over it would need either a source
  file that does nothing new (the vacuous-capability trap) or a manufactured red.
- **Not covered by any reliability gate.** This capability is deliberately absent from every
  `(covers:)` list in the story's Reliability Gates. It earns its own signed `--real` verdict; a
  covers-entry would let an `adopt` pass green a capability that never went red (ADR-0085 /
  ADR-0097).
