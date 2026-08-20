import { describe, expect, it } from 'vitest';

import { sharedBuild } from './libraryBackend';

/**
 * THE RED→GREEN PAIR is the measured failure of 2026-08-12, staging `traversal-panel-attestation`
 * (ADR-0354): `PgBackend.#ready()` guarded its pool build with per-field null checks and nothing
 * else, so every caller arriving before the FIRST `createPool()` resolved started its own. A studio
 * page load fires ~8 `/api/*` reads at once, and the Cloud SQL connector handshake was measured at
 * ~11 s on this machine — so a cold page load opened a herd of connectors racing each other, and the
 * advisory probes (`inFlightClaims` and siblings, hard 4 s race) could not win against their own
 * contention. Symptom one process away: `{"db":"unreachable"}`, `claims: null`, `/api/assets` 295 s
 * where a warm read is 7.2 s, and a context-traversal picker that never rendered at all because the
 * story panel's picker of the day drew nothing when its claims were empty. (That picker is gone —
 * ADR-0354 D2 withdrew the claim-join and the rail now lists the local trace index, which needs no
 * claims and so cannot be blanked by this race. The pool defect it exposed is what this file proves,
 * and that is why the history is kept rather than the component name.)
 *
 * The fix is the promise-memo idiom this same file already uses for `loadStoreModule`, extracted
 * here so the three behaviours that MATTER are provable without a database:
 *   1. concurrent callers share ONE build (the herd);
 *   2. a FAILED build is forgotten, so a transient fault is not fatal for the process's life;
 *   3. it can be forgotten deliberately, so `close()` cannot leave a dead pool memoized.
 */
describe('sharedBuild', () => {
  it('runs the build ONCE for callers that arrive while it is still in flight', async () => {
    let calls = 0;
    let release!: (value: string) => void;
    const shared = sharedBuild(() => {
      calls += 1;
      return new Promise<string>((resolve) => {
        release = resolve;
      });
    });

    // Eight concurrent readers — the shape of one studio page load.
    const waiting = Promise.all(Array.from({ length: 8 }, () => shared.get()));
    expect(calls).toBe(1);

    release('pool');
    expect(await waiting).toEqual(Array.from({ length: 8 }, () => 'pool'));
    expect(calls).toBe(1);
  });

  it('reuses a settled build rather than rebuilding it', async () => {
    let calls = 0;
    const shared = sharedBuild(async () => {
      calls += 1;
      return 'pool';
    });

    expect(await shared.get()).toBe('pool');
    expect(await shared.get()).toBe('pool');
    expect(calls).toBe(1);
  });

  it('FORGETS a failed build, so the next caller retries instead of inheriting the failure forever', async () => {
    let calls = 0;
    const shared = sharedBuild(async () => {
      calls += 1;
      if (calls === 1) throw new Error('connector handshake timed out');
      return 'pool';
    });

    await expect(shared.get()).rejects.toThrow('connector handshake timed out');
    // A memo that kept the rejected promise would make one slow cold start permanent for the
    // process — which is exactly the "db: unreachable that never recovers" shape being removed.
    expect(await shared.get()).toBe('pool');
    expect(calls).toBe(2);
  });

  it('rejects EVERY concurrent caller of a failed build, never just the first', async () => {
    let reject!: (err: Error) => void;
    const shared = sharedBuild(
      () =>
        new Promise<string>((_, rej) => {
          reject = rej;
        }),
    );

    const a = shared.get();
    const b = shared.get();
    reject(new Error('no pool'));

    await expect(a).rejects.toThrow('no pool');
    await expect(b).rejects.toThrow('no pool');
  });

  it('forget() drops a SETTLED build so the next caller rebuilds — what close() needs', async () => {
    let calls = 0;
    const shared = sharedBuild(async () => {
      calls += 1;
      return `pool-${calls}`;
    });

    expect(await shared.get()).toBe('pool-1');
    shared.forget();
    // Without this, `PgBackend.close()` would tear the pool down and leave the memo handing the
    // dead handle to every later reader.
    expect(await shared.get()).toBe('pool-2');
    expect(calls).toBe(2);
  });

  it('forget() during an in-flight build starts a fresh one without wedging the earlier caller', async () => {
    const releases: ((value: string) => void)[] = [];
    const shared = sharedBuild(
      () =>
        new Promise<string>((resolve) => {
          releases.push(resolve);
        }),
    );

    const first = shared.get();
    shared.forget();
    const second = shared.get();
    expect(releases).toHaveLength(2);

    // Each caller settles from the build it actually joined — a forget mid-flight must not strand
    // whoever was already waiting on the build it dropped.
    releases[0]?.('pool-1');
    releases[1]?.('pool-2');
    await expect(first).resolves.toBe('pool-1');
    await expect(second).resolves.toBe('pool-2');
  });
});
