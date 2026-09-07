// @vitest-environment jsdom
//
// Red-green of the studio session dock's claims-grouped-by-session view (ADR-0200 D7,
// noticeboard-claim-ledger-arc inc 3 unit 4, made CLAIMS-ONLY by inc 6's presence retirement) —
// DATA only, per the two-stage proof: the appearance is operator-attested later at the arc's UAT
// (ADR-0070 stage 2), so this proves the claim groups render into the dock's DOM (session id,
// branch, unit id, grade, intent, age), NOT how it looks. Self-reported presence rows are GONE
// (ADR-0200 D7): the dock renders the claim ledger alone, with honest empty/absent notes.
// SessionDock is unit-tested directly (like StudioWorldChrome/UatTestCriteriaSection elsewhere in this
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
        stale: false,
        claims: [
          {
            unitId: 'story-a',
            grade: 'work',
            intent: 'real',
            ageMs: 2 * 3_600_000,
            claimedAt: '2026-07-16T10:00:00.000Z',
            stale: false,
            heartbeatAgeMs: 60_000,
          },
        ],
      },
      {
        sessionId: 'sess-new',
        branch: 'claude/sess-new',
        stale: false,
        claims: [
          {
            unitId: 'story-b',
            grade: 'exploring',
            intent: 'scoping the map',
            ageMs: 30 * 60_000,
            claimedAt: '2026-07-16T11:30:00.000Z',
            stale: false,
            heartbeatAgeMs: 30 * 60_000,
          },
          {
            unitId: 'story-c',
            grade: 'waiting',
            intent: '',
            ageMs: 5 * 60_000,
            claimedAt: '2026-07-16T11:55:00.000Z',
            stale: false,
            heartbeatAgeMs: 5 * 60_000,
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
    expect(container.textContent).toMatch(/no claims on the ledger/i);
  });
});

// ── ADR-0535 D1: the dock stops rendering a ghost indistinguishably from a live session ─────────
//
// The measured defect: the CLI board printed a 554-hour claim marked STALE while this dock, handed
// a set the studio's own SQL had already emptied, said nothing at all. Now the wire carries every
// standing row and the dock is what has to sort them. Two rules, and both are refusals:
//   · a row we have not heard from SAYS SO, and says for how long (never rendered as a live one);
//   · a plainly-abandoned row is FOLDED, never dropped (hiding it makes the picture tidy, not true).
describe('SessionDock — three bands (ADR-0535 D1)', () => {
  const claim = (unitId: string, heardAgeMs: number) => ({
    unitId,
    grade: 'work' as const,
    intent: 'orchestrate',
    ageMs: heardAgeMs,
    claimedAt: '2026-07-16T10:00:00.000Z',
    stale: heardAgeMs >= 2 * 3_600_000,
    heartbeatAgeMs: heardAgeMs,
  });
  const held = (sessionId: string, ...claims: ReturnType<typeof claim>[]): SessionClaimGroup => ({
    sessionId,
    branch: `claude/${sessionId}`,
    stale: claims.every((c) => c.stale),
    claims,
  });

  it('marks a held-but-unheard-from row with how long since we last heard', () => {
    const { container } = render(
      <SessionDock claimGroups={[held('dark', claim('story-a', 9 * 3_600_000))]} now={NOW} onClose={vi.fn()} />,
    );
    expect(container.textContent).toContain('story-a');
    expect(container.textContent).toMatch(/last heard 9h ago/i);
    expect(container.querySelector('[data-claim-band="unknown"]')).not.toBeNull();
  });

  it('says NOTHING extra about a live row — the marking is the exception, not the decoration', () => {
    const { container } = render(
      <SessionDock claimGroups={[held('live', claim('story-a', 60_000))]} now={NOW} onClose={vi.fn()} />,
    );
    expect(container.textContent).not.toMatch(/last heard/i);
    expect(container.querySelector('[data-claim-band="live"]')).not.toBeNull();
  });

  it('folds the plainly-abandoned rows into tidy-up instead of opening the dock with corpses', () => {
    // The scale is why this matters and why it is not a filter: 35 of 40 rows on the live ledger
    // were never refreshed once. Listing them inline buries the live session; dropping them is the
    // studio's original bug. The fold is shut by default and the rows are still there.
    const { container } = render(
      <SessionDock
        claimGroups={[held('alive', claim('story-a', 60_000)), held('dead', claim('story-z', 400 * 3_600_000))]}
        now={NOW}
        onClose={vi.fn()}
      />,
    );
    const fold = container.querySelector('details.claim-tidy-up');
    expect(fold).not.toBeNull();
    expect((fold as HTMLDetailsElement).open).toBe(false);
    expect(fold?.textContent).toContain('story-z');
    expect(fold?.textContent).toMatch(/1 claim nobody has released/i);
    // …and the live session is NOT inside the fold — it is on the board above it.
    expect(fold?.textContent).not.toContain('story-a');
    expect(container.querySelector('.claim-groups')?.textContent).toContain('story-a');
    // The header counts what a reader is actually being shown, not the ledger's raw row count.
    expect(container.querySelector('header h4')?.textContent).toBe('session claims (1)');
  });

  it('renders NO tidy-up fold when there is nothing to tidy', () => {
    const { container } = render(
      <SessionDock claimGroups={[held('live', claim('story-a', 60_000))]} now={NOW} onClose={vi.fn()} />,
    );
    expect(container.querySelector('details.claim-tidy-up')).toBeNull();
  });
});
