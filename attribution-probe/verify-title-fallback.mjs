#!/usr/bin/env node
// Verify the patched runner's TEST-TITLE fallback in `resolveKilledBy` — the second of the two
// patches this repo carries against `@hughescr/stryker-bun-runner`'s kill attribution
// (patches/@hughescr__stryker-bun-runner@1.3.8.patch).
//
// WHY THIS EXISTS. The mutant run names a failed test `<file> > <title>`, with the file read off
// the LAST file header in bun's console output. In CI (PR #1802, 2026-09-02, both runs) bun
// printed a node:test failure from `src/banded-ground-material.test.ts` under the header of the
// file before it, so the name reached the resolver with the WRONG file and the RIGHT title, matched
// no dry-run id, and six mutants that every local run kills with a named killer were scored
// UNPROVEN. The fallback strips the file half and credits the ONE dry-run id carrying that title.
// It is fail-closed: two carriers resolve nothing, exactly as an ambiguous path-suffix match does.
//
// This cannot be reproduced through the probe fixture (the header lag is bun's, on Linux, under a
// timing we do not control), so the resolver is exercised DIRECTLY with hand-built registries.
// The expectations are derived from the resolver's contract, not from any run's output.
//
// Usage: node attribution-probe/verify-title-fallback.mjs [path-to-a-dist/index.js]
//   The optional path imports a different bundle in place of the installed package — point it at
//   an UNPATCHED copy and the CI-shape case must FAIL; that is how this verifier was red-green'd.

import { pathToFileURL } from "node:url";

const bundle = process.argv[2] === undefined ? "@hughescr/stryker-bun-runner" : pathToFileURL(process.argv[2]).href;
const { BunTestRunner } = await import(bundle);

const silent = { debug() {}, info() {}, warn() {}, error() {}, trace() {}, fatal() {} };
const runner = new BunTestRunner(silent, {});

const TITLE = "the three refusals say the WHOLE reason";
const RIGHT = `/abs/.stryker-tmp/sandbox-x/packages/p/src/right.test.ts > ${TITLE}`;
const WRONG_FILE_NAME = `packages/p/harness/previous.test.ts > ${TITLE}`;

/** Each case states the registries the resolver sees and the COMPLETE killedBy it must return. */
const CASES = [
  {
    why: "the CI shape: the right title reported under the previous file's header resolves to its only carrier",
    raw: [WRONG_FILE_NAME],
    local: [RIGHT],
    cached: [RIGHT],
    expect: [RIGHT],
  },
  {
    why: "fail-closed: the same title in two dry-run files resolves NOTHING rather than guessing",
    raw: [WRONG_FILE_NAME],
    local: [RIGHT, `/abs/.stryker-tmp/sandbox-x/packages/p/src/other.test.ts > ${TITLE}`],
    cached: [],
    expect: [],
  },
  {
    why: "fail-closed: a duplicate-suffixed carrier ( [0] ) is a different title, so the bare title matches nothing",
    raw: [WRONG_FILE_NAME],
    local: [`${RIGHT} [0]`, `${RIGHT} [1]`],
    cached: [],
    expect: [],
  },
  {
    why: "the covering filter is consulted first: its single carrier wins even when the whole registry holds two",
    raw: [WRONG_FILE_NAME],
    local: [RIGHT],
    cached: [RIGHT, `/abs/.stryker-tmp/sandbox-x/packages/p/src/other.test.ts > ${TITLE}`],
    expect: [RIGHT],
  },
  {
    why: "the whole registry is the second pool: a title absent from the covering filter still resolves through it",
    raw: [WRONG_FILE_NAME],
    local: [],
    cached: [RIGHT],
    expect: [RIGHT],
  },
  {
    why: "a nested title keeps its describe path: only the file half is stripped",
    raw: [`packages/p/harness/previous.test.ts > outer > inner title`],
    local: [`/abs/sandbox/packages/p/src/right.test.ts > outer > inner title`, `/abs/sandbox/packages/p/src/right.test.ts > inner title`],
    cached: [],
    expect: [`/abs/sandbox/packages/p/src/right.test.ts > outer > inner title`],
  },
  {
    why: "a name with no test-file prefix is not a mis-filed name and is left unresolved",
    raw: [TITLE],
    local: [RIGHT],
    cached: [RIGHT],
    expect: [],
  },
  {
    why: "the earlier rungs still win: an exact id resolves as itself, and a path-suffix match resolves before the title fallback",
    raw: [RIGHT, `packages/p/src/right.test.ts > another title`],
    local: [RIGHT, `/abs/.stryker-tmp/sandbox-x/packages/p/src/right.test.ts > another title`],
    cached: [],
    expect: [RIGHT, `/abs/.stryker-tmp/sandbox-x/packages/p/src/right.test.ts > another title`],
  },
];

let failures = 0;
for (const c of CASES) {
  runner.cachedTestNames = new Set(c.cached);
  runner.baseNameIndex = new Map();
  const { localRegistry, localBaseIndex } = runner.buildLocalTestFilterIndex(c.local);
  const got = runner.resolveKilledBy(c.raw, localRegistry, localBaseIndex, "probe");
  const ok = got.length === c.expect.length && c.expect.every((id) => got.includes(id));
  console.log(`${ok ? "ok  " : "FAIL"} ${c.why}`);
  if (!ok) {
    failures += 1;
    console.log(`     expected ${JSON.stringify(c.expect)}\n     got      ${JSON.stringify(got)}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} of ${CASES.length} title-fallback case(s) FAILED`);
  process.exit(1);
}
console.log(`\nall ${CASES.length} title-fallback cases hold`);
