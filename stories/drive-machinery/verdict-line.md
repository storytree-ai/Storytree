---
id: "verdict-line"
tier: contract
story: drive-machinery
title: "Render a signed verdict as one human-readable line"
outcome: "A pure function renders a signed verdict as a single human-readable line naming outcome, unit, proof mode, signer, short commit, and timestamp."
status: proposed
proof_mode: contract-test
depends_on: []
# Node-borne proof config (ADR-0057): authoring this block is what makes the node buildable — no
# NODE_BUILD_REGISTRY edit. It mirrors the registry's NodeBuildConfig shape EXACTLY; a parity guard
# asserts spec == the old registry entry during the time-boxed transition. NET-NEW, dependency-free
# (no install): the impl imports only node: builtins + relative files, so the red is genuine.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/orchestrator", "test"]
  scope:
    testGlobs: ["packages/orchestrator/src/**/*.test.ts"]
    sourceGlobs: ["packages/orchestrator/src/**/*.ts"]
  real:
    testFile: "packages/orchestrator/src/proof/verdict-line.test.ts"
    sourceFile: "packages/orchestrator/src/proof/verdict-line.ts"
    scope:
      testGlobs: ["packages/orchestrator/src/proof/verdict-line.test.ts"]
      sourceGlobs: ["packages/orchestrator/src/proof/verdict-line.ts"]
---

# Render a signed verdict as one human-readable line

**Outcome —** A pure function renders a signed verdict as a single human-readable line naming
outcome, unit, proof mode, signer, short commit, and timestamp.

> **First REAL-mode target (drive-machinery Phase F) — since PROVEN and PROMOTED (ADR-0031).**
> Chosen as a NET-NEW, dependency-free behaviour so the prove-it-gate's red was GENUINE at build
> time. The live leaf authored both files in a fresh worktree, the spine observed the real
> red→green, signed a PASS (run `real-mq7ky4ck`, persisted to `events.verdict`), and the exact
> proven commit (`0e8f4ba`) was folded into the tree by promotion. ADR-0068 step 1 then MOVED the
> function from `@storytree/core` to `@storytree/orchestrator`'s `proof/` subdir (the farmer's render
> COMPUTE lives with the gate that signs the verdict it renders) — the CLI node-build envelope stays
> its live consumer. The authored status
> stays `proposed` forever: `healthy` is only ever derived from signed verdicts (ADR-0020).
>
> *Placement (resolved, ADR-0031 §3):* it lives here, under the `drive-machinery` story
> ([story.md](story.md)) — machinery is ordinary work in the ordinary tree. File-per-unit is the
> registered-buildable grain; the seed's contracts-inline convention still governs authored
> capability files. NOTE for re-builds: the net-new precondition is per-run — the files now exist
> at HEAD, so a fresh REAL build of this node would observe green at CONFIRM_RED and fail closed
> (correctly: there is nothing left to prove).

## Guidance

ONE dependency-free pure function in `packages/orchestrator/src/proof/verdict-line.ts`:

```ts
export function verdictLine(verdict: Verdict): string;
```

The input is the verdict contract's `Verdict` shape (see
`packages/verdict-contract/src/proof.ts`): `unitId`, `proofMode`, `outcome` (`"pass" | "fail"`),
`commitSha`, `signer`, `runId`, `evidence[]`, `at`. Use
`import type { Verdict } from "@storytree/verdict-contract"` — type-only, so the function stays
dependency-free at runtime (no zod, no I/O).

Render EXACTLY one line (no trailing newline), in this format:

```
<OUTCOME upper-cased> <unitId> (<proofMode>) — signed by <signer> @ <first 7 chars of commitSha>, <at>
```

e.g. `PASS verdict-line (contract) — signed by hua.mick@gmail.com @ abc1234, 2026-06-10T00:00:00.000Z`.

Total over well-formed verdicts: both outcomes render; a commitSha shorter than 7 characters is
used as-is (never padded, never throws). The motivating consumer is the CLI's node-build report,
which today formats its verdict line inline.

## Contract

1. **`verdict-line-renders-one-line`** — `verdictLine` renders a signed verdict as the single
   specified line
   - **asserts —** a pass verdict renders the exact format above (upper-cased outcome, 7-char short
     sha); a fail verdict renders `FAIL …`; the result contains no newline; a short commitSha is
     used as-is.
   - **proven by —** `packages/orchestrator/src/proof/verdict-line.test.ts` (authored by the leaf
     inside the gate's AUTHOR_TEST phase; red observed by the spine before any implementation exists).
