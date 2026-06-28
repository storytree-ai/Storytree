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
