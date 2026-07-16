// @vitest-environment jsdom
//
// Red-green of the studio session dock's claims-grouped-by-session view (ADR-0200 D7,
// noticeboard-claim-ledger-arc inc 3 unit 4) — DATA only, per the two-stage proof: the appearance
// is operator-attested later at the arc's UAT (ADR-0070 stage 2), so this proves the claim groups
// render into the dock's DOM (session id, branch, unit id, grade, intent, age), NOT how it looks.
// SessionDock is unit-tested directly (like StudioWorldChrome/UatTestsSection elsewhere in this
// file) rather than driven through the full hex-world map, which needs no click-path simulation
// for this DATA-facing behaviour.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { SessionDock } from './TreeView';
import type { SessionClaimGroup, TreeSession } from '../types';

afterEach(cleanup);

const NOW = new Date('2026-07-16T12:00:00.000Z');

const noopProps = {
  anchors: new Map<string, string[]>(),
  storyForNode: () => null,
  onShowList: vi.fn(),
  onShowDetail: vi.fn(),
  onFocusStory: vi.fn(),
  onClose: vi.fn(),
};

describe('SessionDock — claims-grouped-by-session view (ADR-0200 D7)', () => {
  it('renders one group per session (sessionId + branch) with its claims', () => {
    const groups: SessionClaimGroup[] = [
      {
        sessionId: 'sess-old',
        branch: 'claude/sess-old',
        claims: [
          {
            unitId: 'story-a',
            grade: 'work',
            intent: 'real',
            ageMs: 2 * 3_600_000,
            claimedAt: '2026-07-16T10:00:00.000Z',
          },
        ],
      },
      {
        sessionId: 'sess-new',
        branch: 'claude/sess-new',
        claims: [
          {
            unitId: 'story-b',
            grade: 'exploring',
            intent: 'scoping the map',
            ageMs: 30 * 60_000,
            claimedAt: '2026-07-16T11:30:00.000Z',
          },
          {
            unitId: 'story-c',
            grade: 'waiting',
            intent: '',
            ageMs: 5 * 60_000,
            claimedAt: '2026-07-16T11:55:00.000Z',
          },
        ],
      },
    ];

    const { container } = render(
      <SessionDock
        dock={{ kind: 'list' }}
        sessions={[]}
        claimGroups={groups}
        now={NOW}
        {...noopProps}
      />,
    );

    const groupEls = container.querySelectorAll('.claim-session-group');
    expect(groupEls.length).toBe(2);

    expect(container.textContent).toContain('sess-old');
    expect(container.textContent).toContain('claude/sess-old');
    expect(container.textContent).toContain('story-a');
    expect(container.textContent).toContain('real');
    expect(container.querySelector('.claim-grade-work')).not.toBeNull();

    expect(container.textContent).toContain('sess-new');
    expect(container.textContent).toContain('story-b');
    expect(container.textContent).toContain('scoping the map');
    expect(container.querySelector('.claim-grade-exploring')).not.toBeNull();
    expect(container.textContent).toContain('story-c');
    expect(container.querySelector('.claim-grade-waiting')).not.toBeNull();

    // formatAge renders the claim's age (2h / 30m / 5m at the supplied `now`).
    expect(container.textContent).toMatch(/2h/);
    expect(container.textContent).toMatch(/30m/);
    expect(container.textContent).toMatch(/5m/);
  });

  it('degrades silently to the presence-only view when claims is null (down DB / json store)', () => {
    const sessions: TreeSession[] = [
      {
        sessionId: 'sess-a',
        branch: 'claude/sess-a',
        workingOn: 'something',
        nodes: [],
        band: 'fresh',
        lastSeenAt: NOW.toISOString(),
      },
    ];

    const { container } = render(
      <SessionDock
        dock={{ kind: 'list' }}
        sessions={sessions}
        claimGroups={null}
        now={NOW}
        {...noopProps}
      />,
    );

    expect(container.querySelector('.claim-groups')).toBeNull();
    // The presence row still renders — the claims layer is advisory, never a blocker.
    expect(container.textContent).toContain('sess-a');
  });

  it('renders no claim-groups block when the store answers with no live claims', () => {
    const { container } = render(
      <SessionDock
        dock={{ kind: 'list' }}
        sessions={[]}
        claimGroups={[]}
        now={NOW}
        {...noopProps}
      />,
    );
    expect(container.querySelector('.claim-groups')).toBeNull();
  });
});
