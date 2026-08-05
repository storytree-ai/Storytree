// ADR-0246 / `foreign-project-forest-arc` inc 2 — the studio's repo root is DRIVABLE.
//
// Increment 1 gave `resolveStudioPaths` a `repoRootOverride` parameter, but NEITHER caller passed
// one (`serve.ts`'s entrypoint and `devApi.ts`'s `configResolved`), so the override was dead: the
// only thing that could repoint the studio was the process-global `STORYTREE_REPO_ROOT`. These pin
// that the override now has real sources and that it actually decides whose tree is served.
//
// `/api/tree` reads `ctx.paths.storiesDir`, which is `path.join(repoRoot, 'stories')` — so
// "which repo root" IS "whose tree comes back". That is the whole point of the parameter.

import { describe, expect, test } from 'vitest';
import path from 'node:path';

import { resolveStudioPaths } from './apiRouter';
import { parseRepoRootFlag } from './serve';

const STUDIO_ROOT = path.resolve('/opt/app/apps/studio');
const FOREIGN = path.resolve('/work/acme');

describe('resolveStudioPaths honours an explicit override', () => {
  test('the override decides docs/ and stories/ — the tree that gets served', () => {
    const paths = resolveStudioPaths(STUDIO_ROOT, FOREIGN);
    expect(paths.repoRoot).toBe(FOREIGN);
    expect(paths.storiesDir).toBe(path.join(FOREIGN, 'stories'));
    expect(paths.docsDir).toBe(path.join(FOREIGN, 'docs'));
  });

  test('dataDir stays anchored to the STUDIO root, not the repo root (ADR-0244 D3)', () => {
    // The studio's own data — the offline runtime store, comments, users, attestations — ships with
    // the APP and must NOT follow a foreign repo root, while docs/ and stories/ must. Increment 1
    // made that split deliberately; pinning it here so a later "make everything follow the root"
    // sweep cannot quietly take the app's own files with it.
    //
    // It used to be pinned via `knowledgeFile`, the seed ADR-0302 D1 deleted; `assetsFile` is the
    // same assertion against a path that still exists, and it is the sharper one anyway — the
    // runtime store is WRITTEN, so following a foreign root would have the studio writing into
    // someone else's checkout.
    const paths = resolveStudioPaths(STUDIO_ROOT, FOREIGN);
    expect(paths.dataDir).toBe(path.join(STUDIO_ROOT, 'data'));
    expect(paths.assetsFile).toBe(path.join(STUDIO_ROOT, 'data', 'assets.runtime.json'));
  });

  test('no override falls back to the studio-root derivation (storytree unchanged)', () => {
    const before = process.env['STORYTREE_REPO_ROOT'];
    delete process.env['STORYTREE_REPO_ROOT'];
    try {
      const paths = resolveStudioPaths(STUDIO_ROOT);
      expect(paths.repoRoot).toBe(path.resolve(STUDIO_ROOT, '..', '..'));
    } finally {
      if (before !== undefined) process.env['STORYTREE_REPO_ROOT'] = before;
    }
  });

  test('an explicit override BEATS STORYTREE_REPO_ROOT (explicit > env)', () => {
    const before = process.env['STORYTREE_REPO_ROOT'];
    process.env['STORYTREE_REPO_ROOT'] = path.resolve('/work/decoy');
    try {
      expect(resolveStudioPaths(STUDIO_ROOT, FOREIGN).repoRoot).toBe(FOREIGN);
    } finally {
      if (before === undefined) delete process.env['STORYTREE_REPO_ROOT'];
      else process.env['STORYTREE_REPO_ROOT'] = before;
    }
  });
});

describe('parseRepoRootFlag — the serve.ts source for the override', () => {
  test('reads --repo-root <path>', () => {
    expect(parseRepoRootFlag(['--repo-root', FOREIGN])).toBe(FOREIGN);
    expect(parseRepoRootFlag(['--port', '8080', '--repo-root', FOREIGN])).toBe(FOREIGN);
  });

  test('absent flag is undefined — Cloud Run starts with no args and must be unchanged', () => {
    expect(parseRepoRootFlag([])).toBeUndefined();
    expect(parseRepoRootFlag(['--port', '8080'])).toBeUndefined();
  });

  test('a valueless or blank flag is UNSET, never the filesystem root', () => {
    // The inc-1 blank-value trap, restated at this boundary: returning '' here would make
    // resolveRepoRoot's `explicit` win with an empty path and resolve every join against '/'.
    expect(parseRepoRootFlag(['--repo-root'])).toBeUndefined();
    expect(parseRepoRootFlag(['--repo-root', '   '])).toBeUndefined();
    expect(parseRepoRootFlag(['--repo-root', '--port'])).toBeUndefined();
  });
});
