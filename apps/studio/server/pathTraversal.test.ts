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

import { containedPath, uatContextForStory } from './apiRouter.js';

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

1. **See it work** _(witness: human)_: the operator sees it. **Success —** seen.
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

  it('rejects an absolute id (a sibling outside the base)', () => {
    const outside = path.resolve(base, '..', 'sibling-secret');
    expect(containedPath(base, outside)).toBeNull();
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
    expect(ctx?.tests.map((t) => t.id)).toContain('demo-story#uat-1');
  });

  it('returns null for a `../` storyId even though a story.md exists at the escaped path', async () => {
    // Without the guard, path.join(storiesDir, '../outside', 'story.md') resolves to tmp/outside/story.md
    // and would disclose its parsed UAT fields. The containment guard makes it a plain "missing story".
    expect(await uatContextForStory(storiesDir, '../outside')).toBeNull();
    expect(await uatContextForStory(storiesDir, '../../../../etc')).toBeNull();
  });
});
