// @vitest-environment jsdom
//
// App owns the route lifetime of the forest. TreeView itself is deliberately a compact stateful
// probe here: its own renderer/controller has focused coverage, while this suite proves the
// App-level mount, park, and restore composition around it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { useEffect, useRef, useState } from 'react';

import { api } from './api';
import { App, type AppSurfaces } from './App';
import { HttpDouble, installHttpDouble } from './test/httpDouble';

// THE SURFACES ARE HANDED IN, NOT MOCKED OVER (anti-slop-adoption-arc inc-06, `no-module-mocking`).
// What this file is about is the SHELL's route lifetime — one live tree instance, parked rather
// than unmounted, reactivated in place. Proving that needs a child whose mounts and unmounts are
// COUNTABLE, and the real `TreeView` cannot render here at all (it wants WebGL). So the probe
// stays; it now arrives through `App`'s own `surfaces` slot, whose defaults are the real
// components. The TRANSPORT is doubled too, so the real api client builds the reads below.
const TREE = '/api/tree';

let http: HttpDouble;

const treeProbe = {
  mounts: 0,
  unmounts: 0,
  nextWorld: 1,
  focuses: [] as Array<string | null>,
  activeStates: [] as boolean[],
  /** The map's own read — the REAL client, so this hits `GET /api/tree` like the shipped one. */
  load: (): Promise<unknown> => api.tree(),
};

function TreeProbe({
  focus,
  active = true,
}: {
  focus: string | null;
  active?: boolean;
}): React.JSX.Element {
  const [camera, setCamera] = useState(0);
  const worldId = useRef('');
  if (!worldId.current) worldId.current = `world-${treeProbe.nextWorld++}`;
  treeProbe.focuses.push(focus);
  treeProbe.activeStates.push(active);
  useEffect(() => {
    treeProbe.mounts += 1;
    void treeProbe.load();
    return () => {
      treeProbe.unmounts += 1;
    };
  }, []);

  return (
    <section
      className="tree-wrap"
      data-testid="retained-tree-view"
      data-world-id={worldId.current}
      data-camera={camera}
      data-focus={focus ?? ''}
      data-active={active}
    >
      <button type="button" onClick={() => setCamera((value) => value + 1)}>
        move forest camera
      </button>
      <output data-testid="retained-terminal">session-1: retained scrollback</output>
    </section>
  );
}

const SURFACES: AppSurfaces = {
  StoreBanner: () => null,
  Hud: () => null,
  Sidebar: () => <aside data-testid="sidebar" />,
  DocView: ({ id }) => <section data-testid="doc-surface">{id}</section>,
  AssetView: () => <section data-testid="asset-surface" />,
  AssetEditor: () => <section data-testid="asset-editor-surface" />,
  MembersPanel: () => (
    <section data-testid="members-surface">
      <button type="button">manage members</button>
    </section>
  ),
  TreeView: TreeProbe,
};

/** How many times the map's read actually reached the wire. */
const treeReads = (): number => http.countTo(TREE);

const MEMBER = { email: 'operator@example.com', role: 'admin', status: 'active', member: true } as const;

