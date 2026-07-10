---
id: "uat-bound-command-adoption"
tier: capability
story: drive-machinery
title: "Adopt consumes resolved UAT commands"
outcome: "runAdopt observes and signs each machine UAT leg only through the command supplied by that leg's resolved proof-gate binding."
status: proposed
proof_mode: integration-test
depends_on: [build-drive-cli, uat-machine-gate-resolution]
decisions: [106]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "test"]
  scope:
    testGlobs:
      - "packages/drive/src/adopt.test.ts"
    sourceGlobs:
      - "packages/drive/src/adopt.ts"
  real:
    testFile: "packages/drive/src/adopt.test.ts"
    sourceFile: "packages/drive/src/adopt.ts"
    scope:
      testGlobs:
        - "packages/drive/src/adopt.test.ts"
      sourceGlobs:
        - "packages/drive/src/adopt.ts"
    install: true
    editsExisting: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/drive", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/drive", "typecheck"]
---

# Adopt consumes resolved UAT commands

**Outcome —** `runAdopt` observes and signs each machine UAT leg only through the command supplied
by that leg's resolved proof-gate binding.

**Depends on —** [`build-drive-cli`](build-drive-cli.md) provides the existing `runAdopt`
observation/signing boundary; [`uat-machine-gate-resolution`](uat-machine-gate-resolution.md)
provides the exact fail-closed bound gate that boundary must consume.

> **Proof status (honest) — `proposed`.** Commit `7f19272` did not touch
> `adopt.{ts,test.ts}`, so verdict coverage for this behaviour remains zero. This literal
> edit-existing REAL pair must prove command routing, memoization, red refusal, and the no-partial-
> signing boundary before any machine-witness coverage claim changes.

## Proof walkthrough (written first)

Given a parsed story whose machine UAT legs resolve to two observe gates with distinguishable
commands:

1. run `runAdopt` and record the commands it observes;
2. observe each distinct resolved command once and append each UAT verdict only after its own
   command is green;
3. bind two legs to one gate and observe one memoized command execution serving those explicit
   bindings;
4. make one bound command red and observe that neither its gate nor its bound leg is signed; and
5. introduce any invalid or unbound machine leg and observe that resolution fails before any UAT
   leg verdict is appended.

The observable is the recording command seam plus the appended verdict unit ids.

## Guidance

`runAdopt` resolves all real machine UAT legs before signing any UAT leg. It consumes the command
from each successful resolution rather than looking up the first observe gate or independently
re-deriving a binding.

It observes/signs each machine UAT id against only that resolved gate command. Existing command
memoization remains: a gate and every leg explicitly bound to it share one observation at the same
clean commit. A red bound command signs neither its gate nor its leg.

Any invalid or unbound machine leg makes the adopt envelope fail before UAT signing, with no
fallback to another gate and no partial UAT verdict set. Existing reliability-gate signing and the
mapped→proposed adoption decision remain separate behaviours. This capability does not mutate UAT
witness labels.

## Integration test

**Goal —** The real `runAdopt` core consumes resolved bound commands at its recording observation
seam and appends only the matching UAT verdict ids to its recording verdict store.

Fixtures use differently bound legs, shared bindings, a red command, and an invalid binding. They
exercise the real drive core with injected recording seams; no DB, git subprocess, or network is
required.

## Contracts (1)

1. **`adopt-signs-leg-against-bound-command`** — `runAdopt` observes and signs each machine UAT id only through its resolved gate command.
   - **asserts —** differently bound legs invoke matching commands and earn their own verdicts;
     shared bindings are memoized; a red command signs neither its gate nor its leg; any
     invalid/unbound machine leg fails before UAT signing, with no fallback or partial UAT verdicts.
   - **covers —** `packages/drive/src/adopt.ts`.
   - **proven by —** `packages/drive/src/adopt.test.ts`, the literal REAL pair.

## Follow-up machine-witness authoring

Only after this capability and both upstream increments are built and proven may a separate
story-author edit add explicit bindings to existing machine legs or change a human witness to
machine. Each changed leg must name a suite that demonstrably proves its success condition; a leg
with no such suite remains human.
