// @vitest-environment jsdom
//
// The real map wiring is deliberately exercised here: a fake rAF lets the test prove that a burst
// of pointermoves has one camera commit, while pointer-up flushes its trailing movement and cancel /
// unmount discard it. Heavy non-map overlays are mocked so this stays a focused interaction test.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useState } from 'react';
import { AppDataContext, type AppData } from '../lib/appData';
import type { TreeStory } from '../types';

vi.mock('../api', () => ({ api: { tree: vi.fn(), activity: vi.fn() } }));
vi.mock('../lib/buildActivity', () => ({
  useBuildActivity: () => [],
  useClaimActivity: () => ({ claims: [], departures: [] }),
}));
vi.mock('../lib/poll', () => ({ useNowTick: () => new Date('2026-07-27T00:00:00.000Z') }));
vi.mock('../lib/sessionClaims', () => ({ useSessionClaimGroups: () => [] }));
vi.mock('@storytree/app-surface', () => ({
  arrivalGrowPlan: () => null,
  neighbourHighlightPlan: () => null,
  laneLayout: () => null,
  normalizeWorldPresentationModel: () => ({}),
  WorldSceneView: ({ events }: { events: { onSelectStory: (id: string) => void } }) => (
    <g data-testid="scene-story" data-story-id="map" onClick={() => events.onSelectStory('map')} />
  ),
}));
vi.mock('./WorldLegend.js', () => ({
  WorldLegend: () => null,
  LegendDrawerBody: () => null,
  legendRowLabel: () => '',
  legendModelFor: () => [],
}));
vi.mock('./WorldSettingsPanel.js', () => ({ WorldSettingsPanel: () => null }));
vi.mock('./LibraryDrawer.js', () => ({ LibraryDrawer: () => null }));
vi.mock('./TerminalRepoGate.js', () => ({ TerminalRepoGate: () => null }));
vi.mock('./RepoPicker.js', () => ({ RepoPicker: () => null }));

import { api } from '../api';
import { StudioWorldChrome, TreeView, type HexWorld } from './TreeView';

const STORY: TreeStory = {
  id: 'map',
  title: 'Map responsiveness',
  outcome: 'The forest remains responsive while panning.',
  status: 'proposed',
  proofMode: 'test',
  uatWitness: 'machine',
  dependsOn: [],
  consumedBy: [],
  capabilities: [],
};

const APP_DATA: AppData = {
  docs: [],
  docIds: new Set(),
  docTitles: new Map(),
  assets: [],
  assetsStatus: 'ready',
  assetsError: '',
  me: { email: 'owner@example.com', role: 'admin', status: 'active', member: true },
  refreshAssets: async () => {},
};

interface FakeFrames {
  request: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  run(frame: number): void;
}

let restorePointerEvent: (() => void) | undefined;

function installFakeFrames(): FakeFrames {
  let nextFrame = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const request = vi.fn((callback: FrameRequestCallback): number => {
    const frame = nextFrame++;
    callbacks.set(frame, callback);
    return frame;
  });
  // Intentionally retain callbacks after cancellation: this lets each test prove a late callback
  // cannot consume a newer delta or set camera state after cancellation.
  const cancel = vi.fn((_frame: number): void => {});
  vi.stubGlobal('requestAnimationFrame', request);
  vi.stubGlobal('cancelAnimationFrame', cancel);
  // jsdom has no PointerEvent constructor. Testing Library then falls back to a bare Event, which
  // drops `button`/coordinates and correctly leaves TreeView's real left-button drag guard inert.
  // Give this integration test a minimal MouseEvent-backed pointer constructor instead.
  const previous = Object.getOwnPropertyDescriptor(window, 'PointerEvent');
  class PointerEventShim extends window.MouseEvent {
    readonly pointerId: number;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  Object.defineProperty(window, 'PointerEvent', { configurable: true, value: PointerEventShim });
  restorePointerEvent = () => {
    if (previous) Object.defineProperty(window, 'PointerEvent', previous);
    else delete (window as { PointerEvent?: unknown }).PointerEvent;
  };
  return {
    request,
    cancel,
    run(frame): void {
      const callback = callbacks.get(frame);
      if (!callback) throw new Error(`missing frame ${frame}`);
      act(() => callback(0));
    },
  };
}

function cameraValues(camera: Element): { tx: number; ty: number; scale: number } {
  const transform = camera.getAttribute('transform');
  const match = transform?.match(/^translate\(([^ ]+) ([^)]+)\) scale\(([^)]+)\)$/);
  if (!match) throw new Error(`unexpected camera transform: ${transform}`);
  return { tx: Number(match[1]), ty: Number(match[2]), scale: Number(match[3]) };
}

