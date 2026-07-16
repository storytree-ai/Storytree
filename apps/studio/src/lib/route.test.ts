import { describe, expect, it } from 'vitest';
import { parseRoute, libraryHref } from './route';

describe('library standalone page retirement', () => {
  it('lret-library-href-opens-lens: libraryHref() returns the lens href, not #/library', () => {
    const href = libraryHref();
    expect(href).toContain('overlay=library');
    expect(href).toContain('#/tree');
    expect(href).not.toBe('#/library');
    expect(href.startsWith('#/library')).toBe(false);
  });

  it('lret-library-route-retired: /library paths redirect to the tree route', () => {
    expect(parseRoute('#/library')).toEqual({ name: 'tree', focus: null });
    expect(parseRoute('#/library/planner')).toEqual({ name: 'tree', focus: null });
  });

  it('lret-other-routes-preserved: every other route still resolves to its current variant', () => {
    expect(parseRoute('#/')).toEqual({ name: 'tree', focus: null }); // home retired, ADR-0204
    expect(parseRoute('#/members')).toEqual({ name: 'members' });
    expect(parseRoute('#/tree')).toEqual({ name: 'tree', focus: null });
    expect(parseRoute('#/tree/some-story')).toEqual({ name: 'tree', focus: 'some-story' });
    expect(parseRoute('#/doc/some%2Fpath')).toEqual({ name: 'doc', id: 'some/path' });
    expect(parseRoute('#/asset/abc123')).toEqual({ name: 'asset', id: 'abc123' });
    expect(parseRoute('#/asset/abc123/edit')).toEqual({ name: 'asset-edit', id: 'abc123' });
    expect(parseRoute('#/asset/new')).toEqual({ name: 'asset-new' });
  });

  it('lret-no-library-variant: parseRoute never yields name === "library" for any /library input', () => {
    for (const hash of ['#/library', '#/library/', '#/library/adr']) {
      const route = parseRoute(hash);
      expect(route.name).not.toBe('library');
    }
  });
});
