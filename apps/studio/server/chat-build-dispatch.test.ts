// Contract tests for the chat-surface build dispatch (capability chat-build-dispatch, ADR-0108 d.3).
// Proves `dispatchAcceptedBuild` routes a human-accepted unit id to the existing worker machinery —
// real BuildRegistry + runBuildJob, scripted BuildRunner — returning typed results the chat surface
// folds into its stream. No SDK spend; no live builds; no DB.
//
// This is a capability-tier integration test: it crosses the dispatch validation + the run mint +
// the fire-and-forget worker invocation + the progress fold, exercised against the REAL BuildRegistry
// with the build runner injected as a scripted double (the buildWorker.test.ts / buildApi pattern).

import { describe, it, expect } from 'vitest';
import { BuildRegistry } from './buildRegistry';
import type { BuildContext } from './apiRouter';
import type { BuildRunner, BuildEnvelope } from './buildWorker';
import { dispatchAcceptedBuild } from './chat-build-dispatch.js';

/** Drain the event loop until the fire-and-forget worker reaches a terminal state. */
async function waitTerminal(registry: BuildRegistry, runId: string, tries = 20): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (registry.getRun(runId)?.status !== 'building') return;
    await new Promise<void>((r) => setTimeout(r, 0));
  }
  throw new Error(`run ${runId} never reached a terminal state`);
}

describe('dispatchAcceptedBuild', () => {
  // cbd-accepted-id-dispatches-and-run-reaches-terminal
  it('returns { ok: true, runId } for a buildable accepted unit id and the run reaches terminal with progress lines on its transcript', async () => {
    const registry = new BuildRegistry();
    const runner: BuildRunner = async (
      unitId: string,
      sink: (line: string) => void,
    ): Promise<BuildEnvelope> => {
      sink('phase: AUTHOR_TEST');
      sink('phase: GATE');
      return { ok: true, body: 'verdict: PASS\nsigned by operator' };
    };
    const build: BuildContext = {
      registry,
      runner,
      isBuildable: async (id) => id === 'chat-drive-bridge',
    };

    const result = await dispatchAcceptedBuild('chat-drive-bridge', build);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.runId).toBeTruthy();

    // The fire-and-forget worker runs asynchronously; wait for it to reach a terminal state.
    await waitTerminal(registry, result.runId);

    const run = registry.getRun(result.runId);
    // The run reached a terminal state driven by the scripted runner.
    expect(run?.status).toBe('passed');
    // The scripted runner's coarse lines appear on the transcript (the progress fold).
    expect(run?.transcript).toContain('phase: AUTHOR_TEST');
    expect(run?.transcript).toContain('phase: GATE');
    // runBuildJob folds the envelope body lines onto the transcript before terminalising.
    expect(run?.transcript).toContain('verdict: PASS');
    // The terminal envelope carries the full body.
    expect(run?.envelope).toMatch(/verdict: PASS/);
    // The single-build guard is released once the run terminates.
    expect(registry.hasActiveBuild()).toBe(false);
  });

  // cbd-unbuildable-id-returns-not-buildable
  it('returns { ok: false, reason: "not buildable" } for an un-buildable id — worker is never invoked', async () => {
    const registry = new BuildRegistry();
    let workerInvoked = false;
    const runner: BuildRunner = async (): Promise<BuildEnvelope> => {
      workerInvoked = true;
      return { ok: true, body: 'should not reach here' };
    };
    const build: BuildContext = {
      registry,
      runner,
      isBuildable: async () => false,
    };

    const result = await dispatchAcceptedBuild('no-such-unit', build);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The typed refusal mirrors handleBuild's isBuildable guard (its 404 surfaced as a typed result).
    expect(result.reason).toBe('not buildable');
    // The worker is never invoked — no run is minted against an un-buildable id.
    expect(workerInvoked).toBe(false);
    expect(registry.hasActiveBuild()).toBe(false);
  });

  // cbd-concurrent-dispatch-returns-single-build-refusal
  it('returns { ok: false, reason: "a build is already running" } while a run is live — the registry single-build guard surfaced as a typed result', async () => {
    const registry = new BuildRegistry();
    // Mint an active run directly to occupy the single-build slot (the guard fires on createRun).
    const existing = registry.createRun('occupied-unit');
    expect(existing.ok).toBe(true);

    const build: BuildContext = {
      registry,
      runner: async (): Promise<BuildEnvelope> => ({ ok: true, body: 'should not reach here' }),
      isBuildable: async () => true,
    };

    const result = await dispatchAcceptedBuild('chat-drive-bridge', build);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The exact reason is the registry's single-build-at-a-time guard surfaced verbatim.
    expect(result.reason).toBe('a build is already running');

    // Clean up: release the occupied slot so no phantom active build lingers.
    if (existing.ok) registry.terminalisePassed(existing.run.runId, 'cleanup');
  });
});
