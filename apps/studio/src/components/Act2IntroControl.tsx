// Act2IntroControl — the Act 2 regrow's DIAGNOSTIC panel, mounted only under `?act2=intro`.
//
// It was the owner-facing control (ADR-0282). It is not any more: ADR-0286 moved the two things an
// owner wants — replay, and how fast — into the gear panel's "Forest intro" section, and the regrow
// itself now plays on the first arrival at the map each browser session. Permanent transport chrome
// over the product was the wrong shape once the intro became something you simply arrive at.
//
// What it still earns its place with is the READOUT, which the gear deliberately does not carry:
// depth, islands landed, pathways growing, percent, plus the plan's own account of the base nodes
// and any island no pathway can reach. That is what a measurement run and a look verdict need, and
// the full transport (Back a wave, Skip to grown) is what makes a specific beat inspectable.
//
// It renders NOTHING of the world itself — it only moves the cursor that `useAct2Intro` holds, so
// the forest it regrows is the real map behind it. The readout is deliberately factual rather than
// decorative: the owner holds the LOOK verdict (ADR-0070), and a control that narrates what the
// graph is doing is more use to that judgement than one that performs.

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
  // ADR-0283 D1: pathways are the schedule now, so how many are mid-growth is the honest
  // moment-to-moment readout. `wave` survives beside it as what it actually is — DAG depth.
  const growingPaths = state.drawingSegments.length;

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
            depth {state.settled ? plan.waveCount : player.wave + 1} of {plan.waveCount} ·{' '}
            {landed}/{total} islands · {growingPaths} pathway
            {growingPaths === 1 ? '' : 's'} growing · {percent}%
          </>
        )}
      </p>
      <p className="act2-intro-note">
        {plan.baseStoryIds.length} base{' '}
        {plan.baseStoryIds.length === 1 ? 'node' : 'nodes'} form from nothing; every other island
        forms only where a pathway reaches it.
        {plan.unreachedStoryIds.length > 0 && (
          // The honest fallback, named rather than hidden: a `depends_on` the router could not
          // route has no pathway that can arrive, so those islands land a beat after their
          // ground instead of being stranded off the map.
          <>
            {' '}
            {plan.unreachedStoryIds.length} island
            {plan.unreachedStoryIds.length === 1 ? ' has' : 's have'} no routable pathway and
            land{plan.unreachedStoryIds.length === 1 ? 's' : ''} unreached.
          </>
        )}
      </p>
    </div>
  );
}