function navigate(hash: string): void {
  act(() => {
    window.history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

async function renderReadyApp(): Promise<void> {
  render(<App surfaces={SURFACES} />);
  await screen.findByTestId(/members-surface|retained-tree-view|doc-surface/);
}

async function enterTree(hash = '#/tree'): Promise<HTMLElement> {
  navigate(hash);
  const tree = await screen.findByTestId('retained-tree-view');
  await waitFor(() => expect(treeReads()).toBe(1));
  return tree;
}

beforeEach(() => {
  window.history.replaceState(null, '', '#/members');
  treeProbe.mounts = 0;
  treeProbe.unmounts = 0;
  treeProbe.nextWorld = 1;
  treeProbe.focuses = [];
  treeProbe.activeStates = [];
  http = installHttpDouble();
  http.get('/api/me', () => MEMBER);
  http.get('/api/docs', () => []);
  http.get('/api/assets', () => []);
  http.get('/api/comments', () => []);
  http.get(TREE, () => ({ stories: [], builds: [], claims: [] }));
});

afterEach(() => {
  cleanup();
  http.uninstall();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '#/');
});

describe('App forest route retention', () => {
  it('map-route-retention-stays-lazy-for-hash-deep-links', async () => {
    await renderReadyApp();

    expect(screen.getByTestId('members-surface').isConnected).toBe(true);
    expect(screen.queryByTestId('retained-tree-view')).toBeNull();
    expect(treeProbe.mounts).toBe(0);
    expect(treeReads()).toBe(0);

    const tree = await enterTree('#/tree/focused-story');
    expect(treeProbe.mounts).toBe(1);
    expect(tree.getAttribute('data-focus')).toBe('focused-story');
  });

  it('map-route-retention-keeps-one-live-tree-instance', async () => {
    window.history.replaceState(null, '', '#/tree/first-story');
    await renderReadyApp();
    const originalTree = screen.getByTestId('retained-tree-view');
    const originalWrapper = screen.getByTestId('tree-route');
    await waitFor(() => expect(treeReads()).toBe(1));

    navigate('#/members');
    await screen.findByTestId('members-surface');
    expect(originalTree.isConnected).toBe(true);
    expect(originalWrapper.getAttribute('data-parked')).toBe('true');

    navigate('#/tree/second-story');
    await waitFor(() => expect(originalWrapper.hasAttribute('data-parked')).toBe(false));
    expect(screen.getByTestId('retained-tree-view')).toBe(originalTree);
    expect(screen.getByTestId('tree-route')).toBe(originalWrapper);
    expect(treeProbe.mounts).toBe(1);
    expect(treeProbe.unmounts).toBe(0);
    expect(treeReads()).toBe(1);
  });

  it('map-route-retention-tells-the-live-tree-when-it-is-parked and active again', async () => {
    window.history.replaceState(null, '', '#/tree');
    await renderReadyApp();
    const tree = screen.getByTestId('retained-tree-view');
    expect(tree.getAttribute('data-active')).toBe('true');

    navigate('#/members');
    await screen.findByTestId('members-surface');
    expect(tree.getAttribute('data-active')).toBe('false');

    navigate('#/tree');
    await waitFor(() => expect(tree.getAttribute('data-active')).toBe('true'));
    expect(screen.getByTestId('retained-tree-view')).toBe(tree);
    expect(treeProbe.activeStates).toEqual(expect.arrayContaining([true, false]));
  });

  it('map-route-retention-restores-live-world-and-terminal-state', async () => {
    window.history.replaceState(null, '', '#/tree');
    await renderReadyApp();
    const tree = screen.getByTestId('retained-tree-view');
    await waitFor(() => expect(treeReads()).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: 'move forest camera' }));
    expect(tree.getAttribute('data-camera')).toBe('1');
    const terminal = screen.getByTestId('retained-terminal');

    navigate('#/doc/decisions%2F0240');
    await screen.findByTestId('doc-surface');
    navigate('#/tree');
    await waitFor(() => expect(screen.getByTestId('tree-route').hasAttribute('data-parked')).toBe(false));

    expect(screen.getByTestId('retained-tree-view')).toBe(tree);
    expect(tree.getAttribute('data-camera')).toBe('1');
    expect(screen.getByTestId('retained-terminal')).toBe(terminal);
    expect(terminal.textContent).toContain('session-1: retained scrollback');
  });

  it('map-route-retention-parks-the-map-outside-input-and-a11y', async () => {
    window.history.replaceState(null, '', '#/tree');
    await renderReadyApp();
    const tree = screen.getByTestId('retained-tree-view');
    const wrapper = screen.getByTestId('tree-route');
    await waitFor(() => expect(treeReads()).toBe(1));

    navigate('#/members');
    const members = await screen.findByTestId('members-surface');

    expect(tree.isConnected).toBe(true);
    expect(wrapper.getAttribute('data-parked')).toBe('true');
    expect(wrapper.getAttribute('aria-hidden')).toBe('true');
    expect(wrapper.hasAttribute('inert')).toBe(true);
    expect(tree.getAttribute('data-focus')).toBe('');
    expect(treeProbe.focuses[treeProbe.focuses.length - 1]).toBeNull();
    expect(members.hidden).toBe(false);
    expect(screen.getByRole('button', { name: 'manage members' }).isConnected).toBe(true);
  });

  it('map-route-retention-parking-preserves-live-geometry', async () => {
    await renderReadyApp();
    await enterTree('#/tree');
    const wrapper = screen.getByTestId('tree-route');

    // jsdom does not resolve Vite's stylesheet, so bind the dimension-stable layer guarantee to the
    // actual rules. The Electron companion compares the real terminal body bounds before/while parked.
    const css = readFileSync(resolve(process.cwd(), 'src', 'index.css'), 'utf8');
    expect(css).toMatch(/\.app-stage\s*\{[\s\S]*?position:\s*relative;[\s\S]*?flex:\s*1\s+1\s+auto;/);
    expect(css).toMatch(/\.tree-route\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0;[\s\S]*?display:\s*flex;/);
    expect(css).toMatch(/\.tree-route\[data-parked='true'\]\s*\{[\s\S]*?visibility:\s*hidden;[\s\S]*?pointer-events:\s*none;/);

    navigate('#/members');
    await screen.findByTestId('members-surface');
    expect(wrapper.getAttribute('data-parked')).toBe('true');
    expect(wrapper.hasAttribute('hidden')).toBe(false);
  });

  it('map-route-retention-reactivates-the-full-bleed-world', async () => {
    await renderReadyApp();
    const tree = await enterTree('#/tree/focused-story');
    const wrapper = screen.getByTestId('tree-route');
    const body = tree.closest('.body');

    expect(body?.classList.contains('body-full')).toBe(true);
    expect(wrapper.hasAttribute('data-parked')).toBe(false);
    expect(wrapper.getAttribute('aria-hidden')).toBe('false');
    expect(wrapper.hasAttribute('inert')).toBe(false);
    expect(tree.getAttribute('data-focus')).toBe('focused-story');

    navigate('#/members');
    await screen.findByTestId('members-surface');
    navigate('#/tree/focused-story');
    await waitFor(() => expect(wrapper.hasAttribute('data-parked')).toBe(false));
    expect(tree.closest('.body')?.classList.contains('body-full')).toBe(true);
    expect(screen.getByTestId('retained-tree-view')).toBe(tree);
  });
});
