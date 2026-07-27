---
id: "live-author-accounting-override"
tier: capability
story: drive-machinery
arc: linked-session-context-arc
title: "The resolver accepts a canned live author on the accounting side only"
outcome: "An offline caller can supply the resolved live author for accounting, and supplying it without an author override is refused fail-closed."
status: proposed
proof_mode: integration-test
depends_on: [prove-spec-resolution]
decisions: [243, 30, 20]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/orchestrator", "test"]
  scope:
    testGlobs: ["packages/orchestrator/src/live-author-override.test.ts"]
    sourceGlobs: ["packages/orchestrator/src/resolve-prove-spec.ts"]
  real:
    testFile: "packages/orchestrator/src/live-author-override.test.ts"
    sourceFile: "packages/orchestrator/src/resolve-prove-spec.ts"
    scope:
      testGlobs: ["packages/orchestrator/src/live-author-override.test.ts"]
      sourceGlobs: ["packages/orchestrator/src/resolve-prove-spec.ts"]
    install: true
    editsExisting: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/orchestrator", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/orchestrator", "typecheck"]
---

# The resolver accepts a canned live author on the accounting side only

**Outcome —** An offline caller can supply the resolved live author for accounting, and supplying it
without an author override is refused fail-closed.

**Depends on —** [`prove-spec-resolution`](prove-spec-resolution.md) owns `resolveProveSpec` and the
`authorOverride` seam this capability widens; this is an extension of that resolution layer, not a
new one (the same shape as `spec-borne-proof-config` → `prove-spec-resolution`).

ADR-0243 D1 + D3 (resolver half) + D6. Before this capability, `resolveProveSpec`'s
`opts.authorOverride !== undefined` branch set `author` and left `liveAuthor` unset by construction —
the `else` branch is the only code that ever constructs a `LiveAuthor`. That single fact made the
drive-side accounting composition site unreachable from any offline test, which is the whole reason
ADR-0243's activation leg looked like it needed a real, credentialed leaf. It does not. This
capability widens the seam on the ACCOUNTING side only.

## Proof walkthrough (written first)

Given a real-buildable node spec and a scripted `PhaseAuthor`:

1. resolve in REAL mode with BOTH `authorOverride` and a canned `liveAuthorOverride`, and read the
   returned `liveAuthor` back — it is the identical object, carrying the identical canned runs;
2. resolve with `authorOverride` alone and inspect the result object's KEYS — `liveAuthor` is absent,
   not present-and-undefined;
3. resolve with `liveAuthorOverride` alone and read the fail-closed refusal, checking that its reason
   names both option names;
4. in case 1, read `spec.author` back and confirm it is the scripted override and never the canned
   live author, with the canned author's `queryFn` never invoked; and
5. resolve with neither option and confirm the `else` branch still constructs its own live leaf.

The observable is the `ResolveResult` object itself — its `ok` flag, its key set, the identity of the
objects it carries, and the refusal reason's text.

## Guidance

**The type decision is load-bearing — do not deviate.** Declare `liveAuthorOverride?: LiveAuthor` on
`RealResolveOptions`, reusing the EXISTING exported union at `packages/orchestrator/src/resolve-prove-spec.ts:233`
(`export type LiveAuthor = ClaudeAgentAuthor | CodexPhaseAuthor`). **Widen nothing** — not
`LiveAuthor`, not `ResolveResult`, not any zod schema, and do not introduce a structural
`LiveAuthorLike`. `liveLeafLines` (`packages/drive/src/node-build.ts:589-631`) discriminates on
`runtime` and reads `totalCostUsd` / `violations` / `feedbackRuns` off the concrete classes, so a
structural widening breaks a real consumer. If you find yourself widening any shared type, STOP: that
is a different decision. **This arc has already paid for the alternative** — an optional field on a
shared type red-ed the leaf's TYPECHECK after a PASS had been signed (the tsx-driven proof passes,
`tsc` then fails).

