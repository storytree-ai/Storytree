// The story panel's session picker (`traversal-panel-arc`, increment `traversal-panel-session-picker`).
//
// The arc's entry point, and its shape is a decision rather than a default: the replay is reached
// through story island → claimed session → THIS story's narrow right-hand details panel, and is
// never a standalone page, dashboard or wide detached canvas (the design's first acceptance clause).
// So this is a block in `StoryPanel`'s sequence, sized to survive the panel's `PANEL_MIN=360` and the
// minimized `min(340px, 66%)` cap — which is the constraint that chose the owner's Option A over the
// wider alternatives, and it binds here first.
//
// The picker's one real problem is the JOIN, and it lives next door in `lib/traversalPicker.ts`
// (pure, and proved there): a session that CLAIMED this story is not the same set as a session this
// machine can REPLAY, because traces are per-machine local JSONL by the arc's owner decision. This
// component owns the two reads and the selection; it derives nothing about availability itself.
//
// The index is read ONCE per mounted story that has claims — not polled. A trace only grows by
// capture, and re-reading it on a cadence would buy an operator nothing while adding an always-on
// cost class the claim ledger's own dock view deliberately avoided.

import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import {
  buildTraversalPickerOptions,
  replayableCount,
  type TraversalIndexState,
  type TraversalPickerOption,
} from '../lib/traversalPicker';
import type { ClaimActivity } from '../types';
import { DetailDisclosure } from './DetailDisclosure';
import { TraversalReplay } from './TraversalReplay';

/**
 * Offer this story's claiming sessions, and mount the selected one's replay in place.
 *
 * Renders NOTHING when nobody claims this story: an empty dropdown would read as "no session here
 * has a trace", which is a claim about traces when the truth is that nobody is working here.
 */
export function SessionTraversalSection({
  storyId,
  claims,
}: {
  /** The selected island. Changing it RESETS the selection — a replay must never outlive its story. */
  storyId: string;
  /** This story's live claims — the same rows the panel's "Sessions here" disclosure lists. */
  claims: ClaimActivity[];
}): React.JSX.Element | null {
  const [index, setIndex] = useState<TraversalIndexState>({ status: 'pending' });
  const [selected, setSelected] = useState<string | null>(null);
  const hasClaims = claims.length > 0;

  // Selecting a different island resets the picker. StoryPanel is not keyed by story id, so this
  // component can survive a navigation — without the reset, a session claiming the story you LEFT
  // would stay mounted under the story you arrived at, which is the worst kind of wrong: a replay
  // that looks answered and is attributed to the wrong node.
  useEffect(() => setSelected(null), [storyId]);

  useEffect(() => {
    if (!hasClaims) return;
    let live = true;
    void (async (): Promise<void> => {
      try {
        const payload = await api.traversalSessions();
        if (live) setIndex({ status: 'read', payload });
      } catch (error) {
        // NOT an empty index: the studio server did not answer, which must never be rendered as
        // "this machine holds no traces" — the two send an operator to different places to look.
        if (live) setIndex({ status: 'failed', message: (error as Error).message });
      }
    })();
    return () => {
      live = false;
    };
  }, [hasClaims]);

  const options = useMemo(() => buildTraversalPickerOptions(claims, index), [claims, index]);

  if (options.length === 0) return null;

  const replayable = replayableCount(options);
  const chosen = options.find((option) => option.sessionId === selected) ?? null;

  return (
    // A DetailDisclosure like every other block in the panel's sequence, rather than a bespoke
    // header: the chevron, the count and the remembered open state all come free, and an operator
    // meets one collapsing idiom down the whole panel instead of two.
    <DetailDisclosure
      label="Context traversal"
      count={options.length}
      defaultOpen
      className="traversal-picker"
    >
      <div data-testid="traversal-picker">
        <label className="small traversal-picker-label">
          <span className="muted">Replay a session here</span>
          <select
            className="traversal-picker-select"
            aria-label="replay a session's context traversal"
            value={selected ?? ''}
            onChange={(event) => setSelected(event.currentTarget.value || null)}
          >
            <option value="">— pick a session —</option>
            {options.map((option) => (
              <option
                key={option.sessionId}
                value={option.sessionId}
                // Offered but not selectable: the row stays visible so an operator can SEE that the
                // session is here and why it cannot be replayed, instead of meeting a shorter list.
                disabled={option.availability.state !== 'available'}
                title={optionReason(option)}
              >
                {optionLabel(option)}
              </option>
            ))}
          </select>
        </label>

        {/* Why the picker may be offering nothing selectable — stated at the block, because a
            dropdown full of disabled rows is otherwise a dead end with no explanation in reach. */}
        {replayable === 0 && (
          <p className="small muted traversal-picker-note" data-testid="traversal-picker-note">
            {noneReason(index, options)}
          </p>
        )}

        {chosen && chosen.availability.state === 'available' && (
          <TraversalReplay sessionId={chosen.sessionId} />
        )}
      </div>
    </DetailDisclosure>
  );
}

/**
 * The row's text. It carries the unavailability reason INLINE rather than only in a tooltip: a
 * dropdown's option list is not width-clipped by the 360px panel, and a reason an operator has to
 * hover to find is a reason most operators never read.
 */
function optionLabel(option: TraversalPickerOption): string {
  const { availability } = option;
  if (availability.state === 'available') {
    const events = `${availability.eventCount} event${availability.eventCount === 1 ? '' : 's'}`;
    return `${option.sessionId} · ${option.grade} · ${events}`;
  }
  if (availability.state === 'no-trace') {
    return `${option.sessionId} · ${option.grade} · no trace on this machine`;
  }
  return `${option.sessionId} · ${option.grade} · trace availability unknown`;
}

function optionReason(option: TraversalPickerOption): string {
  const { availability } = option;
  return availability.state === 'available' ? option.intent : availability.reason;
}

/**
 * One line for "nothing here can be replayed", and the three causes stay distinct because they send
 * an operator to three different places: their trace dir, the studio server, or simply waiting.
 */
function noneReason(index: TraversalIndexState, options: readonly TraversalPickerOption[]): string {
  if (index.status === 'pending') return 'reading this machine’s traces…';
  if (index.status === 'failed') {
    return `could not read the local trace index — ${index.message}. This says nothing about whether traces exist.`;
  }
  const count = options.length;
  return (
    `none of the ${count} session${count === 1 ? '' : 's'} claiming this story left a readable trace under ` +
    `${index.payload.dir}. Traces are per-machine, so a session that ran on another machine — or on the ` +
    `hosted studio, which captures none — leaves nothing to replay here.`
  );
}
