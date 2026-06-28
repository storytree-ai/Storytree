// Contract tests for the build-run registry (capability build-run-registry, ADR-0090 Phase 1).
// The registry is the server-side in-memory run lifecycle: create a run, accumulate its COARSE
// transcript as the worker drives a build, land a terminal verdict — one build at a time. It owns
// NO proof logic (the spine still signs); it only holds run state + the coarse progress.

import { describe, it, expect } from 'vitest';
// The worker machinery relocated into @storytree/drive (ADR-0133 d.3); this suite proves the parity.
import { BuildRegistry } from '@storytree/drive/build-worker';

describe('BuildRegistry', () => {
  // brr-create-run-mints-building-run
  it('createRun mints a fresh non-terminal building run', () => {
    const reg = new BuildRegistry();
    const created = reg.createRun('library-cli');
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.run.runId).toBeTruthy();
    expect(created.run.unitId).toBe('library-cli');
    expect(created.run.status).toBe('building');
    expect(created.run.transcript).toEqual([]);

    // A second run is only mintable after the first terminalises — and gets a distinct id.
    reg.terminalisePassed(created.run.runId, 'verdict: PASS');
    const second = reg.createRun('library-cli');
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.run.runId).not.toBe(created.run.runId);
  });

  // brr-refuses-concurrent-build
  it('refuses a second run while one is live — a typed result, not a throw', () => {
    const reg = new BuildRegistry();
    const first = reg.createRun('library-cli');
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const concurrent = reg.createRun('something-else');
    expect(concurrent.ok).toBe(false);
    if (concurrent.ok) return;
    expect(concurrent.reason).toMatch(/already running/i);
    // No second run was registered.
    expect(reg.hasActiveBuild()).toBe(true);

    // Once the first terminalises, createRun succeeds again.
    reg.terminaliseFailed(first.run.runId, 'failed closed at AUTHOR_TEST');
    expect(reg.hasActiveBuild()).toBe(false);
    const after = reg.createRun('something-else');
    expect(after.ok).toBe(true);
  });

  // brr-append-line-accumulates-coarse-transcript
  it('appended lines accumulate in order, normalised to single display lines', () => {
    const reg = new BuildRegistry();
    const created = reg.createRun('library-cli');
    if (!created.ok) return;
    const { runId } = created.run;

    reg.appendLine(runId, 'phase: AUTHOR_TEST');
    reg.appendLine(runId, '  CONFIRM_RED  ');
    // An embedded newline is collapsed to a single display line (coarse, not raw).
    reg.appendLine(runId, 'multi\nline\nblock');

    const run = reg.getRun(runId);
    expect(run?.transcript).toEqual([
      'phase: AUTHOR_TEST',
      'CONFIRM_RED',
      'multi line block',
    ]);
  });

  // brr-transcript-capped
  it('caps the transcript line count and truncates over-long lines', () => {
    const reg = new BuildRegistry({ maxLines: 3, maxLineChars: 8 });
    const created = reg.createRun('library-cli');
    if (!created.ok) return;
    const { runId } = created.run;

    for (const n of ['l1', 'l2', 'l3', 'l4', 'l5']) reg.appendLine(runId, n);
    const run = reg.getRun(runId);
    // Only the most-recent maxLines are retained — the in-memory buffer is bounded.
    expect(run?.transcript).toEqual(['l3', 'l4', 'l5']);

    reg.appendLine(runId, 'abcdefghijklmnop'); // 16 chars > maxLineChars (8)
    const truncated = reg.getRun(runId)?.transcript.at(-1) ?? '';
    expect(truncated.length).toBeLessThanOrEqual(8);
    expect(truncated.startsWith('abcdefgh')).toBe(true);
  });

  // brr-terminal-passed-carries-envelope
  it('terminalisePassed lands the envelope, freezes the run, unblocks the next', () => {
    const reg = new BuildRegistry();
    const created = reg.createRun('library-cli');
    if (!created.ok) return;
    const { runId } = created.run;
    reg.appendLine(runId, 'phase: GATE');

    reg.terminalisePassed(runId, 'verdict: PASS (signed by operator)');
    const run = reg.getRun(runId);
    expect(run?.status).toBe('passed');
    expect(run?.envelope).toMatch(/verdict: PASS/);

    // Terminal: no further appends accepted.
    reg.appendLine(runId, 'late line');
    expect(reg.getRun(runId)?.transcript).toEqual(['phase: GATE']);

    // The next build is unblocked.
    expect(reg.hasActiveBuild()).toBe(false);
    expect(reg.createRun('library-cli').ok).toBe(true);
  });

  // brr-terminal-failed-carries-reason
  it('terminaliseFailed records the reason, freezes the run, unblocks the next', () => {
    const reg = new BuildRegistry();
    const created = reg.createRun('library-cli');
    if (!created.ok) return;
    const { runId } = created.run;

    reg.terminaliseFailed(runId, 'failed closed at AUTHOR_TEST: no signer');
    const run = reg.getRun(runId);
    expect(run?.status).toBe('failed');
    expect(run?.reason).toMatch(/failed closed at AUTHOR_TEST/);
    expect(run?.envelope).toBeUndefined();

    expect(reg.hasActiveBuild()).toBe(false);
    expect(reg.createRun('library-cli').ok).toBe(true);
  });

  it('getRun returns undefined for an unknown runId', () => {
    const reg = new BuildRegistry();
    expect(reg.getRun('nope')).toBeUndefined();
  });
});
