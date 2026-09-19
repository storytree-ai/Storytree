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
import { describeClaimRuntime } from '@storytree/notice-board';
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

// ── ADR-0579: which harness each session runs under, and on which machine ───────────────────────
//
// A claim used to say WHO (a session id — a worktree's name, chosen by its author) and never WHAT or
// WHERE, and an audit read ~40 h of Codex work on the owner's laptop as another machine's because the
// worktree was named after its work. The ledger now records both, detected from the claiming process;
// the dock's job is to say them beside the branch, in the ledger's OWN words — `describeClaimRuntime`
// is the one renderer every surface goes through, so an unrecorded half cannot read two ways.
describe('SessionDock — each session’s harness and machine, beside its branch (ADR-0579)', () => {
  const claim = {
    unitId: 'story-a',
    grade: 'work' as const,
    intent: 'real',
    ageMs: 60_000,
    claimedAt: '2026-07-16T11:59:00.000Z',
    stale: false,
    heartbeatAgeMs: 60_000,
  };
  const group = (runtimes?: SessionClaimGroup['runtimes']): SessionClaimGroup => {
    const built: SessionClaimGroup = {
      sessionId: 'sess-a',
      branch: 'claude/sess-a',
      stale: false,
      claims: [claim],
    };
    // Absent stays ABSENT — the old-server shape — rather than becoming an explicit empty list.
    if (runtimes !== undefined) built.runtimes = runtimes;
    return built;
  };
  const runtimeOf = (container: HTMLElement): Element | null =>
    container.querySelector('.claim-session-header .claim-session-runtime');

  it('prints the pair in the claim ledger’s own words, right after the branch', () => {
    const { container } = render(
      <SessionDock
        claimGroups={[group([{ harness: 'codex', host: 'MicksMSpro' }])]}
        now={NOW}
        onClose={vi.fn()}
      />,
    );
    expect(runtimeOf(container)?.textContent).toBe(
      describeClaimRuntime({ harness: 'codex', host: 'MicksMSpro' }),
    );
    // BESIDE the branch — after it, in the session's own header line, not somewhere a reader has to
    // hunt for it.
    expect(container.querySelector('.claim-session-header')?.textContent).toMatch(
      /claude\/sess-a.*codex on MicksMSpro/,
    );
  });

  it('says "not recorded" for a session whose claims predate detection — never blank, never a guess', () => {
    // The fold lists an unrecorded row as the EMPTY pair (D5): nothing is inferred from the session
    // id, the branch or the machine the store happens to be read from.
    const { container } = render(
      <SessionDock claimGroups={[group([{}])]} now={NOW} onClose={vi.fn()} />,
    );
    expect(runtimeOf(container)?.textContent).toBe('harness and host not recorded');
    expect(runtimeOf(container)?.getAttribute('data-runtime')).toBe('unrecorded');
  });

  it('still says "not recorded" when the wire carries no runtimes at all', () => {
    // A server that predates the field sends no key. The dock says what it does not know rather
    // than printing nothing where a reader would supply the harness they assumed.
    const { container } = render(<SessionDock claimGroups={[group()]} now={NOW} onClose={vi.fn()} />);
    expect(runtimeOf(container)?.textContent).toBe('harness and host not recorded');
  });

  it('names the missing half and keeps the recorded one', () => {
    const { container } = render(
      <SessionDock claimGroups={[group([{ host: 'MicksMSpro' }])]} now={NOW} onClose={vi.fn()} />,
    );
    expect(runtimeOf(container)?.textContent).toBe('harness not recorded, on MicksMSpro');
    expect(runtimeOf(container)?.getAttribute('data-runtime')).toBe('partial');
  });

  it('lists EVERY distinct pair under one session id — a collision across machines is shown, not folded away', () => {
    // A session id is a worktree's name: unique within one clone, and nothing keeps it unique across
    // machines. Two machines under one id is the finding the fold refuses to merge, so the dock must
    // not merge it either — the same `; ` join the CLI board prints.
    const { container } = render(
      <SessionDock
        claimGroups={[
          group([
            { harness: 'codex', host: 'MicksMSpro' },
            { harness: 'codex', host: 'mint-desktop' },
          ]),
        ]}
        now={NOW}
        onClose={vi.fn()}
      />,
    );
    const runtime = runtimeOf(container);
    expect(runtime?.textContent).toBe('codex on MicksMSpro; codex on mint-desktop');
    expect(runtime?.getAttribute('data-runtime-count')).toBe('2');
    expect(runtime?.getAttribute('title')).toMatch(/not unique across machines/i);
  });

  it('a recorded pair beside the EMPTY one is older claims, NOT a collision — the hover says which', () => {
    // Measured on the live ledger the day this landed: a session some of whose claims were taken
    // before detection folds to `[recorded, {}]`. Both pairs are listed — the older claims really do
    // record nothing — but calling it a cross-machine collision would send a reader hunting for a
    // second machine that does not exist.
    const { container } = render(
      <SessionDock
        claimGroups={[group([{ harness: 'claude-code', host: 'MicksMSpro' }, {}])]}
        now={NOW}
        onClose={vi.fn()}
      />,
    );
    const runtime = runtimeOf(container);
    expect(runtime?.textContent).toBe('claude-code on MicksMSpro; harness and host not recorded');
    expect(runtime?.getAttribute('data-runtime')).toBe('partial');
    expect(runtime?.getAttribute('title')).toMatch(/before detection existed/i);
    expect(runtime?.getAttribute('title')).not.toMatch(/not unique across machines/i);
  });
});
