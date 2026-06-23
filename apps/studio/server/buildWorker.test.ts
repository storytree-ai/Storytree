// Contract tests for the build worker (capability ui-build-trigger, ADR-0090 Phase 1).
// The worker is the server-process piece that the API's POST handler starts fire-and-forget: it
// drives the EXISTING build path (nodeBuild --live) through an injected runner, streams that build's
// COARSE progress into the run's transcript (via the registry), and terminalises the run with the
// envelope. It is the single orchestrator boundary — it calls the public build entry and reaches
// inside no gate/spine/leaf internals.

import { describe, it, expect, vi } from 'vitest';
import { BuildRegistry } from './buildRegistry';
import {
  runBuildJob,
  buildRunnerFromNodeBuild,
  routedBuildRunner,
  type BuildEnvelope,
  type NodeBuildLike,
  type StoryBuildLike,
} from './buildWorker';

describe('runBuildJob', () => {
  // ubt-worker-streams-coarse-lines-to-run (pass path)
  it('streams the build coarse lines into the run and terminalises passed with the envelope', async () => {
    const reg = new BuildRegistry();
    const created = reg.createRun('library-cli');
    if (!created.ok) throw new Error('setup');
    const { runId } = created.run;

    const runner = async (unitId: string, sink: (line: string) => void): Promise<BuildEnvelope> => {
      expect(unitId).toBe('library-cli');
      sink('phase: AUTHOR_TEST');
      sink('phase: GATE');
      return { ok: true, body: 'verdict: PASS\nsigner: operator', next: [] };
    };

    await runBuildJob(reg, runId, 'library-cli', runner);

    const run = reg.getRun(runId);
    expect(run?.status).toBe('passed');
    // A start marker, the streamed phase lines, and the envelope body lines are all present, in order.
    expect(run?.transcript).toContain('phase: AUTHOR_TEST');
    expect(run?.transcript).toContain('phase: GATE');
    expect(run?.transcript).toContain('verdict: PASS');
    expect(run?.transcript[0]).toMatch(/build started/i);
    expect(run?.envelope).toMatch(/verdict: PASS/);
    // The build is unblocked once the worker terminalises.
    expect(reg.hasActiveBuild()).toBe(false);
  });

  // ubt-worker-streams-coarse-lines-to-run (fail path)
  it('terminalises failed with the reason when the build envelope is not ok', async () => {
    const reg = new BuildRegistry();
    const created = reg.createRun('library-cli');
    if (!created.ok) throw new Error('setup');
    const { runId } = created.run;

    const runner = async (): Promise<BuildEnvelope> => ({
      ok: false,
      body: 'node build library-cli — LIVE-SMOKE\nverdict: NONE — failed closed at AUTHOR_TEST: no signer',
    });

    await runBuildJob(reg, runId, 'library-cli', runner);

    const run = reg.getRun(runId);
    expect(run?.status).toBe('failed');
    expect(run?.reason).toMatch(/failed closed at AUTHOR_TEST/i);
    expect(run?.envelope).toBeUndefined();
    // The failure body is still visible in the transcript (an honest terminal state).
    expect(run?.transcript.some((l) => /failed closed/i.test(l))).toBe(true);
  });

  it('terminalises failed when the runner throws (never an unhandled rejection)', async () => {
    const reg = new BuildRegistry();
    const created = reg.createRun('library-cli');
    if (!created.ok) throw new Error('setup');
    const { runId } = created.run;

    const runner = async (): Promise<BuildEnvelope> => {
      throw new Error('the SDK leaf could not authenticate');
    };

    await runBuildJob(reg, runId, 'library-cli', runner);

    const run = reg.getRun(runId);
    expect(run?.status).toBe('failed');
    expect(run?.reason).toMatch(/could not authenticate/i);
    expect(reg.hasActiveBuild()).toBe(false);
  });
});