**A canned live author is a genuine `ClaudeAgentAuthor`, not a stub.** Construct it with the existing
offline `queryFn` seam (`packages/agent/src/sdk-author.ts:167`) — injecting a `queryFn` sets
`#usesRealSdk` false, so nothing spawns and no credential is read — and push canned `SdkRunInfo`
entries directly into its public `runs` array. **Its `queryFn` must THROW**, so any path that
actually runs the canned author explodes loudly rather than passing quietly. A passing-but-unused
stub would let a mis-wiring go unnoticed; a throwing one cannot.

**Behaviour.** In the `opts.authorOverride !== undefined` branch (currently
`resolve-prove-spec.ts:489-490`), set `liveAuthor = opts.liveAuthorOverride` when it is supplied.
`liveAuthorOverride` supplied WITHOUT `authorOverride` is REFUSED fail-closed —
`{ ok: false, reason, registered: realBuildableNodeIds() }` — because it is meaningless there and
would silently claim a live leaf ran; the reason must name BOTH option names literally. Nothing about
the `else` branch changes: with no override at all the resolver still constructs the real leaf.

**D6 — document the asymmetry AT THE SEAM, in the source.** The JSDoc on `authorOverride`
(`resolve-prove-spec.ts:210-214`) and on the new `liveAuthorOverride` must state that `authorOverride`
deliberately leaves `liveAuthor` unset (an override is not a live leaf, so no cost/violation reporting
and no usage accounting is claimed for it), that `liveAuthorOverride` is the accounting-only widening
ADR-0243 D1 decided, and that it is a **TEST-INJECTION seam with NO argv surface** — which, together
with the in-memory store every offline caller uses, is where ADR-0243 D4's fence lives on the real
path. Reviewed in the diff, not asserted.

**No argv, no CLI flag, no env var.** Nothing in `packages/cli` or `packages/drive` may expose this
option to an operator. It is reachable only from a test that constructs the options object itself.

**Never invoke the canned author.** The test asserts identity and key presence on the resolved
result; it must not call `author()` on anything, and must not run the gate. That is unit 3's job.

**Contract ids — the test names must START with these strings, verbatim** (`spec.contracts` never
reaches the leaf; `assemblePrompts` builds the brief from id/tier/title/outcome/guidance only, and
`check:coverage` scans only `real.testFile` and matches test names by contract-id PREFIX, so a
paraphrased title reads 0/5):

- `live-author-override-is-returned-as-the-resolved-live-author`
- `an-author-override-alone-leaves-the-live-author-absent`
- `live-author-override-without-an-author-override-is-refused`
- `the-canned-live-author-is-never-the-authoring-leaf`
- `the-else-branch-still-constructs-its-own-live-leaf`

Files: `packages/orchestrator/src/resolve-prove-spec.ts` (edit) and
`packages/orchestrator/src/live-author-override.test.ts` (new).

## Integration test

**Goal —** The real `resolveProveSpec` returns the caller's canned live author for accounting, keeps
it out of the authoring seat, refuses the lone option fail-closed, and still constructs its own live
leaf when no override is supplied.

Fixtures are a real-buildable `NodeSpec`, a scripted `PhaseAuthor`, and a `ClaudeAgentAuthor` built
with a throwing `queryFn` and hand-populated `runs`. Everything runs in-process: no DB, no git
subprocess, no network, no credential, no model.

## Contracts (5)

1. **`live-author-override-is-returned-as-the-resolved-live-author`**
   - **asserts —** a REAL resolve with BOTH `authorOverride` and `liveAuthorOverride` returns
     `ok: true` with `result.liveAuthor` REFERENCE-IDENTICAL (`assert.strictEqual`) to the object
     passed in, and that object's `runs` deep-equal to the canned `SdkRunInfo[]` pushed in before the
     call.
   - **falsifiability —** goes RED against an implementation that assigns the override to
     `spec.author` instead of `liveAuthor`; against one that constructs a FRESH `ClaudeAgentAuthor`
     from the override's fields (a deep-equal check would pass, `strictEqual` will not); and against
     one that copies `runs` into a new array. Identity, not shape, is the assertion — a contract
     satisfied by two objects merely agreeing on field values proves nothing here.

