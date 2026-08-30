// Unit tests for the code-stamp probe (codeStamp.ts). The comparison half is pure and
// covered exhaustively; the git half runs against THIS repo (git is on every dev/CI host
// this suite runs on) and against the system temp dir for the never-throws null path.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gitHead, gitBranch, buildCodeStamp, createCodeStampProbe, readWithRetry } from './codeStamp';

// apps/studio/server → up three = the repo root.
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const DIR = '/srv/some-checkout';

describe('buildCodeStamp', () => {
  it('is null unless BOTH shas resolved — a half-answer is no stamp, not a false alarm', () => {
    expect(buildCodeStamp(null, null, DIR, 'main')).toBeNull();
    expect(buildCodeStamp(A, null, DIR, 'main')).toBeNull();
    expect(buildCodeStamp(null, B, DIR, 'main')).toBeNull();
  });

  it('same sha → fresh, different sha → stale', () => {
    expect(buildCodeStamp(A, A, DIR, 'main')).toEqual({
      startedAt: A,
      head: A,
      stale: false,
      directory: DIR,
      branch: 'main',
    });
    expect(buildCodeStamp(A, B, DIR, 'main')).toEqual({
      startedAt: A,
      head: B,
      stale: true,
      directory: DIR,
      branch: 'main',
    });
  });

  it('OMITS branch entirely when git cannot name one — an absent key, never an undefined one', () => {
    const stamp = buildCodeStamp(A, A, DIR, null);
    expect(stamp).toEqual({ startedAt: A, head: A, stale: false, directory: DIR });
    // `branch: undefined` would satisfy toEqual above but lie to every typed reader
    // (exactOptionalPropertyTypes) and serialise differently under a strict validator.
    expect(stamp !== null && 'branch' in stamp).toBe(false);
  });
});

describe('readWithRetry', () => {
  it('returns the first non-null result and stops retrying', async () => {
    let calls = 0;
    const read = async (): Promise<string | null> => (++calls >= 2 ? 'ok' : null);
    expect(await readWithRetry(read, [1, 1, 1])).toBe('ok');
    expect(calls).toBe(2); // one retry was enough — it stopped as soon as it got a value
  });

  it('gives up and returns null after exhausting every retry', async () => {
    let calls = 0;
    const read = async (): Promise<string | null> => {
      calls++;
      return null;
    };
    expect(await readWithRetry(read, [1, 1])).toBeNull();
    expect(calls).toBe(3); // initial read + 2 retries — a real "always null" still fails, not masked
  });

  it('a successful first read pays no backoff and never retries', async () => {
    let calls = 0;
    const read = async (): Promise<number | null> => {
      calls++;
      return 42;
    };
    // Huge backoffs would stall the test if they were ever awaited; they must not be.
    expect(await readWithRetry(read, [10_000, 10_000])).toBe(42);
    expect(calls).toBe(1);
  });
});

describe('gitHead', () => {
  it('answers a hex sha for this repo', async () => {
    const sha = await gitHead(repoRoot);
    expect(sha).toMatch(/^[0-9a-f]{40,64}$/);
  });

  it('answers null (never throws) outside a repo', async () => {
    expect(await gitHead(os.tmpdir())).toBeNull();
  });
});

describe('gitBranch', () => {
  it('names a branch for this repo', async () => {
    expect(await gitBranch(repoRoot)).toMatch(/^\S{1,255}$/);
  });

  it('answers null (never throws) outside a repo', async () => {
    expect(await gitBranch(os.tmpdir())).toBeNull();
  });
});

describe('createCodeStampProbe', () => {
  it('a probe built and read in the same checkout is fresh (startedAt === head)', async () => {
    const stamp = await createCodeStampProbe(repoRoot)();
    expect(stamp).not.toBeNull();
    expect(stamp?.stale).toBe(false);
    expect(stamp?.startedAt).toBe(stamp?.head);
  });

  it('answers null outside a repo', async () => {
    expect(await createCodeStampProbe(os.tmpdir())()).toBeNull();
  });
});

/**
 * The identity half, and the only test here that can catch the defect the field exists for. Every
 * other test in this file builds its probe on THIS checkout, so a probe reporting `process.cwd()`
 * or a build-time constant would pass all of them — the same shape as the bug: a server started in
 * the main checkout while the agent believes it is serving their worktree.
 *
 * So the server is started somewhere the test process is NOT: a throwaway git repo in the system
 * temp dir, on a branch name that exists nowhere in this project. A probe that reports anything
 * other than the directory it was constructed with fails on both fields.
 *
 * A second real repo is what this needs and `web/` is NOT usable for it — that submodule is absent
 * on fresh worktrees and in CI, so the test would skip precisely where it is meant to hold.
 */
const PROBE_BRANCH = 'served-copy-probe-branch';

/** git with identity + signing + hooks neutralised, so the commit lands on any host. */
function gitIn(cwd: string, ...args: string[]): void {
  execFileSync(
    'git',
    ['-c', 'user.name=codestamp probe', '-c', 'user.email=probe@example.invalid', '-c', 'commit.gpgsign=false', ...args],
    { cwd, windowsHide: true, stdio: 'pipe' },
  );
}

describe('createCodeStampProbe — the served copy names itself', () => {
  let tmpRepo: string | undefined;

  beforeAll(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codestamp-probe-'));
    gitIn(dir, 'init', '--quiet');
    // An empty commit, or `rev-parse HEAD` has nothing to resolve on an unborn branch.
    gitIn(dir, 'commit', '--allow-empty', '--no-verify', '--quiet', '-m', 'probe');
    gitIn(dir, 'checkout', '--quiet', '-b', PROBE_BRANCH);
    tmpRepo = dir;
  });

  afterAll(() => {
    if (tmpRepo) fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it('reports the directory and branch of the repo the SERVER runs in, not the test process’s own', async () => {
    const stamp = await createCodeStampProbe(tmpRepo!)();
    expect(stamp).not.toBeNull();
    expect(stamp?.directory).toBe(path.resolve(tmpRepo!));
    expect(stamp?.branch).toBe(PROBE_BRANCH);

    // The discrimination, stated rather than implied: this test process runs in THIS checkout, on
    // another branch entirely. An implementation reading process.cwd(), or one baking the repo root
    // in at build time, reports one of these instead and fails here.
    expect(stamp?.directory).not.toBe(path.resolve(repoRoot));
    expect(stamp?.directory).not.toBe(path.resolve(process.cwd()));
    expect(stamp?.branch).not.toBe(await gitBranch(repoRoot));
  });

  it('still compares the RIGHT checkout against itself — identity does not disturb staleness', async () => {
    const stamp = await createCodeStampProbe(tmpRepo!)();
    // Both shas come from the temp repo, so they agree; had `head` been re-read from the test's own
    // checkout this would be a spurious "the checkout moved under the server".
    expect(stamp?.stale).toBe(false);
    expect(stamp?.startedAt).toBe(await gitHead(tmpRepo!));
  });
});
