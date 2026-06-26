// Proves the dev-server resilience guard (the "Adopt kills localhost" fix): a fire-and-forget worker
// job's async fault must LOG and the dev server must SURVIVE, instead of crashing the whole process.
//
// The only faithful proof that a process SURVIVES a fault that would otherwise crash it is to actually
// spawn a process and observe its exit code — a process-level handler's whole value is changing Node's
// default-exit behaviour, which can't be asserted in-process. So each case spawns the fixture (the same
// `node --import tsx` the studio launcher uses) and checks the exit code + the suppression log.
import { describe, it, expect } from 'vitest';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, 'devServerResilience.fixture.ts');

function runFixture(mode: 'guard' | 'no-guard', fault: 'reject' | 'throw'): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, ['--import', 'tsx', fixture, mode, fault], {
    cwd: here, // tsx resolves from apps/studio/node_modules upward
    encoding: 'utf8',
    timeout: 30_000,
  });
}

describe('installDevServerResilience', () => {
  it('RED baseline: without the guard, an unhandled rejection terminates the process', () => {
    const r = runFixture('no-guard', 'reject');
    expect(r.status).not.toBe(0); // Node default: an unhandled rejection exits non-zero
    expect(`${r.stdout}${r.stderr}`).not.toMatch(/reached clean exit/);
  });

  it('GREEN: with the guard, an unhandled rejection is suppressed and the process survives (exit 0)', () => {
    const r = runFixture('guard', 'reject');
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/SUPPRESSED unhandled rejection/);
    expect(r.stderr).toMatch(/reached clean exit/);
  });

  it('GREEN: with the guard, an uncaught exception is suppressed and the process survives (exit 0)', () => {
    const r = runFixture('guard', 'throw');
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/SUPPRESSED uncaught exception/);
    expect(r.stderr).toMatch(/reached clean exit/);
  });
});