async function mountMap(): Promise<{ viewport: HTMLElement; camera: Element; unmount: () => void }> {
  const rendered = render(
    <AppDataContext.Provider value={APP_DATA}>
      <TreeView focus={null} />
    </AppDataContext.Provider>,
  );
  const viewport = await screen.findByLabelText('story forest map (pan and zoom)');
  const camera = await waitFor(() => {
    const element = rendered.container.querySelector('.world-camera');
    expect(element?.getAttribute('transform')).toBeTruthy();
    return element!;
  });
  return { viewport, camera, unmount: rendered.unmount };
}

function dragPastSlop(viewport: HTMLElement): void {
  fireEvent.pointerDown(viewport, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
  // Jitter remains a click, and becomes the drag's incremental anchor once it crosses the threshold.
  fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 106, clientY: 104 });
  fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 120, clientY: 115 }); // +14, +11
  fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 132, clientY: 126 }); // +12, +11
}

beforeEach(() => {
  // Keep the mount offline: vector art has no sprite-sheet manifest fetch in jsdom.
  window.history.replaceState(null, '', '/?artStyle=vector');
  vi.mocked(api.tree).mockResolvedValue({ stories: [STORY], builds: [], claims: [] });
});

afterEach(() => {
  cleanup();
  restorePointerEvent?.();
  restorePointerEvent = undefined;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function chromeProbeWorld(): HexWorld {
  return {
    width: 200,
    height: 200,
    offset: { x: 0, y: 0 },
    empties: [],
    drawTiles: [],
    trails: { segments: [], edges: [], caves: [], dropped: [] },
    solar: {
      center: { x: 100, y: 100 },
      rings: [],
      spokes: [{ from: 'studio', to: 'library', d: 'M 0 0 L 10 10' }],
    },
    territories: [
      {
        story: { id: 'studio', title: 'Studio', status: 'healthy', capabilities: [] },
        tiles: [],
        centroid: { x: 50, y: 50 },
        radius: 30,
        treeSpot: { x: 50, y: 45 },
        caps: [],
        decor: [],
        wheatTiles: new Set<string>(),
        coastPaths: [],
        coastLoops: [],
        labelY: 80,
        stamps: [{ icon: 'library', spot: { x: 50, y: 50 } }],
        buildingGlyph: false,
      },
    ],
  } as unknown as HexWorld;
}

function CameraChromeProbe({
  world,
  hidden,
  onStampClick,
}: {
  world: HexWorld;
  hidden: ReadonlySet<string>;
  onStampClick: (id: string) => void;
}) {
  const [cameraX, setCameraX] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setCameraX((x) => x + 26)}>
        advance camera
      </button>
      <svg>
        <g data-testid="chrome-camera" transform={`translate(${cameraX} 0)`}>
          <StudioWorldChrome world={world} hidden={hidden} onStampClick={onStampClick} buildings />
        </g>
      </svg>
    </>
  );
}

