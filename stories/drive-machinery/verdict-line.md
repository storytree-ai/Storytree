---
id: "verdict-line"
tier: contract
story: drive-machinery
title: "Render a signed verdict as one human-readable line"
outcome: "A pure function renders a signed verdict as a single human-readable line naming outcome, unit, proof mode, signer, short commit, and timestamp."
status: proposed
proof_mode: contract-test
depends_on: []
---

# Render a signed verdict as one human-readable line

**Outcome —** A pure function renders a signed verdict as a single human-readable line naming
outcome, unit, proof mode, signer, short commit, and timestamp.

> **First REAL-mode target (drive-machinery Phase F).** This is a NET-NEW, dependency-free
> behaviour, chosen so the prove-it-gate's red is GENUINE: at HEAD neither the test nor the
> implementation exists, the live leaf authors both in a fresh worktree, and the spine observes the
> real red→green itself. The authored status stays `proposed` — `healthy` is only ever derived from
> the gate's signed verdict (ADR-0020), and landing the authored code is later (promotion) work.
>
> *Placement note (parked owner call):* the stories/ seed keeps contracts inline in capability
> files; this one gets its own file because the drive machinery loads file-per-unit specs, and the
> README calls that promotion mechanical. Where `verdict-line` finally sits (a drive-machinery
> story? the CLI story?) is an owner modeling call.

## Guidance

ONE dependency-free pure function in `packages/core/src/verdict-line.ts`:

```ts
export function verdictLine(verdict: Verdict): string;
```

The input is core's `Verdict` shape (see `packages/core/src/proof.ts`): `unitId`, `proofMode`,
`outcome` (`"pass" | "fail"`), `commitSha`, `signer`, `runId`, `evidence[]`, `at`. Use
`import type { Verdict } from "./proof.js"` — type-only, so the function stays dependency-free at
runtime (no zod, no I/O).

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
   - **proven by —** `packages/core/src/verdict-line.test.ts` (authored by the leaf inside the
     gate's AUTHOR_TEST phase; red observed by the spine before any implementation exists).
