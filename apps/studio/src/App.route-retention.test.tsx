// @vitest-environment jsdom
//
// App owns the route lifetime of the forest. TreeView itself is deliberately a compact stateful
// probe here: its own renderer/controller has focused coverage, while this suite proves the
// App-level mount, park, and restore composition around it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const treeProbe = vi.hoisted(() => ({
  mounts: 0,
  unmounts: 0,
  nextWorld: 1,
  focuses: [] as Array<string | null>,
  activeStates: [] as boolean[],
  load: vi.fn<() => Promise<unknown>>(),
}));

vi.mock('./api', () => ({
  api: {
    me: vi.fn(),
    listDocs: vi.fn(),
    listAssets: vi.fn(),
    listComments: vi.fn(),
    tree: vi.fn(),
  },
}));
vi.mock('./lib/devStoreOverride', () => ({ useDevStoreOverride: () => null }));
vi.mock('./lib/desktopAuth', () => ({ getDesktopAuth: () => undefined }));
vi.mock('./lib/poll', () => ({ notifyStoreRecovered: vi.fn() }));
vi.mock('./components/StoreBanner', () => ({ StoreBanner: () => null }));
vi.mock('./components/Hud', () => ({ Hud: () => null }));
vi.mock('./components/Sidebar', () => ({ Sidebar: () => <aside data-testid="sidebar" /> }));
vi.mock('./components/DocView', () => ({ DocView: ({ id }: { id: string }) => <section data-testid="doc-surface">{id}</section> }));
vi.mock('./components/AssetView', () => ({ AssetView: () => <section data-testid="asset-surface" /> }));
vi.mock('./components/AssetEditor', () => ({ AssetEditor: () => <section data-testid="asset-editor-surface" /> }));
vi.mock('./components/MembersPanel', () => ({
  MembersPanel: () => (
    <section data-testid="members-surface">
      <button type="button">manage members</button>
    </section>
  ),
}));
vi.mock('./components/TreeView', async () => {
  const React = await import('react');
  return {
    TreeView: ({ focus, active = true }: { focus: string | null; active?: boolean }) => {
      const [camera, setCamera] = React.useState(0);
      const worldId = React.useRef('');
      if (!worldId.current) worldId.current = `world-${treeProbe.nextWorld++}`;
      treeProbe.focuses.push(focus);
      treeProbe.activeStates.push(active);
      React.useEffect(() => {
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
    },
  };
});

import { api } from './api';
import { App } from './App';

const MEMBER = { email: 'operator@example.com', role: 'admin', status: 'active', member: true } as const;

function navigate(hash: string): void {
  act(() => {
    window.history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

async function renderReadyApp(): Promise<void> {
  render(<App />);
  await screen.findByTestId(/members-surface|retained-tree-view|doc-surface/);
}

async function enterTree(hash = '#/tree'): Promise<HTMLElement> {
  navigate(hash);
  const tree = await screen.findByTestId('retained-tree-view');
  await waitFor(() => expect(vi.mocked(api.tree)).toHaveBeenCalledTimes(1));
  return tree;
}

beforeEach(() => {
  window.history.replaceState(null, '', '#/members');
  treeProbe.mounts = 0;
  treeProbe.unmounts = 0;
  treeProbe.nextWorld = 1;
  treeProbe.focuses = [];
  treeProbe.activeStates = [];
  treeProbe.load.mockReset();
  vi.mocked(api.me).mockResolvedValue(MEMBER);
  vi.mocked(api.listDocs).mockResolvedValue([]);
  vi.mocked(api.listAssets).mockResolvedValue([]);
  vi.mocked(api.listComments).mockResolvedValue([]);
  vi.mocked(api.tree).mockResolvedValue({ stories: [], builds: [], claims: [] });
  treeProbe.load.mockImplementation(() => api.tree());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '#/');
});

describe('App forest route retention', () => {
  it('map-route-retention-stays-lazy-for-hash-deep-links', async () => {
    await renderReadyApp();

    expect(screen.getByTestId('members-surface').isConnected).toBe(true);
    expect(screen.queryByTestId('retained-tree-view')).toBeNull();
    expect(treeProbe.mounts).toBe(0);
    expect(api.tree).not.toHaveBeenCalled();

    const tree = await enterTree('#/tree/focused-story');
    expect(treeProbe.mounts).toBe(1);
    expect(tree.getAttribute('data-focus')).toBe('focused-story');
  });

  it('map-route-retention-keeps-one-live-tree-instance', async () => {
    window.history.replaceState(null, '', '#/tree/first-story');
    await renderReadyApp();
    const originalTree = screen.getByTestId('retained-tree-view');
    const originalWrapper = screen.getByTestId('tree-route');
    await waitFor(() => expect(api.tree).toHaveBeenCalledTimes(1));

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
    expect(api.tree).toHaveBeenCalledTimes(1);
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
    await waitFor(() => expect(api.tree).toHaveBeenCalledTimes(1));
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
    await waitFor(() => expect(api.tree).toHaveBeenCalledTimes(1));

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