describe('buildRunnerFromNodeBuild', () => {
  // ubt-worker-spawns-real-build-entry
  it('invokes the existing nodeBuild entry with the Phase-1 options (single node, live, NON-persisting)', async () => {
    const nodeBuild = vi.fn<NodeBuildLike>(async () => ({ ok: true, body: 'verdict: PASS' }));
    const runner = buildRunnerFromNodeBuild(nodeBuild);

    const envelope = await runner('library-cli', () => {});

    expect(nodeBuild).toHaveBeenCalledTimes(1);
    const [unitId, opts] = nodeBuild.mock.calls[0]!;
    expect(unitId).toBe('library-cli');
    expect(opts).toMatchObject({ live: true });
    // ADR-0099-B: a --live smoke must NOT persist a forged green — the pinned `--store pg` is dropped,
    // so the smoke runs in-memory and `verdictStore` is never set to 'pg'.
    expect(opts.verdictStore).toBeUndefined();
    // Phase-1 scope walls: NOT a real build, NOT a dry-run.
    expect(opts.real).toBeFalsy();
    expect(opts.dryRun).toBeFalsy();
    expect(envelope.ok).toBe(true);
  });
});

describe('routedBuildRunner', () => {
  it('routes a STORY id to storyBuild --real (the honest whole-story chain)', async () => {
    const nodeBuild = vi.fn<NodeBuildLike>(async () => ({ ok: true, body: 'node' }));
    const storyBuild = vi.fn<StoryBuildLike>(async () => ({ ok: true, body: 'story chain PASSED' }));
    const runner = routedBuildRunner({
      classify: async () => 'story',
      nodeBuild,
      storyBuild,
    });

    const lines: string[] = [];
    const env = await runner('notice-board', (l) => lines.push(l));

    expect(storyBuild).toHaveBeenCalledTimes(1);
    expect(nodeBuild).not.toHaveBeenCalled();
    const [storyId, opts] = storyBuild.mock.calls[0]!;
    expect(storyId).toBe('notice-board');
    // openPr:true → the green chain opens a non-draft PR that auto-merges to trunk (ADR-0022).
    expect(opts).toMatchObject({ real: true, dryRun: false, verdictStore: 'pg', openPr: true });
    expect(env.body).toMatch(/story chain/i);
    expect(lines.some((l) => /auto-merges to trunk/i.test(l))).toBe(true);
  });

  it('routes a NODE id to nodeBuild --live (single-node, synthetic pipeline, NON-persisting)', async () => {
    const nodeBuild = vi.fn<NodeBuildLike>(async () => ({ ok: true, body: 'verdict: PASS' }));
    const storyBuild = vi.fn<StoryBuildLike>(async () => ({ ok: true, body: 'story' }));
    const runner = routedBuildRunner({
      classify: async () => 'node',
      nodeBuild,
      storyBuild,
    });

    const lines: string[] = [];
    await runner('library-cli', (l) => lines.push(l));

    expect(nodeBuild).toHaveBeenCalledTimes(1);
    expect(storyBuild).not.toHaveBeenCalled();
    const [unitId, opts] = nodeBuild.mock.calls[0]!;
    expect(unitId).toBe('library-cli');
    expect(opts).toMatchObject({ live: true });
    // ADR-0099-B: a single-node `--live` smoke is SYNTHETIC, so it must NOT persist — the node branch
    // omits `verdictStore`. Passing `--store pg` here would be refused downstream (`resolveVerdictStore`,
    // a synthetic walk) and terminalise the UI Build as FAILED. Mirrors the buildRunnerFromNodeBuild guard.
    expect(opts.verdictStore).toBeUndefined();
    expect(opts.real).toBeFalsy();
    expect(opts.dryRun).toBeFalsy();
    expect(lines.some((l) => /single-node --live/i.test(l))).toBe(true);
  });

  it('threads an actor flag to the routed entry when given', async () => {
    const storyBuild = vi.fn<StoryBuildLike>(async () => ({ ok: true, body: 'ok' }));
    const runner = routedBuildRunner({
      classify: async () => 'story',
      nodeBuild: async () => ({ ok: true, body: '' }),
      storyBuild,
      actor: 'op@example.com',
    });
    await runner('notice-board', () => {});
    expect(storyBuild.mock.calls[0]![1]).toMatchObject({ actor: 'op@example.com' });
  });
});
