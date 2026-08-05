// The ceiling that stops load-starved `waitFor`s redding innocent gates must stay UN-OPTED-OUT.
//
// ADR-0276 increment 2 landed `configure({ asyncUtilTimeout: 15_000 })` in vitest.setup.ts to close a
// real class of flake: under `pnpm -r test` this suite shares the box with other packages' suites
// while vitest forks per core, and a CPU-starved fork holds a functionally-sound `waitFor` past
// testing-library's 1s default — green in isolation, red under load.
//
// That remedy has a hole, and this file is the thing that can see it. @testing-library/dom resolves
// the per-call budget as a DESTRUCTURED DEFAULT PARAMETER:
//
//   function waitFor(callback, { timeout = getConfig().asyncUtilTimeout, ... })   // dist/wait-for.js
//
// so a call-site passing `{ timeout: N }` never consults the configured ceiling — it REPLACES it.
// The trap is that this reads like tightening a bound when it is removing one, and the smaller the
// number the more it looks like diligence. On 2026-08-06 that cost two consecutive full local gate
// runs: App.docs-index-honesty.test.tsx opted four sites down to 5000ms against a render measured at
// 2017ms unloaded, and went red under load on diffs touching only packages/orchestrator, while
// passing 5/5 in isolation and green in CI both times.
//
// Nothing else observes this. ADR-0276 increment 3's `check:test-timing` apertures on
// `performance.now` / `process.hrtime` only, so a `waitFor` millisecond budget was outside it by
// construction — and ADR-0311 D1 retired that rung from the gate entirely on 2026-08-05. The global
// ceiling is the surviving containment for this class, so an unobserved per-call opt-out is the whole
// defect. This test runs inside the ordinary `pnpm -r test` leg and needs no new tooling.
//
// An opt-out is still available where the budget IS the contract under test — annotate it (see
// JUSTIFICATION below) so the number carries its reason instead of sitting bare.

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const studioRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The async utilities whose options object carries the ceiling-defeating `timeout` key. */
const ASYNC_UTIL = /\b(waitFor|waitForElementToBeRemoved|find(?:All)?By[A-Za-z]+)\(/g;

/** A call site may keep an explicit budget by saying WHY, inside the call, next to the number. */
const JUSTIFICATION = 'asyncUtilTimeout-opt-out:';

function testFilesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') found.push(...testFilesUnder(full));
    } else if (/\.test\.tsx?$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

/**
 * The source span of the call whose `(` sits at `open`, balanced — skipping parens that live inside
 * string/template/comment text so a `waitFor(() => expect(x).toBe(')'))` cannot end the span early.
 * Comment TEXT is kept in the returned span: that is where the justification is read from.
 */
function callSpan(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i]!;
    const next = src[i + 1];

    if (ch === '/' && next === '/') {
      i = src.indexOf('\n', i);
      if (i === -1) break;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end === -1) break;
      i = end + 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      for (i += 1; i < src.length; i += 1) {
        if (src[i] === '\\') i += 1;
        else if (src[i] === ch) break;
      }
      continue;
    }

    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return src.slice(open);
}

function lineOf(src: string, index: number): number {
  return src.slice(0, index).split('\n').length;
}

test('no testing-library call site opts out of the configured asyncUtilTimeout ceiling', () => {
  const offenders: string[] = [];

  for (const file of testFilesUnder(join(studioRoot, 'src'))) {
    const src = readFileSync(file, 'utf8');
    ASYNC_UTIL.lastIndex = 0;
    for (let m = ASYNC_UTIL.exec(src); m !== null; m = ASYNC_UTIL.exec(src)) {
      const span = callSpan(src, m.index + m[0].length - 1);
      if (!/\btimeout\s*:/.test(span)) continue;
      if (span.includes(JUSTIFICATION)) continue;
      offenders.push(
        `${relative(studioRoot, file).replace(/\\/g, '/')}:${lineOf(src, m.index)} — ${m[1]}(…, { timeout: … })`,
      );
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `These call sites pass an explicit \`timeout\`, which DISCARDS the asyncUtilTimeout ceiling ` +
      `configured in apps/studio/vitest.setup.ts rather than tightening it — ` +
      `@testing-library/dom reads \`timeout = getConfig().asyncUtilTimeout\` as a default parameter, so ` +
      `an explicit value never consults the config. Under a full \`pnpm -r test\` these go red on ` +
      `innocent diffs while staying green in isolation and in CI (ADR-0276).\n\n` +
      `${offenders.join('\n')}\n\n` +
      `Fix: delete the \`{ timeout: N }\` option and inherit the ceiling. If the budget is genuinely ` +
      `part of what the test asserts, keep it and say why in a comment inside the call containing ` +
      `\`${JUSTIFICATION}\`.`,
  );
});

test('the asyncUtilTimeout ceiling this file guards is actually configured', () => {
  // The guard above is worth nothing if the ceiling it defends is removed; assert both halves here so
  // deleting the remedy fails loudly rather than silently restoring testing-library's 1s default.
  const setup = readFileSync(join(studioRoot, 'vitest.setup.ts'), 'utf8');
  assert.match(
    setup,
    /configure\(\{\s*asyncUtilTimeout:/,
    'apps/studio/vitest.setup.ts no longer configures asyncUtilTimeout — without it every `waitFor` ' +
      'falls back to testing-library\'s 1s default and the ADR-0276 load flake returns.',
  );
});