2. **`an-author-override-alone-leaves-the-live-author-absent`**
   - **asserts —** with `authorOverride` supplied and `liveAuthorOverride` omitted, the result is
     `ok: true` and the `liveAuthor` KEY IS ABSENT from the returned object — asserted with
     `"liveAuthor" in result === false` / `Object.hasOwn`, never with `=== undefined`.
   - **falsifiability —** goes RED against an implementation that writes `liveAuthor: undefined` onto
     the result. That implementation passes every falsy check while being observably different: this
     is the contract that preserves ADR-0243 correction 2's fact, and losing it would make the
     drive-side accounting branch (`node-build.ts:570`, `story-build.ts:701`) fire for every dry-run
     and every scripted offline test, writing usage rows for authoring that never happened.

3. **`live-author-override-without-an-author-override-is-refused`**
   - **asserts —** `liveAuthorOverride` supplied with NO `authorOverride` returns the fail-closed
     shape — `ok: false`, a `reason` containing BOTH the literal strings `liveAuthorOverride` and
     `authorOverride`, and `registered` deep-equal to `realBuildableNodeIds()`.
   - **falsifiability —** goes RED against an implementation that ignores the lone option and
     proceeds to build a real leaf (`ok: true`); against one that returns `ok: true` with
     `liveAuthor` set from it (which would let a canned author claim a live run nobody made); against
     one that THROWS instead of returning the fail-closed shape; and against one whose reason names
     only one of the two options — assert both substrings separately, so a message that says
     "liveAuthorOverride is not allowed here" without naming what it needs still goes red.

4. **`the-canned-live-author-is-never-the-authoring-leaf`**
   - **asserts —** in the both-options case, `spec.author` is reference-identical to the scripted
     `authorOverride` and is NOT the canned live author; and the canned author is never run — proven
     by constructing it with a `queryFn` that THROWS, plus a call counter asserted to be zero.
   - **falsifiability —** goes RED against an implementation that lets `liveAuthorOverride` also
     become `author` (the identity check fails, and any path that actually runs it explodes on the
     throwing `queryFn` rather than passing quietly). The throwing `queryFn` is what makes this
     contract falsifiable rather than decorative: a benign stub would let the mis-wiring pass.

5. **`the-else-branch-still-constructs-its-own-live-leaf`**
   - **asserts —** with NEITHER option supplied, a REAL resolve still returns `ok: true` with a
     constructed `liveAuthor` that is an instance of the default runtime's concrete class
     (`ClaudeAgentAuthor`), and `spec.author` is that same constructed leaf. Construction alone must
     issue no query and read no credential; the test never calls `author()`.
   - **falsifiability —** goes RED against an implementation that made `liveAuthorOverride` the ONLY
     producer of `liveAuthor` — i.e. one that deleted or short-circuited the `else` branch's
     construction. That regression silently stops every real build's usage accounting AND its
     cost/violation reporting while every offline test in the repo stays green, which is precisely
     the class of failure this contract exists to catch.

## Named limitations (ADR-0243 D5 — name it, do not hide it)

- **A canned `LiveAuthor` is a FIXTURE, and fixtures drift.** This capability proves the seam accepts
  and returns one; it proves nothing about whether a real SDK run still produces the assumed
  `SdkRunInfo` shape. That stays covered by the compile-time `keyof ModelUsage` pin landed earlier in
  this arc, plus any real build the owner runs. Naming the gap is the posture ADR-0243 D5 chose over
  a leg that silently assumed fidelity.
- **The in-memory-store fence is documented, not asserted, here** (ADR-0243 D4). This capability's
  contribution to it is the JSDoc's "test-injection seam, no argv surface" statement, reviewed in the
  diff. The behavioural half — synthetic accounting dying in an injected in-memory store rather than
  reaching `events.usage_event` / `events.verdict` — is asserted by
  [`leaf-slices-observer-activation`](leaf-slices-observer-activation.md) contract 4.
- **Not covered by any reliability gate.** This capability is deliberately absent from every
  `(covers:)` list in the story's Reliability Gates. It earns its own signed `--real` verdict; a
  covers-entry would let an `adopt` pass green a capability that never went red (ADR-0085 /
  ADR-0097).
