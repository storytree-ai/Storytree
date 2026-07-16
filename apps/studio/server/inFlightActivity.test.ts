// render-claim-as-wisp — pure claimsToActivity fold (B1 + B2).
// Proof command: node --import tsx --test apps/studio/server/inFlightActivity.test.ts
//
// Why a standalone module (mirrors inFlightBuilds.ts pattern): the live SQL that
// reads events.node_claim needs a DB (activityApi integration test + operator-attested
// deep-link), but the stale-drop filter and the ADR-0138 §5 honesty-wall discriminator
// are pure data math — red-green here without a DB.
//
// Runner: VITEST (describe/it/expect) — the studio package is a Vite app whose suite is
// `vitest run`, exactly like the sibling inFlightBuilds.test.ts. (The leaf authored this
// node:test-style under the isolated --real proof; converted to vitest in consolidation so
// it runs in the package suite — the vitest-runner-mismatch learning.)

import { describe, it, expect } from 'vitest';
import { claimsToActivity } from './inFlightActivity';

// Mirrors CLAIM_STALE_RECLAIM_MS from @storytree/notice-board (2 hours).
// A claim whose heartbeatAt is past this threshold is stale: the holder crashed/was
// killed and never ran release(), so the wisp self-heals rather than orbiting forever.
const CLAIM_STALE_RECLAIM_MS = 2 * 60 * 60 * 1_000; // 2 h

const NOW = new Date('2026-06-30T12:00:00.000Z');
// 1 minute ago — well within the 2-hour reclaim window (live)
const freshHb = new Date(NOW.getTime() - 60_000).toISOString();
// Just past the threshold — the claim should be dropped
const staleHb = new Date(NOW.getTime() - CLAIM_STALE_RECLAIM_MS - 1).toISOString();

describe('claim-rows-fold-to-one-wisp-per-claimed-story: claimsToActivity — the claim row fold', () => {
  it('B1: maps a fresh claim row to a kind:"claim" ClaimActivity with correct fields', () => {
    const out = claimsToActivity(
      [
        {
          unit_id: 'render-claim-as-wisp',
          session_id: 'sess-1',
          branch: 'claude/real/render-claim',
          intent: 'real',
          grade: 'work',
          claimed_at: freshHb,
          heartbeat_at: freshHb,
        },
      ],
      NOW,
    );
    expect(out).toEqual([
      {
        unitId: 'render-claim-as-wisp',
        kind: 'claim',
        sessionId: 'sess-1',
        branch: 'claude/real/render-claim',
        intent: 'real',
        grade: 'work',
        at: freshHb,
      },
    ]);
  });

  it('B1: drops a claim whose heartbeatAt is past the stale-reclaim window', () => {
    const out = claimsToActivity(
      [
        {
          unit_id: 'dead-unit',
          session_id: 'sess-dead',
          branch: 'b',
          intent: '',
          claimed_at: staleHb,
          heartbeat_at: staleHb,
        },
      ],
      NOW,
    );
    expect(out).toEqual([]);
  });

  it('B1: mixed batch — only the fresh claim survives the stale-drop', () => {
    const out = claimsToActivity(
      [
        {
          unit_id: 'alive',
          session_id: 's1',
          branch: 'b',
          intent: '',
          claimed_at: freshHb,
          heartbeat_at: freshHb,
        },
        {
          unit_id: 'dead',
          session_id: 's2',
          branch: 'b',
          intent: '',
          claimed_at: staleHb,
          heartbeat_at: staleHb,
        },
      ],
      NOW,
    );
    expect(out.map((a) => a.unitId)).toEqual(['alive']);
  });

  it('claim-activity-is-visibly-distinct-from-proven-green: kind is "claim", never "green"/"bloom" (ADR-0138 §5)', () => {
    // A claim-activity must carry a discriminator that keeps it visually distinct from
    // the proven-green bloom (ADR-0045). The fold enforces this in data, before any pixel.
    const out = claimsToActivity(
      [
        {
          unit_id: 'story-x',
          session_id: 'sess-3',
          branch: 'main',
          intent: 'orchestrate',
          claimed_at: freshHb,
          heartbeat_at: freshHb,
        },
      ],
      NOW,
    );
    expect(out.length).toBe(1);
    expect(out[0]?.kind).toBe('claim');
    // Explicit wall — these are the discriminators a renderer would use for the
    // proven-green bloom; a claim must never carry them.
    expect(out[0]?.kind).not.toBe('green');
    expect(out[0]?.kind).not.toBe('bloom');
  });

  it('B1: normalises a Date claimed_at to an ISO string', () => {
    const out = claimsToActivity(
      [
        {
          unit_id: 'date-normalise',
          session_id: 's',
          branch: 'b',
          intent: '',
          claimed_at: new Date(freshHb),
          heartbeat_at: freshHb,
        },
      ],
      NOW,
    );
    expect(out[0]?.at).toBe(freshHb);
  });

  // ── grade rides the fold (ADR-0200 D2/D7): geometry comes from the grade, colour from the
  // intent, and no grade is ever a proof (ADR-0138 §5). ──────────────────────────────────────
  const gradeRow = (grade?: string) => ({
    unit_id: 'graded-unit',
    session_id: 'sess-g',
    branch: 'b',
    intent: '',
    ...(grade !== undefined ? { grade } : {}),
    claimed_at: freshHb,
    heartbeat_at: freshHb,
  });

  it.each(['exploring', 'waiting', 'work'] as const)(
    'ADR-0200 D7: carries grade %s through the fold',
    (grade) => {
      const out = claimsToActivity([gradeRow(grade)], NOW);
      expect(out[0]?.grade).toBe(grade);
    },
  );

  it('ADR-0200 D2: an ABSENT grade normalises to "work" (the pre-grade doc IS the work claim)', () => {
    const out = claimsToActivity([gradeRow(undefined)], NOW);
    expect(out[0]?.grade).toBe('work');
  });

  it('ADR-0200 D2: an UNKNOWN grade string normalises to "work" (never an invalid grade on the wire)', () => {
    const out = claimsToActivity([gradeRow('cosmic')], NOW);
    expect(out[0]?.grade).toBe('work');
  });
});
