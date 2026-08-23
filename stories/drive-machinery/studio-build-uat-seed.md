---
id: "studio-build-uat-seed"
tier: contract
story: drive-machinery
title: "Render a stable Studio build label"
outcome: "A pure function normalizes a unit label into one stable human-readable Studio build label."
status: proposed
proof_mode: contract-test
depends_on: []
# This contract is the repo's repeatable REAL-mode build target. Both paths are deliberately net-new
# on main and the function has no dependencies, so AUTHOR_TEST imports the missing implementation and
# produces an honest missing-module red. A successful node --real run parks its proven branch without
# landing these files, leaving the same red premise on fresh main.
#
# ITS ORIGINAL CONSUMER IS GONE; THIS CONTRACT IS NOT (corrected in place 2026-08-23, ADR-0429 D5).
# This comment used to say the contract existed "so studio-build UAT criterion 9 can click one known
# real-buildable node". ADR-0404 deleted the Build control that criterion clicks, and ADR-0429
# retired `stories/studio-build` with it, so that sentence named a consumer that no longer exists.
# What the contract IS did not change: a dependency-free, always-red-on-main target that any real
# build can be pointed at, now reached from the CLI as `storytree node build studio-build-uat-seed
# --real`. It keeps its id — renaming a contract re-points its `real:` proof arm and its proof
# bindings for no gain, and the id is a name, not a claim about a live studio journey.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "test"]
  scope:
    testGlobs: ["packages/drive/src/**/*.test.ts"]
    sourceGlobs: ["packages/drive/src/**/*.ts"]
  real:
    testFile: "packages/drive/src/studio-build-uat-seed.test.ts"
    sourceFile: "packages/drive/src/studio-build-uat-seed.ts"
    scope:
      testGlobs: ["packages/drive/src/studio-build-uat-seed.test.ts"]
      sourceGlobs: ["packages/drive/src/studio-build-uat-seed.ts"]
---

# Render a stable Studio build label

**Outcome —** A pure function normalizes a unit label into one stable human-readable Studio build
label.

> **Repeatable Studio real-build seed.** This node exists so `studio-build` UAT criterion 9 can
> click one known real-buildable node whose test and source are absent on `main`. The gated leaf
> authors the test first; its import of the absent implementation is the genuine AUTHOR_TEST red.
> IMPLEMENT then authors the function and the spine observes green. The node route persists the
> signed verdict and parks the proven commit on its build branch without opening a PR, so a later
> UAT run from fresh `main` begins from the same honest red premise.

## Guidance

Author exactly these two net-new files and nothing else:

- `packages/drive/src/studio-build-uat-seed.test.ts`
- `packages/drive/src/studio-build-uat-seed.ts`

The test imports the implementation through the ESM-relative path
`./studio-build-uat-seed.js`. The implementation exports one dependency-free pure function:

```ts
export function studioBuildLabel(unitLabel: string): string;
```

Normalize `unitLabel` by trimming leading and trailing whitespace and collapsing every internal
run of whitespace to one ASCII space. Return `"Studio build"` when the normalized label is empty;
otherwise return `"Studio build: <normalized label>"`. The function is total over every string,
performs no I/O, and imports nothing.

## Contract

1. **`studio-build-label-normalizes-a-unit-label`** — `studioBuildLabel` returns the stable Studio
   build label for any string.
   - **asserts —**
     - `"studio-build-uat-seed"` → `"Studio build: studio-build-uat-seed"`;
     - `"  studio-build   uat-seed  "` → `"Studio build: studio-build uat-seed"`;
     - `""` and a whitespace-only string both → `"Studio build"`;
     - the result has no leading or trailing whitespace and contains no newline.
   - **proven by —** `packages/drive/src/studio-build-uat-seed.test.ts`, authored in AUTHOR_TEST
     before `packages/drive/src/studio-build-uat-seed.ts` exists, so the observed red is the missing
     implementation import rather than a pre-existing green test.
