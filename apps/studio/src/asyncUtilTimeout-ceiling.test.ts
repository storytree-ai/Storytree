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
 * `src` with the CONTENT of every string, template and comment replaced by spaces, same length and
 * same newlines so offsets and line numbers still line up with the original.
 *
 * The scan runs over this rather than the raw text (the same masker discipline ADR-0276 increment 3
 * used for its own sweep): a `waitFor(…, { timeout: 500 })` quoted inside a string — as the fixtures
 * below do — or written out in a prose comment is DISCUSSING a call site, not being one, and a guard
 * that cannot tell those apart fires on the file documenting it. It also makes the paren walk
 * trivial, since no quoted `)` survives to close a span early.
 */
function maskLiterals(src: string): string {
  const out = src.split('');
  const blank = (from: number, to: number): void => {
    for (let i = from; i < to && i < out.length; i += 1) {
      if (out[i] !== '\n') out[i] = ' ';
    }
  };

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]!;
    const next = src[i + 1];

    if (ch === '/' && next === '/') {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      blank(i, stop);
      i = stop - 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      for (; j < src.length; j += 1) {
        if (src[j] === '\\') j += 1;
        else if (src[j] === ch) break;
      }
      blank(i + 1, j);
      i = j;
    }
  }
  return out.join('');
}

/** The `[start, end)` of the call whose `(` sits at `open`, paren-balanced over masked source. */
function callSpan(masked: string, open: number): [number, number] {
  let depth = 0;
  for (let i = open; i < masked.length; i += 1) {
    if (masked[i] === '(') depth += 1;
    else if (masked[i] === ')') {
      depth -= 1;
      if (depth === 0) return [open, i + 1];
    }
  }
  return [open, masked.length];
}

function lineOf(src: string, index: number): number {
  return src.slice(0, index).split('\n').length;
}

/** Every async-utility call site in `src` that sets its own budget without justifying it. */
function offendersIn(src: string): { util: string; line: number }[] {
  const masked = maskLiterals(src);
  const found: { util: string; line: number }[] = [];
  ASYNC_UTIL.lastIndex = 0;
  for (let m = ASYNC_UTIL.exec(masked); m !== null; m = ASYNC_UTIL.exec(masked)) {
    const [start, end] = callSpan(masked, m.index + m[0].length - 1);
    // The budget is read from the masked span; the justification from the ORIGINAL, since masking
    // is exactly what erases the comment carrying it.
    if (!/\btimeout\s*:/.test(masked.slice(start, end))) continue;
    if (src.slice(start, end).includes(JUSTIFICATION)) continue;
    found.push({ util: m[1]!, line: lineOf(src, m.index) });
  }
  return found;
}

test('no testing-library call site opts out of the configured asyncUtilTimeout ceiling', () => {
  const offenders: string[] = [];

  for (const file of testFilesUnder(join(studioRoot, 'src'))) {
    const src = readFileSync(file, 'utf8');
    const rel = relative(studioRoot, file).replace(/\\/g, '/');
    for (const { util, line } of offendersIn(src)) {
      offenders.push(`${rel}:${line} — ${util}(…, { timeout: … })`);
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

// The scanner's own deletion check. A guard that silently under-reports is worse than none — it is
// the same "believed a fence was watching" defect the ceiling itself hit — so the two ways this can
// rot are pinned here: missing a real opt-out (false green), and flagging a `timeout` that has
// nothing to do with testing-library (false red, which would get the guard deleted).
test('the scanner sees real opt-outs and only those', () => {
  const cases: [name: string, source: string, expected: string[]][] = [
    ['a clean site', 'await waitFor(() => { expect(x).toBe(1); });', []],
    ['a bare waitFor budget', 'await waitFor(() => {}, { timeout: 500 });', ['waitFor']],
    ['a findBy budget', "await screen.findByTestId('a', {}, { timeout: 5000 });", ['findByTestId']],
    ['a findAllBy budget', "await screen.findAllByRole('x', {}, { timeout: 10 });", ['findAllByRole']],
    [
      'a justified budget is allowed through',
      `await waitFor(() => {},\n  // ${JUSTIFICATION} the give-up point IS the contract here\n  { timeout: 300 });`,
      [],
    ],
    [
      // Without string-awareness the span ends at the quoted paren and the budget escapes.
      'a paren inside a string does not end the span early',
      'await waitFor(() => { expect(s).toBe(")"); }, { timeout: 9 });',
      ['waitFor'],
    ],
    [
      // The false-red that matters: `server/` tests pass exactly this shape to execFile.
      'an unrelated later call carrying a timeout is not attributed',
      'await waitFor(() => { a(); });\nexecFile(cmd, { timeout: 5000 });',
      [],
    ],
    [
      // vitest's own per-test option is not a testing-library budget and must not be flagged.
      "vitest's it(…, { timeout }) option is not an async-utility budget",
      "it('x', async () => { await waitFor(() => {}); }, { timeout: 30000 });",
      [],
    ],
  ];

  for (const [name, source, expected] of cases) {
    assert.deepEqual(
      offendersIn(source).map((o) => o.util),
      expected,
      `scanner misread "${name}"`,
    );
  }
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
