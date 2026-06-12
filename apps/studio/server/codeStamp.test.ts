// Unit tests for the code-stamp probe (codeStamp.ts). The comparison half is pure and
// covered exhaustively; the git half runs against THIS repo (git is on every dev/CI host
// this suite runs on) and against the system temp dir for the never-throws null path.

import { describe, it, expect } from 'vitest';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { gitHead, buildCodeStamp, createCodeStampProbe } from './codeStamp';

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
