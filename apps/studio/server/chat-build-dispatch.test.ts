// Contract tests for the chat-surface build dispatch (capability chat-build-dispatch, ADR-0108 d.3).
// Proves `dispatchAcceptedBuild` routes a human-accepted unit id to the existing worker machinery —
// real BuildRegistry + runBuildJob, scripted BuildRunner — returning typed results the chat surface
// folds into its stream. No SDK spend; no live builds; no DB.
//
// This is a capability-tier integration test: it crosses the dispatch validation + the run mint +
// the fire-and-forget worker invocation + the progress fold, exercised against the REAL BuildRegistry
// with the build runner injected as a scripted double (the buildWorker.test.ts / buildApi pattern).
//
// COVERAGE NOTE (orchestrate-route-supplement / audit-the-signed-verdict): the first three behavioural
// tests were authored by the gated leaf under the signed --real verdict (run real-mqxhg3n9 →
// events.verdict @ 2f63f12); their bodies are preserved verbatim. Their `it(...)` names have been
// brought onto the EXACT `## Contracts` ids, and the fourth contract (`cbd-intent-not-verdict`, dropped
// by the leaf) added, so the ADR-0126 contract-coverage classifier reads 4/4 — the leaf's signed green
// proves the red→green of its authored test; this standing suite proves every declared contract.

import { describe, it, expect } from 'vitest';
// The chat dispatch + worker relocated into @storytree/drive (ADR-0133 d.3 — one home, two surfaces);
// this suite proves the dispatch behaves identically over the relocated worker (parity).
import {
  BuildRegistry,
  dispatchAcceptedBuild,
  type BuildContext,
  type BuildRunner,
  type BuildEnvelope,
} from '@storytree/drive/build-worker';

/** Drain the event loop until the fire-and-forget worker reaches a terminal state. */
async function waitTerminal(registry: BuildRegistry, runId: string, tries = 100): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (registry.getRun(runId)?.status !== 'building') return;
    await new Promise<void>((r) => setTimeout(r, 5));
  }
  throw new Error(`run ${runId} never reached a terminal state`);
}

describe('dispatchAcceptedBuild', () => {
  it('cbd-dispatches-accepted-buildable-id: returns { ok: true, runId } for a buildable accepted unit id and the run reaches terminal with the scripted progress folded onto its transcript', async () => {
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

  it('cbd-refuses-unbuildable-id: returns { ok: false, reason: "not buildable" } for an un-buildable id — the worker is never invoked', async () => {
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

  it('cbd-single-build-guard: returns { ok: false, reason: "a build is already running" } while a run is live — the registry single-build guard surfaced as a typed result, the running run untouched', async () => {
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
    // The running run is left untouched (still building) by the refused dispatch.
    if (existing.ok) expect(registry.getRun(existing.run.runId)?.status).toBe('building');

    // Clean up: release the occupied slot so no phantom active build lingers.
    if (existing.ok) registry.terminalisePassed(existing.run.runId, 'cleanup');
  });

  it('cbd-intent-not-verdict: a safe write — the dispatch hands the worker a unit id and returns intent (a run handle), never a verdict (ADR-0091)', async () => {
    // The dispatch is a SAFE write: it returns a runId only — it never hands a verdict back to the
    // caller, holds no signing key, and writes no events.verdict (the spine inside the worker signs; CI
    // re-proves green before trunk). The STRUCTURAL no-signer / no-DB / no-apps-import property of the
    // relocated dispatch module is now proven at its new home by worker-relocation's
    // `wr-imports-nothing-from-apps` / `wr-typed-refusal-moved-intact` (ADR-0133 d.3); this contract
    // proves the SAFE-WRITE behaviour over the relocated worker.
    const registry = new BuildRegistry();
    const runner: BuildRunner = async (): Promise<BuildEnvelope> => ({ ok: true, body: 'verdict: PASS' });
    const build: BuildContext = { registry, runner, isBuildable: async () => true };
    const result = await dispatchAcceptedBuild('chat-drive-bridge', build);
    expect(result.ok).toBe(true);
    // The result is intent (a run handle), never a verdict.
    expect(result).not.toHaveProperty('verdict');
    if (result.ok) await waitTerminal(registry, result.runId);
  });
});
