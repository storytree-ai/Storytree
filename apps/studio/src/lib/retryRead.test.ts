// The bounded retry behind the traversal picker's index read (`traversal-panel-arc`, increment
// `traversal-panel-index-read`, src/lib/retryRead.ts).
//
// The friction this repairs is not slowness, it is IRREVERSIBILITY: one lost race set the picker to
// `{status:'failed'}` for the life of the mount and disabled every claimed session. So the
// assertions below are about what survives a transient failure and what a caller is finally told —
// the recovery, the bound, and the fact that the LAST failure is the one an operator reads, because
// that is the attempt describing the world they are looking at.

import { describe, it, expect } from 'vitest';
import { retryRead } from './retryRead';

/** Records what was waited for without spending it — the retry is proved, not timed. */
function recordingSleep(): { sleep: (ms: number) => Promise<void>; waited: number[] } {
  const waited: number[] = [];
  return {
    waited,
    sleep: (ms: number): Promise<void> => {
      waited.push(ms);
      return Promise.resolve();
    },
  };
}

describe('retryRead', () => {
  it('returns the first success without sleeping at all', async () => {
    const { sleep, waited } = recordingSleep();
    let calls = 0;

    const value = await retryRead(
      () => {
        calls += 1;
        return Promise.resolve('index');
      },
      { attempts: 3, backoffMs: (n) => n * 500, sleep },
    );

    expect(value).toBe('index');
    expect(calls).toBe(1);
    expect(waited).toEqual([]);
  });

  it('recovers from a transient failure — the case that used to kill the picker', async () => {
    const { sleep, waited } = recordingSleep();
    let calls = 0;

    const value = await retryRead(
      () => {
        calls += 1;
        if (calls === 1) return Promise.reject(new Error('signal timed out'));
        return Promise.resolve({ sessions: ['a'] });
      },
      { attempts: 3, backoffMs: (n) => n * 500, sleep },
    );

    expect(value).toEqual({ sessions: ['a'] });
    expect(calls).toBe(2);
    expect(waited).toEqual([500]);
  });

  it('backs off between attempts and stops at the bound', async () => {
    const { sleep, waited } = recordingSleep();
    let calls = 0;

    await expect(
      retryRead(
        () => {
          calls += 1;
          return Promise.reject(new Error(`attempt ${calls}`));
        },
        { attempts: 3, backoffMs: (n) => n * 500, sleep },
      ),
    ).rejects.toThrow('attempt 3');

    // Bounded: three attempts, never a loop that keeps a surface pending forever.
    expect(calls).toBe(3);
    expect(waited).toEqual([500, 1000]);
  });

  it('propagates the LAST failure, not the first', async () => {
    const { sleep } = recordingSleep();
    const messages = ['signal timed out', 'signal timed out', 'Failed to fetch'];
    let calls = 0;

    await expect(
      retryRead(
        () => Promise.reject(new Error(messages[calls++] ?? 'unreachable')),
        { attempts: 3, backoffMs: () => 1, sleep },
      ),
    ).rejects.toThrow('Failed to fetch');
  });

  it('attempts: 1 disables retrying without changing the call shape', async () => {
    const { sleep, waited } = recordingSleep();
    let calls = 0;

    await expect(
      retryRead(
        () => {
          calls += 1;
          return Promise.reject(new Error('once'));
        },
        { attempts: 1, backoffMs: () => 500, sleep },
      ),
    ).rejects.toThrow('once');

    expect(calls).toBe(1);
    expect(waited).toEqual([]);
  });
});
