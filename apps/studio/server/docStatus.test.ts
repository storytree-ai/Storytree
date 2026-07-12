// Unit + wiring test for the ADR frontmatter `status` surfaced on the Library/docs cards
// (ADR-0037 §1, the observability "catch" ADR-0084 relies on): the docs viewer STRIPS frontmatter
// before rendering prose, so the structured `status:` was lost — these tests pin the new parse
// (parseDocStatus) and prove listDocs wires it onto each Decisions DocMeta (and ONLY those).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseDocStatus, listDocs } from './apiRouter.js';

describe('parseDocStatus', () => {
  it('reads an ADR status + decided date from the leading frontmatter block', () => {
    const raw = ['---', 'status: accepted', 'decided: 2026-06-21', 'amends: [37]', '---', '# ADR-0084'].join('\n');
    expect(parseDocStatus('0084-agents-may-flip-an-adr-green.md', raw)).toEqual({
      status: 'accepted',
      decided: '2026-06-21',
    });
  });

  it('reads each lifecycle status (status alone, no decided)', () => {
    for (const status of ['proposed', 'accepted', 'superseded'] as const) {
      const raw = `---\nstatus: ${status}\n---\n# ADR`;
      expect(parseDocStatus('0001-x.md', raw)).toEqual({ status });
    }
  });

  it('is tolerant — null for a non-ADR filename, a missing block, or an unknown status', () => {
    expect(parseDocStatus('open-questions.md', '# Open questions\n\nNo frontmatter here.')).toBeNull();
    expect(parseDocStatus('0001-x.md', '# ADR with no frontmatter')).toBeNull();
    expect(parseDocStatus('0001-x.md', '---\nstatus: ratified\n---\n# ADR')).toBeNull(); // not a known status
    expect(parseDocStatus('0001-x.md', '---\nstatus: accepted')).toBeNull(); // unterminated block
  });
});

describe('listDocs surfaces ADR status onto DocMeta', () => {
  let docsDir: string;

  beforeAll(async () => {
    docsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-docs-'));
    await fs.mkdir(path.join(docsDir, 'decisions'));
    await fs.writeFile(
      path.join(docsDir, 'decisions', '0001-first.md'),
      '---\nstatus: proposed\ndecided: 2026-06-01\n---\n# ADR-0001: First\n\nA proposed decision.\n',
    );
    await fs.writeFile(
      path.join(docsDir, 'decisions', '0002-second.md'),
      '---\nstatus: accepted\n---\n# ADR-0002: Second\n\nAn accepted decision.\n',
    );
    // A reference doc (no frontmatter) — must NOT carry a status.
    await fs.writeFile(path.join(docsDir, 'open-questions.md'), '# Open questions\n\nDeferred decisions.\n');
  });

  afterAll(async () => {
    await fs.rm(docsDir, { recursive: true, force: true });
  });

  it('attaches status (+ decided) to Decisions docs and omits it on reference docs', async () => {
    const docs = await listDocs(docsDir);
    const byId = Object.fromEntries(docs.map((d) => [d.id, d]));

    expect(byId['decisions/0001-first.md']).toMatchObject({
      group: 'Decisions',
      status: 'proposed',
      decided: '2026-06-01',
    });
    expect(byId['decisions/0002-second.md']).toMatchObject({ group: 'Decisions', status: 'accepted' });
    expect(byId['decisions/0002-second.md']?.decided).toBeUndefined(); // no decided in frontmatter

    const reference = byId['open-questions.md'];
    expect(reference?.group).toBe('Reference');
    expect(reference?.status).toBeUndefined(); // reference docs carry no status chip
  });
});

// The library-adr-wire-signals fold (ADR-0187 dec 3): listDocs surfaces parseAdrWireSignals' signals
// onto Decisions DocMeta — `loadBearing` folded in directly, and the lineage-edge NUMBERS resolved to
// `doc:decisions/NNNN-slug.md` pointers against the walked corpus. Glue verification (advisory on
// check:coverage, which scans only the cap's real.testFile — check-coverage-scans-only-real-testfile).
describe('listDocs folds the ADR wire signals (load_bearing + resolved lineage edges) onto DocMeta', () => {
  let docsDir: string;

  beforeAll(async () => {
    docsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-wire-'));
    await fs.mkdir(path.join(docsDir, 'decisions'));
    // A load-bearing ADR whose amends/supersedes edges point at the two ADRs below.
    await fs.writeFile(
      path.join(docsDir, 'decisions', '0187-permanent-lens.md'),
      '---\nstatus: accepted\nload_bearing: true\namends: [185]\nsupersedes: [10]\n---\n# ADR-0187: Permanent lens\n\nThe overlay is a permanent lens.\n',
    );
    await fs.writeFile(
      path.join(docsDir, 'decisions', '0185-tech-tree-overlay.md'),
      '---\nstatus: accepted\nload_bearing: true\n---\n# ADR-0185: Tech-tree overlay\n\nThe library as a tech-tree overlay.\n',
    );
    // A plain, non-load-bearing ADR with no lineage edges — neither field should appear.
    await fs.writeFile(
      path.join(docsDir, 'decisions', '0010-old-decision.md'),
      '---\nstatus: superseded\n---\n# ADR-0010: Old decision\n\nAn early decision.\n',
    );
    // A reference doc — never carries wire signals.
    await fs.writeFile(path.join(docsDir, 'open-questions.md'), '# Open questions\n\nDeferred decisions.\n');
  });

  afterAll(async () => {
    await fs.rm(docsDir, { recursive: true, force: true });
  });

  it('sets loadBearing and resolves edge numbers to doc: pointers on the load-bearing ADR', async () => {
    const byId = Object.fromEntries((await listDocs(docsDir)).map((d) => [d.id, d]));

    const adr187 = byId['decisions/0187-permanent-lens.md'];
    expect(adr187?.loadBearing).toBe(true);
    // 185 and 10 both name ADRs on disk → both resolve to doc: pointers (deduped union of amends+supersedes).
    expect(new Set(adr187?.references)).toEqual(
      new Set(['doc:decisions/0185-tech-tree-overlay.md', 'doc:decisions/0010-old-decision.md']),
    );
  });

  it('omits references on an ADR with no lineage edges, and omits both signals on non-load-bearing / reference docs', async () => {
    const byId = Object.fromEntries((await listDocs(docsDir)).map((d) => [d.id, d]));

    const adr185 = byId['decisions/0185-tech-tree-overlay.md'];
    expect(adr185?.loadBearing).toBe(true);
    expect(adr185?.references).toBeUndefined(); // no lineage fields → no references key at all

    const adr10 = byId['decisions/0010-old-decision.md'];
    expect(adr10?.loadBearing).toBeUndefined(); // not load-bearing → key absent (not `false`)
    expect(adr10?.references).toBeUndefined();

    const reference = byId['open-questions.md'];
    expect(reference?.loadBearing).toBeUndefined();
    expect(reference?.references).toBeUndefined();
  });
});
