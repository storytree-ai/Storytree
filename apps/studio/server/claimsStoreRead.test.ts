// THE GUARD FOR THE DEFECT NOTHING ELSE COULD SEE (ADR-0535 D1).
//
// `GET /api/claims` is served by two surfaces — the studio (`libraryBackend.ts`) and the desktop
// (`apps/desktop/electron/backend-entry.ts`) — and both are supposed to be asking the claim ledger
// ONE question. For months they were not: the studio took `listLiveClaims()`, which drops stale rows
// IN SQL, while the CLI board took `listAllClaims()` and printed the same rows marked STALE. An
// owner was shown an arc with nobody on it while the session holding it was 432 tool calls in.
//
// ⚠ EVERY EXISTING HARNESS WAS GREEN THROUGHOUT, and not by oversight — by construction. The
// `/api/claims` mirror-conformance row injects a FIXTURE at the `sessionClaims` seam (see
// `packages/cli/src/mirror-conformance.ts`), which is downstream of the store read, so it compares
// two surfaces that were handed identical rows and can never observe which read produced them.
// `claimsApi.integration.test.ts` stubs the same seam. The divergence lived in the one line neither
// could reach.
//
// So this asserts the line itself, from the source text. That is a blunt instrument and it is used
// deliberately: the alternative is a live-DB test of a private lazily-built pool, and the thing
// actually worth pinning is not behaviour but AGREEMENT between two hand-copied compositions.
//
// ⚠ IT IS WRITTEN NOT TO GO VACUOUSLY GREEN. A source-text check whose pattern stops matching
// reports success while measuring nothing, which would be a worse version of the very fault it
// guards. So each file is first asserted to contain the anchor (`sessionClaims`) at all, and the
// forbidden call is asserted ABSENT rather than the wanted one merely PRESENT — a file that was
// renamed, moved or emptied fails the anchor before it can pass the rule.
//
// This is NOT a merge gate on claim liveness (ADR-0535 D5 forbids that, and nothing here reads the
// ledger): it is an ordinary unit test over two files in this repo.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');

/** The two hand-copied compositions that serve `GET /api/claims`, by repo-relative path. */
const SURFACES = [
  { name: 'studio', file: 'apps/studio/server/libraryBackend.ts' },
  { name: 'desktop', file: 'apps/desktop/electron/backend-entry.ts' },
] as const;

/** A `//`-comment-stripped view of the file: the rule is about CODE, and both files discuss the
 *  history of this exact bug in their comments (naming the old call on purpose). */
function codeOf(relPath: string): string {
  const source = readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
  return source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
}

describe('GET /api/claims — both surfaces take the SAME, UNFILTERED ledger read (ADR-0535 D1)', () => {
  for (const surface of SURFACES) {
    it(`${surface.name} calls listAllClaims and never listLiveClaims for sessionClaims`, () => {
      const code = codeOf(surface.file);
      // The anchor FIRST: if this file no longer composes `sessionClaims`, the rules below are
      // measuring nothing and must not report a pass.
      expect(code, `${surface.file} no longer composes sessionClaims — this guard has come adrift`)
        .toContain('sessionClaims');
      expect(code).toContain('listAllClaims()');
      // The REFUSAL is what carries the test. `listLiveClaims` is a legitimate read elsewhere in the
      // repo (the ambient glance, worktree prune's live-session set — logic that genuinely wants the
      // live subset); what it must never again be is a DISPLAY surface's read, because a view cannot
      // mark what it was never handed.
      expect(
        code,
        `${surface.file} filters staleness in SQL again — the studio/CLI divergence ADR-0535 D1 repaired`,
      ).not.toContain('listLiveClaims');
    });
  }

  it('holds both surfaces to it — a one-sided swap is exactly how they diverged before', () => {
    // Belt and braces on the loop above: if SURFACES were ever trimmed to one entry the per-file
    // assertions would all still pass while covering half the pair.
    expect(SURFACES.map((s) => s.name)).toEqual(['studio', 'desktop']);
  });
});
