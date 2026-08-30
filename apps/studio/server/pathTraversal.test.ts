// Path-traversal guard for the studio's filesystem readers. Two entry points resolve a caller-
// supplied id under a repo root: the docs reader (safeDocPath) and the story-UAT reader
// (uatContextForStory, reached by GET /api/attestations?storyId=…, member-readable). Both now share
// ONE containment rule (containedPath) — path.join / path.resolve collapse `..`, so an unchecked
// `../../…` storyId would climb out of <repo>/stories into a filesystem existence oracle + limited
// structured (UAT) disclosure. These tests pin the shared guard and prove the story reader refuses a
// traversal id even when a real story.md exists at the escaped location.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { criterionRevisionId } from '@storytree/proof-protocol';
import { canonicalUatCriterionContent } from '@storytree/library';

import { containedPath, safeDocPath, uatContextForStory } from './apiRouter.js';

const PROSE = '**See it work** _(witness: human)_: the operator sees it. **Success —** seen.';
const CRITERION_ID = 'uatc_000000000000000000000001';
const REVISION_ID = criterionRevisionId(canonicalUatCriterionContent(`1. ${PROSE}`));

const STORY_MD = `---
id: "demo-story"
tier: story
title: "Demo story"
outcome: "A demo outcome."
status: proposed
proof_mode: UAT
---

# Demo story

## Story UAT

1. ${PROSE} (criterion-id: ${CRITERION_ID})(revision-id: ${REVISION_ID})
`;

describe('containedPath (the shared traversal guard)', () => {
  const base = path.resolve(os.tmpdir(), 'studio-contained-base');

  it('resolves a normal child id to a path under the base', () => {
    expect(containedPath(base, 'demo-story')).toBe(path.resolve(base, 'demo-story'));
    expect(containedPath(base, 'a/b')).toBe(path.resolve(base, 'a/b'));
  });

  it('rejects a `..` id that climbs out of the base', () => {
    expect(containedPath(base, '..')).toBeNull();
    expect(containedPath(base, '../secret')).toBeNull();
    expect(containedPath(base, '../../../../etc/passwd')).toBeNull();
  });

  // NAMED for the absolute case, PROVED by the `..` arm — and that is not a defect in this
  // assertion, it is a fact about the rule on this platform. `path.relative(base, <absolute id on
  // the same root>)` returns a `..`-prefixed relpath, so the FIRST arm answers and
  // `path.isAbsolute(rel)` is never consulted. Measured 2026-08-30: deleting `path.isAbsolute(rel)`
  // from `containedPath` leaves the whole studio suite green, and deleting `rel.startsWith('..')`
  // reds it — so this test does real work, just not the work its old name advertised.
  it('rejects an absolute id pointing outside the base (answered by the `..` arm)', () => {
    const outside = path.resolve(base, '..', 'sibling-secret');
    expect(containedPath(base, outside)).toBeNull();
    expect(path.relative(base, outside).startsWith('..')).toBe(true);
  });

  // The SECOND arm, driven through containedPath ITSELF on the injected win32 flavour — not by
  // asserting `path.win32.isAbsolute` directly, which would restate Node's behaviour and survive
  // the deletion of the arm it claims to pin. On posix there is one filesystem root, so an escape
  // is always expressible as `..`-prefixed and this arm is unreachable; on win32 a cross-drive or
  // UNC id resolves to an ABSOLUTE relpath that does not start with `..`, so this arm is the only
  // refusal. The desktop backend reproduces this rule and ships on Windows, so it is live code
  // there even though it is dead on the hosted Linux studio.
  it('the `isAbsolute` arm refuses a cross-root id (win32: another drive, a UNC share)', () => {
    const winBase = String.raw`C:\repo\docs`;
    for (const id of [String.raw`D:\secret.md`, String.raw`\\server\share\secret.md`]) {
      // The first arm provably does NOT answer here — so a green assertion below is this arm's.
      const rel = path.win32.relative(winBase, path.win32.resolve(winBase, id));
      expect(rel.startsWith('..'), `${id}: the \`..\` arm must NOT be what catches this`).toBe(false);
      expect(containedPath(winBase, id, path.win32), `${id} must be refused`).toBeNull();
    }
  });

  it('accepts a contained id under the injected win32 flavour (positive control for the arm above)', () => {
    const winBase = String.raw`C:\repo\docs`;
    expect(containedPath(winBase, 'research/notes.md', path.win32)).toBe(
      path.win32.resolve(winBase, 'research/notes.md'),
    );
  });
});

// The `.md` refusal is safeDocPath's OWN contribution — containedPath does not make it — so the
// containment tests above cannot prove it. Until 2026-08-30 nothing did: deleting
// `!resolved.endsWith('.md')` left the whole studio suite green. `docs/` really does hold non-md
// files (.json, .html, .png), so this is a reachable widening, not a hypothetical one.
describe('safeDocPath refuses a contained NON-markdown target', () => {
  const docsDir = path.resolve(os.tmpdir(), 'studio-safe-doc-base');

  it('accepts a contained .md id', () => {
    expect(safeDocPath(docsDir, 'research/notes.md')).toBe(path.resolve(docsDir, 'research/notes.md'));
  });

  it('refuses a contained id that is not .md, however ordinary it looks', () => {
    for (const id of ['research/agent-artifacts-draft.json', 'design/mockup.html', 'design/shot.png', 'README']) {
      expect(safeDocPath(docsDir, id), id).toBeNull();
    }
  });

  it('refuses a traversal id even when it ends in .md', () => {
    expect(safeDocPath(docsDir, '../../secret.md')).toBeNull();
  });
});

describe('uatContextForStory refuses a traversal storyId', () => {
  let tmp: string;
  let storiesDir: string;

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-traversal-'));
    storiesDir = path.join(tmp, 'stories');
    await fs.mkdir(path.join(storiesDir, 'demo-story'), { recursive: true });
    await fs.writeFile(path.join(storiesDir, 'demo-story', 'story.md'), STORY_MD);
    // A real story.md OUTSIDE the stories root — a successful traversal would read THIS one.
    await fs.mkdir(path.join(tmp, 'outside'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'outside', 'story.md'), STORY_MD);
  });

  afterAll(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('reads a valid in-base story (positive control)', async () => {
    const ctx = await uatContextForStory(storiesDir, 'demo-story');
    expect(ctx).not.toBeNull();
    expect(ctx?.tests.map((t) => t.criterionId)).toHaveLength(1);
  });

  it('returns null for a `../` storyId even though a story.md exists at the escaped path', async () => {
    // Without the guard, path.join(storiesDir, '../outside', 'story.md') resolves to tmp/outside/story.md
    // and would disclose its parsed UAT fields. The containment guard makes it a plain "missing story".
    expect(await uatContextForStory(storiesDir, '../outside')).toBeNull();
    expect(await uatContextForStory(storiesDir, '../../../../etc')).toBeNull();
  });
});