describe('TreeView drag pan', () => {
  it('pan-frame-coalesces-pointer-bursts: schedules exactly one camera frame for a pre-frame move burst', async () => {
    const frames = installFakeFrames();
    const { viewport, camera } = await mountMap();
    const before = cameraValues(camera);
    expect(window.requestAnimationFrame).toBe(frames.request);

    dragPastSlop(viewport);

    expect(frames.request).toHaveBeenCalledTimes(1);
    expect(cameraValues(camera)).toEqual(before); // no camera state update for each raw pointermove
  });

  it('pan-frame-commits-the-latest-cumulative-delta: lands the total and independently coalesces a later burst', async () => {
    const frames = installFakeFrames();
    const { viewport, camera } = await mountMap();
    const before = cameraValues(camera);

    dragPastSlop(viewport);
    frames.run(1);
    expect(cameraValues(camera)).toEqual({ tx: before.tx + 26, ty: before.ty + 22, scale: before.scale });

    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 140, clientY: 130 }); // +8, +4
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 154, clientY: 143 }); // +14, +13
    expect(frames.request).toHaveBeenCalledTimes(2);
    frames.run(2);

    expect(cameraValues(camera)).toEqual({ tx: before.tx + 48, ty: before.ty + 39, scale: before.scale });
  });

  it('pan-frame-settles-or-cancels-pending-work-safely: pointer-up flushes, cancel suppresses its synthetic click, and unmount drops work', async () => {
    const frames = installFakeFrames();
    const { viewport, camera, unmount } = await mountMap();
    const before = cameraValues(camera);

    dragPastSlop(viewport);
    fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 132, clientY: 126 });
    expect(frames.cancel).toHaveBeenNthCalledWith(1, 1);
    expect(cameraValues(camera)).toEqual({ tx: before.tx + 26, ty: before.ty + 22, scale: before.scale });
    frames.run(1);
    expect(cameraValues(camera)).toEqual({ tx: before.tx + 26, ty: before.ty + 22, scale: before.scale });

    dragPastSlop(viewport);
    fireEvent.pointerCancel(viewport, { pointerId: 1, clientX: 132, clientY: 126 });
    expect(frames.cancel).toHaveBeenNthCalledWith(2, 2);
    expect(cameraValues(camera)).toEqual({ tx: before.tx + 26, ty: before.ty + 22, scale: before.scale });

    // A cancellation's same-gesture click remains swallowed, but the next genuine pointerdown clears
    // that suppression and its story click navigates normally.
    fireEvent.click(screen.getByTestId('scene-story'));
    expect(window.location.hash).toBe('');
    fireEvent.pointerDown(viewport, { button: 0, pointerId: 3, clientX: 100, clientY: 100 });
    fireEvent.click(screen.getByTestId('scene-story'));
    expect(window.location.hash).toBe('#/tree/map');

    // A browser can deliver a cancelled callback late. Start the next drag first: the old frame must
    // not consume the new gesture's delta or clear its live frame handle.
    dragPastSlop(viewport);
    expect(frames.request).toHaveBeenCalledTimes(3);
    frames.run(2);
    expect(cameraValues(camera)).toEqual({ tx: before.tx + 26, ty: before.ty + 22, scale: before.scale });
    frames.run(3);
    expect(cameraValues(camera)).toEqual({ tx: before.tx + 52, ty: before.ty + 44, scale: before.scale });
    fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 132, clientY: 126 });

    fireEvent.pointerDown(viewport, { button: 0, pointerId: 4, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(viewport, { pointerId: 4, clientX: 120, clientY: 100 });
    unmount();
    expect(frames.cancel).toHaveBeenNthCalledWith(3, 4);
    expect(() => frames.run(4)).not.toThrow();
  });

  it('pan-frame-skips-camera-neutral-studio-chrome: a parent camera transform changes without re-running chrome', () => {
    const world = chromeProbeWorld();
    const territories = world.territories;
    const territoryReads = vi.fn(() => territories);
    Object.defineProperty(world, 'territories', { configurable: true, get: territoryReads });
    const hidden = new Set<string>();
    const onStampClick = vi.fn();

    const { container } = render(
      <CameraChromeProbe world={world} hidden={hidden} onStampClick={onStampClick} />,
    );
    const chrome = container.querySelector('.studio-world-chrome');
    const chromeAtFirstPaint = chrome?.innerHTML;
    const readsAtFirstPaint = territoryReads.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'advance camera' }));

    expect(screen.getByTestId('chrome-camera').getAttribute('transform')).toBe('translate(26 0)');
    expect(territoryReads).toHaveBeenCalledTimes(readsAtFirstPaint);
    expect(container.querySelector('.studio-world-chrome')?.innerHTML).toBe(chromeAtFirstPaint);

    // The standalone memo probe above establishes React's runtime boundary. Keep its actual TreeView
    // caller honest too: a fresh inline callback here would defeat that boundary on every camera pan.
    const source = readFileSync(resolve(process.cwd(), 'src', 'components', 'TreeView.tsx'), 'utf8');
    expect(source).toMatch(/export const StudioWorldChrome = memo\(/);
    expect(source).toMatch(/const onStampClickStable = useCallback/);
    expect(source).toMatch(/<StudioWorldChrome[\s\S]*?onStampClick=\{onStampClickStable\}/);
  });
});
