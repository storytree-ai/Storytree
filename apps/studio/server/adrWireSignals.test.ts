// Contract tests for parseAdrWireSignals — a pure, tolerant flat-scan of an ADR's leading YAML
// frontmatter block that surfaces two studio-wire signals: the `load_bearing` boolean and the
// deduped UNION of outbound decision-lineage edges (ADR NUMBERS ONLY, drawn from `supersedes`,
// `supersedes_in_part`, and `amends`). Mirrors the `parseDocStatus` idiom (apiRouter.ts) — no yaml
// parser, no zod, never throws. MACHINE-ONLY: no look leg, no operator-attested UAT — this pins
// pure data-on-the-wire logic only (per the library-adr-wire-signals node spec).

import { describe, it, expect } from 'vitest';

import { parseAdrWireSignals } from './adrWireSignals.js';

describe('parseAdrWireSignals', () => {
  it('laws-load-bearing-tag-true-when-present: reads load_bearing: true from the leading frontmatter block', () => {
    const raw = ['---', 'status: accepted', 'load_bearing: true', '---', '# ADR-0020'].join('\n');
    expect(parseAdrWireSignals('0020-red-green-enforcement-on-the-owned-loop.md', raw)).toEqual({
      loadBearing: true,
      edges: [],
    });
  });

  it('laws-load-bearing-defaults-false-when-absent: a missing load_bearing tag or an explicit false both read as false', () => {
    const withFalse = ['---', 'status: accepted', 'load_bearing: false', '---', '# ADR-0031'].join('\n');
    expect(parseAdrWireSignals('0031-real-pass-promotion.md', withFalse).loadBearing).toBe(false);

    const withoutTag = ['---', 'status: accepted', 'amends: [12]', '---', '# ADR-0030'].join('\n');
    expect(parseAdrWireSignals('0030-all-in-on-claude-agent-sdk.md', withoutTag).loadBearing).toBe(false);
  });

  it('laws-outbound-edges-union-supersedes-amends: unions supersedes / supersedes_in_part / amends into deduped ADR numbers', () => {
    const raw = [
      '---',
      'status: accepted',
      'supersedes: [14, 6]',
      'supersedes_in_part: [6, 9]',
      'amends: [40, 41, 33]',
      '---',
      '# ADR-0045',
    ].join('\n');
    const result = parseAdrWireSignals('0045-live-activity-layer-is-verdict-blooms.md', raw);
    expect(result.loadBearing).toBe(false);
    expect(result.edges.sort((a, b) => a - b)).toEqual([6, 9, 14, 33, 40, 41]);
  });

  it('laws-edges-empty-when-no-lineage-fields: an ADR with none of the three lineage fields yields an empty edge set', () => {
    const raw = ['---', 'status: accepted', 'load_bearing: true', '---', '# ADR-0002'].join('\n');
    expect(parseAdrWireSignals('0002-work-hierarchy-story-capability-contract.md', raw)).toEqual({
      loadBearing: true,
      edges: [],
    });
  });

  it('laws-tolerant-empty-on-non-adr-or-malformed: non-ADR filename, missing block, unterminated block, absent fields all yield the safe empty result', () => {
    const empty = { loadBearing: false, edges: [] };
    expect(parseAdrWireSignals('open-questions.md', '# Open questions\n\nNo frontmatter here.')).toEqual(empty);
    expect(parseAdrWireSignals('0001-x.md', '# ADR with no frontmatter block at all')).toEqual(empty);
    expect(parseAdrWireSignals('0001-x.md', '---\nstatus: accepted\nload_bearing: true')).toEqual(empty); // unterminated
    expect(parseAdrWireSignals('0001-x.md', '---\nstatus: accepted\n---\n# ADR-0001')).toEqual(empty); // absent fields
    expect(() => parseAdrWireSignals('', '')).not.toThrow();
  });
});
