// @vitest-environment jsdom
//
// Red-green of the studio session dock's claims-grouped-by-session view (ADR-0200 D7,
// noticeboard-claim-ledger-arc inc 3 unit 4, made CLAIMS-ONLY by inc 6's presence retirement) —
// DATA only, per the two-stage proof: the appearance is operator-attested later at the arc's UAT
// (ADR-0070 stage 2), so this proves the claim groups render into the dock's DOM (session id,
// branch, unit id, grade, intent, age), NOT how it looks. Self-reported presence rows are GONE
// (ADR-0200 D7): the dock renders the claim ledger alone, with honest empty/absent notes.
// SessionDock is unit-tested directly (like StudioWorldChrome/UatTestsSection elsewhere in this
// file) rather than driven through the full hex-world map, which needs no click-path simulation
// for this DATA-facing behaviour.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { SessionDock } from './TreeView';
import type { SessionClaimGroup } from '../types';

afterEach(cleanup);

const NOW = new Date('2026-07-16T12:00:00.000Z');

describe('SessionDock — claims-only ledger view (ADR-0200 D7 presence retirement)', () => {
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
      <SessionDock claimGroups={groups} now={NOW} onClose={vi.fn()} />,
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

  it('renders NO presence rows or bands — the dock is claims-only (presence retired)', () => {
    const { container } = render(
      <SessionDock claimGroups={[]} now={NOW} onClose={vi.fn()} />,
    );
    expect(container.querySelector('.session-row')).toBeNull();
    expect(container.querySelector('.tree-session-band')).toBeNull();
  });

  it('degrades to an honest silent-store note when claims is null (down DB / json store)', () => {
    const { container } = render(
      <SessionDock claimGroups={null} now={NOW} onClose={vi.fn()} />,
    );
    expect(container.querySelector('.claim-groups')).toBeNull();
    // Advisory absence, never an error surface — the StoreBanner owns the explanatory UX.
    expect(container.textContent).toMatch(/live store/i);
  });

  it('renders an honest empty note (and no claim-groups block) when the store answers no claims', () => {
    const { container } = render(
      <SessionDock claimGroups={[]} now={NOW} onClose={vi.fn()} />,
    );
    expect(container.querySelector('.claim-groups')).toBeNull();
    expect(container.textContent).toMatch(/no live claims/i);
  });
});
