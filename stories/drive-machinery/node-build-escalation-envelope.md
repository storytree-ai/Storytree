---
id: "node-build-escalation-envelope"
tier: contract
story: drive-machinery
capability: build-drive-cli
arc: inner-loop-exit-arc
title: "Render an authoring escalation in the node-build envelope"
outcome: "The node-build envelope renders a returned escalation with its unit, run and test id, and names an overruled one, without executing a command."
status: proposed
proof_mode: contract-test
depends_on: [gate-routes-authoring-escalation, node-build-refusal-observation-envelope]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "test"]
  scope:
    testGlobs: ["packages/drive/src/node-build-escalation-envelope.test.ts"]
    sourceGlobs: ["packages/drive/src/node-build.ts"]
  real:
    testFile: "packages/drive/src/node-build-escalation-envelope.test.ts"
    sourceFile: "packages/drive/src/node-build.ts"
    scope:
      testGlobs: ["packages/drive/src/node-build-escalation-envelope.test.ts"]
      sourceGlobs: ["packages/drive/src/node-build.ts"]
    install: true
    editsExisting: true
    proofCommand:
      file: bun
      args:
        - "test"
        - "--preload"
        - "./scripts/tsx-cache-off.mjs"
        - "--timeout"
        - "300000"
        - "./packages/drive/src/node-build-escalation-envelope.test.ts"
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/drive", "typecheck"]
---

# Render an authoring escalation in the node-build envelope

**Outcome —** The node-build envelope renders a returned escalation with its unit, run and test id,
and names an overruled one, without executing a command.

## Proof walkthrough

Given production `ProveResult`s returned by `proveUnit` over a real `ShellTestExecutor` whose ordinary
child commands each append one marker to a temporary file, an inline scripted author, and the
same-file production renderer `renderEscalation(unitId, runId, result)`:

1. render an AUTHOR_TEST escalation failure and read a labelled header naming the phase, the claim
   that this contract cannot be tested as specified, and the unit id, run id and test id; the
   statement verbatim; the record's observation — exit code, stdout and stderr — labelled as the
   spine's single observation taken for the escalation, not a CONFIRM run; and one line naming the
   orchestrator's options: re-delegate a test revision, which consumes one ADR-0563 D4 attempt as a
   `revised-test` difference, or escalate to the owner;
2. render an IMPLEMENT escalation that stayed red and read the same header with the claim that this
   test cannot be satisfied as written, the statement and the assertion verbatim, no observation of
   the escalation's own, and the options line;
3. render an overruled escalation, once on a pass and once on the GATE refusal that follows an
   overrule, and read exactly one labelled line saying the implementer escalated, the spine observed
   green, and the escalation was overruled, with the statement;
4. render a pass and a failure that carry neither key and read nothing (`[]`); and
5. read the marker count after each walk — one for the AUTHOR_TEST escalation, two for each walk that
   reached CONFIRM_GREEN — and read it again after rendering every result: unchanged.

The observable is the renderer's returned lines and the child-written marker count. The test file is
NEW: `packages/drive/src/node-build-escalation-envelope.test.ts`. The existing
`packages/drive/src/node-build-refusal-observation.test.ts` and `packages/cli/src/node-build.test.ts`
are not in this contract's write scope.

## Guidance

**Leaf test acceptance (prompt-exposed).** AUTHOR_TEST and IMPLEMENT both read this whole file —
`## Proof walkthrough` and the full assertion under `## Contracts (1)` — before writing. The
contract-id briefing in the phase prompt is an index, never a substitute for that reading.

The drive renders here and decides nothing.

- **The renderer (ADR-0569 D5).** `packages/drive/src/node-build.ts` exports
  `renderEscalation(unitId: string, runId: string, result: ProveResult): string[]`. It reads the
  result's `escalation` and `overruledEscalation` records, which contract
  `gate-routes-authoring-escalation` defines, takes the test id from the record's `testId` (stamped by
  the spine), and returns `[]` when neither key is present, so every existing envelope stays
  byte-identical.
- **The call sites.** `nodeBuild` calls it on the failure envelope directly under the `verdict:` line
  and before `renderFailedConfirmObservation`'s section, and on the pass envelope directly under the
  `verdict:` line.
- **The escalation block.** Its header names the raising phase and what that phase claims —
  AUTHOR_TEST: this contract cannot be tested as specified; IMPLEMENT: this test cannot be satisfied
  as written — with the unit, run and test id. The statement follows verbatim, and IMPLEMENT's
  assertion too. An AUTHOR_TEST record's observation follows, labelled as the spine's single
  observation for the escalation and not a CONFIRM run (ADR-0569 D4). The block closes with one line
  naming the orchestrator's two options under ADR-0563: re-delegate a test revision, consuming one D4
  attempt as a `revised-test` difference, or escalate to the owner. An IMPLEMENT escalation's failure
  output is the `failedObservation` section that follows the block, which the block does not repeat.
- **An overruled escalation (ADR-0569 D3)** renders one labelled line, with its statement, on the
  envelope it rode through.
- **Rendering is inert.** It runs no command and changes nothing about the result, the evidence,
  signing, promotion, cleanup, leaf feedback or stored work history.

The test obtains its results from `proveUnit` plus `ShellTestExecutor` ordinary child commands with
only a scripted inline author fixture, then passes them to the production renderer. It does not call
`nodeBuild`'s dry-run synthetic pair, inject an author, result or executor into `NodeBuildOpts`, make a
paid call, or add a production test-only override. Only `node build` renders the block: `story
build`'s chain summary and the gate build driver still print the refusal reason alone.

## Contracts (1)

1. **`node-build-renders-the-returned-escalation-with-its-test-id`** — node build renders the escalation the gate returned, with its unit, run and test id, and names an overruled one, without executing a command.
   - **asserts —** the same-file production renderer `renderEscalation`, called by `nodeBuild` directly under the `verdict:` line (and before the observation section on a failure), renders for an AUTHOR_TEST escalation a labelled header with the phase, its claim, and the unit, run and test id, the statement verbatim, the record's exit code/stdout/stderr labelled as the spine's single observation for the escalation and not a CONFIRM run, and one options line (re-delegate a test revision, consuming one ADR-0563 D4 attempt as a `revised-test` difference, or escalate to the owner); for an IMPLEMENT escalation the same header with its claim, the statement and assertion verbatim, and the options line; for `overruledEscalation`, on a pass or on a GATE refusal after the overrule, exactly one labelled line saying the implementer escalated, the spine observed green and the escalation was overruled, with the statement; for a result with neither key, nothing. The child-written spawn count stays one for the AUTHOR_TEST walk and two for each walk that reached CONFIRM_GREEN, and rendering adds no spawn.
   - **covers —** `renderEscalation` and its failure- and pass-envelope call sites in `nodeBuild` (`packages/drive/src/node-build.ts`).
   - **proven by —** a new `packages/drive/src/node-build-escalation-envelope.test.ts` through the declared focused bun REAL proof; the `@storytree/drive` typecheck and package suite remain pre-signature backstops.
