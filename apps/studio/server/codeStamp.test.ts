// Unit tests for the code-stamp probe (codeStamp.ts). The comparison half is pure and
// covered exhaustively; the git half runs against THIS repo (git is on every dev/CI host
// this suite runs on) and against the system temp dir for the never-throws null path.

import { describe, it, expect } from 'vitest';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { gitHead, buildCodeStamp, createCodeStampProbe, readWithRetry } from './codeStamp';

// apps/studio/server → up three = the repo root.
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);

describe('buildCodeStamp', () => {
  it('is null unless BOTH shas resolved — a half-answer is no stamp, not a false alarm', () => {
    expect(buildCodeStamp(null, null)).toBeNull();
    expect(buildCodeStamp(A, null)).toBeNull();
    expect(buildCodeStamp(null, B)).toBeNull();
  });

  it('same sha → fresh, different sha → stale', () => {
    expect(buildCodeStamp(A, A)).toEqual({ startedAt: A, head: A, stale: false });
    expect(buildCodeStamp(A, B)).toEqual({ startedAt: A, head: B, stale: true });
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
