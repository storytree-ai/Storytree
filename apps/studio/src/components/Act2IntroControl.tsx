// Act2IntroControl — the owner-reachable control that regrows the whole forest (ADR-0282).
//
// One obvious primary button plus the transport the app owns: Back a wave, Replay from nothing,
// and Skip to the settled forest. It renders NOTHING of the world itself — it only moves the
// cursor that `useAct2Intro` holds, so the forest it regrows is the real map behind it.
//
// The readout is deliberately factual (wave, island count, percent) rather than decorative: the
// owner holds the LOOK verdict (ADR-0070), and a control that narrates what the graph is doing is
// more use to that judgement than one that performs.

import type { Act2IntroPlayer } from './act2Intro.js';

export function Act2IntroControl({
  player,
  reducedMotion,
}: {
  readonly player: Act2IntroPlayer;
  readonly reducedMotion: boolean;
}): React.JSX.Element | null {
  const { plan, state } = player;
  if (!plan || !state) return null;

  const landed = state.landedStoryIds.size;
  const total = plan.steps.length;
  const percent = Math.round(player.progress * 100);

  return (
    <div className="act2-intro" data-act2-progress={player.progress.toFixed(4)}>
      <div className="act2-intro-line">
        <button
          type="button"
          className="act2-intro-primary"
          onClick={player.regrowing && player.playing ? player.pause : player.replay}
        >
          {player.playing ? '❚❚ Pause' : '▶ Regrow the forest'}
        </button>
        {player.regrowing && !player.playing && (
          <button type="button" onClick={player.play}>
            Resume
          </button>
        )}
        <button type="button" onClick={player.back} disabled={player.progress <= 0}>
          ↺ Back
        </button>
        <button type="button" onClick={player.settle} disabled={!player.regrowing}>
          Skip to grown
        </button>
      </div>
      <p className="act2-intro-readout">
        {reducedMotion ? (
          // ADR-0282 D6: reduced motion settles on the FULLY GROWN forest — say so plainly rather
          // than leaving a control that looks broken.
          <>Reduced motion — settled on the grown forest.</>
        ) : (
          <>
            wave {state.settled ? plan.waveCount : player.wave + 1} of {plan.waveCount} ·{' '}
            {landed}/{total} islands · {percent}%
          </>
        )}
      </p>
      <p className="act2-intro-note">
        Grown outward from {plan.baseStoryIds.length} base{' '}
        {plan.baseStoryIds.length === 1 ? 'node' : 'nodes'} in the story graph’s own dependency
        order.
      </p>
    </div>
  );
}
