---
id: "dogfood-probe-mrfuze9m"
tier: contract
story: drive-machinery
title: "Title-case a string (fresh-agent dogfood probe)"
outcome: "A pure function converts an input string into Title Case — capitalizing the first letter of each whitespace-separated word and lowercasing the rest, with runs of whitespace collapsed — so a caller gets consistent human-readable casing without hand-rolling the transform."
status: proposed
proof_mode: contract-test
depends_on: []
# Node-borne proof config (ADR-0057): authoring THIS block is what makes the node buildable — no
# NODE_BUILD_REGISTRY edit. NET-NEW, dependency-free (no install): dogfood-probe-mrfuze9m.ts does not
# exist at HEAD and imports nothing beyond node builtins, so the red is genuine — the authored test's
# `import { toTitleCase } from "./dogfood-probe-mrfuze9m.js"` fails until IMPLEMENT writes it. Authored
# by a fresh onboarding session walking Story UAT leg 7 (the dogfood acceptance) for real, end to end.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "test"]
  scope:
    testGlobs: ["packages/drive/src/**/*.test.ts"]
    sourceGlobs: ["packages/drive/src/**/*.ts"]
  real:
    testFile: "packages/drive/src/dogfood-probe-mrfuze9m.test.ts"
    sourceFile: "packages/drive/src/dogfood-probe-mrfuze9m.ts"
    scope:
      testGlobs: ["packages/drive/src/dogfood-probe-mrfuze9m.test.ts"]
      sourceGlobs: ["packages/drive/src/dogfood-probe-mrfuze9m.ts"]
---

# Title-case a string (fresh-agent dogfood probe)

**Outcome —** A pure function converts an input string into Title Case — capitalizing the first
letter of each whitespace-separated word and lowercasing the rest, with runs of whitespace
collapsed — so a caller gets consistent human-readable casing without hand-rolling the transform.

> **A fresh-onboarding dogfood probe.** This node exists to walk `drive-machinery`'s own Story UAT
> leg 7 (the dogfood acceptance) for real: a brand-new session, onboarding from CLAUDE.md alone,
> discovers the inner loop, self-registers a genuinely net-new node, and drives it to a real signed
> `--real` verdict persisted in `events.verdict`. Net-new and dependency-free by design, matching the
> `witnessable-verdict` / `node-resolve-report` precedent, so the prove-it-gate's observed red is
> honest — the authored status stays `proposed` forever (`healthy` is only ever derived from signed
> verdicts, ADR-0020).

## Guidance

ONE dependency-free pure function in `packages/drive/src/dogfood-probe-mrfuze9m.ts`. Export it alone
(no cross-package import — a pure string transform over node builtins only):

```ts
export function toTitleCase(input: string): string;
```

Semantics:
- Trim the input, then split on runs of whitespace (`/\s+/`) into words.
- For each word, uppercase its first character and lowercase every remaining character.
- Join the transformed words with a single space.
- An empty string, or a string containing only whitespace, returns `""`.
- Never throw; total over any string input.

## Contract

1. **`dogfood-probe-title-cases-a-string`** — `toTitleCase` returns its input transformed into
   Title Case.
   - **asserts —**
     - `"hello world"` → `"Hello World"`;
     - `"HELLO wORLD"` → `"Hello World"` (each word's trailing characters are lowercased, not just
       left alone);
     - a single word `"storytree"` → `"Storytree"`;
     - `""` → `""`;
     - a whitespace-only input `"   "` → `""`;
     - extra/irregular internal whitespace `"  hello   world  "` → `"Hello World"` (collapsed and
       trimmed);
     - a word already correctly cased is unchanged: `"Hello World"` → `"Hello World"`.
   - **proven by —** `packages/drive/src/dogfood-probe-mrfuze9m.test.ts` (authored by the leaf inside
     the gate's AUTHOR_TEST phase; the red is observed by the spine before
     `dogfood-probe-mrfuze9m.ts` exists).
