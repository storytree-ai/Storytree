// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { AppDataContext, type AppData } from '../lib/appData';
import type { TreeStory } from '../types';

const act2Harness = vi.hoisted(() => ({
  reducedMotion: false,
  inputs: [] as Array<{ enabled: boolean }>,
  player: {
    plan: null,
    state: null,
    progress: 0,
    playing: true,
    regrowing: true,
    wave: 0,
    play: vi.fn(),
    pause: vi.fn(),
    replay: vi.fn(),
    back: vi.fn(),
    settle: vi.fn(),
  },
}));

vi.mock('../api', () => ({ api: { tree: vi.fn(), activity: vi.fn() } }));
vi.mock('../lib/buildActivity', () => ({
  useBuildActivity: () => [],
  useClaimActivity: () => ({ claims: [], departures: [] }),
}));
vi.mock('../lib/poll', () => ({ useNowTick: () => new Date('2026-08-06T00:00:00.000Z') }));
vi.mock('../lib/sessionClaims', () => ({ useSessionClaimGroups: () => [] }));
vi.mock('@storytree/app-surface', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@storytree/app-surface')>();
  return {
    ...actual,
    arrivalGrowPlan: () => null,
    neighbourHighlightPlan: () => null,
    laneLayout: () => null,
    normalizeWorldPresentationModel: () => ({}),
    deriveForestRegrowAccretionPlans: () => new Map(),
    deriveIslandVegetationPlans: () => new Map(),
    WorldSceneView: () => <g data-testid="world-scene" />,
  };
});
vi.mock('./act2Intro.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./act2Intro.js')>();
  return {
    ...actual,
    useAct2Intro: (input: { enabled: boolean }) => {
      act2Harness.inputs.push(input);
      return act2Harness.player;
    },
    useReducedMotion: () => act2Harness.reducedMotion,
  };
});
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

import { ACT2_INTRO_SESSION_KEY } from './act2Intro.js';
import { api } from '../api';
import { TreeView } from './TreeView';
import { ACT2_REGROW_OPENING_SCALE } from '../lib/worldCamera.js';

const STORIES: TreeStory[] = Array.from({ length: 40 }, (_, index) => ({
  id: `story-${index}`,
  title: `Story ${index}`,
  outcome: `Outcome ${index}`,
  status: 'proposed',
  proofMode: 'test',
  uatWitness: 'machine',
  dependsOn: index === 0 ? [] : [`story-${index - 1}`],
  consumedBy: [],
  capabilities: [],
}));

const APP_DATA: AppData = {
  docs: [],
  docIds: new Set(),
  docTitles: new Map(),
  docsStatus: 'ready',
  docsError: '',
  assets: [],
  assetsStatus: 'ready',
  assetsError: '',
  me: { email: 'owner@example.com', role: 'admin', status: 'active', member: true },
  refreshAssets: async () => {},
};

const cameraValues = (camera: Element): { tx: number; ty: number; scale: number } => {
  const match = camera.getAttribute('transform')?.match(/^translate\(([^ ]+) ([^)]+)\) scale\(([^)]+)\)$/);
  if (!match) throw new Error(`unexpected camera transform: ${camera.getAttribute('transform')}`);
  return { tx: Number(match[1]), ty: Number(match[2]), scale: Number(match[3]) };
};

const mountMap = async (props: { focus?: string | null; active?: boolean } = {}) => {
  const activeProps = props.active === undefined ? {} : { active: props.active };
  const view = render(
    <AppDataContext.Provider value={APP_DATA}>
      <TreeView focus={props.focus ?? null} {...activeProps} />
    </AppDataContext.Provider>,
  );
  const viewport = await screen.findByLabelText('story forest map (pan and zoom)');
  const camera = await waitFor(() => {
    const node = view.container.querySelector('.world-camera');
    expect(node?.getAttribute('transform')).toBeTruthy();
    return node!;
  });
  return { ...view, viewport, camera };
};

const rerenderMap = (
  rerender: ReturnType<typeof render>['rerender'],
  props: { focus?: string | null; active?: boolean } = {},
) => {
  const activeProps = props.active === undefined ? {} : { active: props.active };
  rerender(
    <AppDataContext.Provider value={APP_DATA}>
      <TreeView focus={props.focus ?? null} {...activeProps} />
    </AppDataContext.Provider>,
  );
};

let widthDescriptor: PropertyDescriptor | undefined;
let heightDescriptor: PropertyDescriptor | undefined;
let pointerDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  widthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  heightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1600 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 1000 });
  pointerDescriptor = Object.getOwnPropertyDescriptor(window, 'PointerEvent');
  class PointerEventShim extends window.MouseEvent {
    readonly pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  Object.defineProperty(window, 'PointerEvent', { configurable: true, value: PointerEventShim });
  window.sessionStorage.setItem(ACT2_INTRO_SESSION_KEY, '1');
  act2Harness.reducedMotion = false;
  act2Harness.inputs = [];
  Object.assign(act2Harness.player, { progress: 0, playing: true, regrowing: true });
  vi.mocked(api.tree).mockResolvedValue({ stories: STORIES, builds: [], claims: [] });
});

afterEach(() => {
  cleanup();
  if (widthDescriptor) Object.defineProperty(HTMLElement.prototype, 'clientWidth', widthDescriptor);
  if (heightDescriptor) Object.defineProperty(HTMLElement.prototype, 'clientHeight', heightDescriptor);
  if (pointerDescriptor) Object.defineProperty(window, 'PointerEvent', pointerDescriptor);
  else delete (window as { PointerEvent?: unknown }).PointerEvent;
  vi.clearAllMocks();
});

describe('act2-regrow-camera-projects-the-existing-cursor', () => {
  it('keeps the fitted forest bottom anchored while the published cursor pulls back to its exact fit', async () => {
    window.history.replaceState(null, '', '/?artStyle=vector&act2=intro');
    const view = await mountMap();
    const opening = cameraValues(view.camera);
    expect((view.camera as SVGGElement).style.transition).toBe('none');

    act2Harness.player.progress = 0.5;
    rerenderMap(view.rerender);
    const middle = cameraValues(view.camera);
    expect(middle.scale).toBeLessThan(opening.scale);
    expect(middle.scale).toBeGreaterThan(0);

    Object.assign(act2Harness.player, { progress: 1, playing: false, regrowing: false });
    rerenderMap(view.rerender);
    const fitted = cameraValues(view.camera);
    const fittedBottomY = 984;
    const forestBottom = (fittedBottomY - fitted.ty) / fitted.scale;

    expect(opening.ty + opening.scale * forestBottom).toBeCloseTo(fittedBottomY, 12);
    expect(cameraValues(view.camera)).toEqual(fitted);
  });
});

describe('act2-regrow-camera-owns-input-only-until-settle', () => {
  it('holds wheel, pointer and keyboard inert, then resumes all ordinary controls from fit', async () => {
    window.history.replaceState(null, '', '/?artStyle=vector&act2=intro');
    const view = await mountMap();
    const scripted = cameraValues(view.camera);

    fireEvent.wheel(view.viewport, { deltaY: -100, clientX: 400, clientY: 300 });
    fireEvent.pointerDown(view.viewport, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(view.viewport, { pointerId: 1, clientX: 150, clientY: 140 });
    fireEvent.pointerUp(view.viewport, { pointerId: 1, clientX: 150, clientY: 140 });
    fireEvent.keyDown(view.viewport, { key: 'ArrowRight' });
    expect(cameraValues(view.camera)).toEqual(scripted);

    act2Harness.player.progress = 1;
    act2Harness.player.playing = false;
    act2Harness.player.regrowing = false;
    rerenderMap(view.rerender);
    const fitted = cameraValues(view.camera);
    expect(fitted.scale).toBeLessThan(scripted.scale);

    fireEvent.wheel(view.viewport, { deltaY: -100, clientX: 400, clientY: 300 });
    expect(cameraValues(view.camera).scale).toBeGreaterThan(fitted.scale);
    fireEvent.keyDown(view.viewport, { key: 'ArrowRight' });
    const keyed = cameraValues(view.camera);
    expect(keyed.tx).not.toBe(fitted.tx);
    fireEvent.pointerDown(view.viewport, { button: 0, pointerId: 2, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(view.viewport, { pointerId: 2, clientX: 140, clientY: 130 });
    fireEvent.pointerUp(view.viewport, { pointerId: 2, clientX: 140, clientY: 130 });
    expect(cameraValues(view.camera).tx).not.toBe(keyed.tx);
  });
});

describe('act2-regrow-camera-reduces-motion-and-settles-exactly', () => {
  it('keeps reduced motion fitted and performs zero later transform writes after settle', async () => {
    window.history.replaceState(null, '', '/?artStyle=vector&act2=intro');
    act2Harness.reducedMotion = true;
    const reduced = await mountMap();
    const fitted = cameraValues(reduced.camera);
    act2Harness.player.progress = 0.6;
    rerenderMap(reduced.rerender);
    expect(cameraValues(reduced.camera)).toEqual(fitted);
    reduced.unmount();

    act2Harness.reducedMotion = false;
    Object.assign(act2Harness.player, { progress: 1, playing: false, regrowing: false });
    const settled = await mountMap();
    const settledTransform = settled.camera.getAttribute('transform');
    let transformWrites = 0;
    const observer = new MutationObserver((records) => {
      transformWrites += records.filter((record) => record.attributeName === 'transform').length;
    });
    observer.observe(settled.camera, { attributes: true, attributeFilter: ['transform'] });
    rerenderMap(settled.rerender);
    await Promise.resolve();
    observer.disconnect();
    expect(settled.camera.getAttribute('transform')).toBe(settledTransform);
    expect(transformWrites).toBe(0);
  });

  it('replaces an initial deep-link focus with exact fit before latching regrow entry', async () => {
    window.history.replaceState(null, '', '/?artStyle=vector&act2=intro');
    const view = await mountMap({ focus: 'story-20' });
    const opening = cameraValues(view.camera);

    Object.assign(act2Harness.player, { progress: 1, playing: false, regrowing: false });
    rerenderMap(view.rerender, { focus: 'story-20' });
    const fitted = cameraValues(view.camera);
    expect(fitted.scale).toBeCloseTo(opening.scale / ACT2_REGROW_OPENING_SCALE, 12);

    fireEvent.keyDown(view.viewport, { key: 'ArrowRight' });
    expect(cameraValues(view.camera).tx).not.toBe(fitted.tx);
  });

  it('settles a parked retained tree, stays write-free, and returns with controls instead of resuming', async () => {
    window.history.replaceState(null, '', '/?artStyle=vector&act2=intro');
    Object.assign(act2Harness.player, { progress: 0.4, playing: true, regrowing: true });
    const view = await mountMap({ active: true });
    const scripted = cameraValues(view.camera);

    rerenderMap(view.rerender, { active: false });
    const fitted = cameraValues(view.camera);
    expect(fitted.scale).toBeLessThan(scripted.scale);
    expect(act2Harness.inputs.at(-1)?.enabled).toBe(false);

    let laterWrites = 0;
    const observer = new MutationObserver((records) => {
      laterWrites += records.filter((record) => record.attributeName === 'transform').length;
    });
    observer.observe(view.camera, { attributes: true, attributeFilter: ['transform'] });
    rerenderMap(view.rerender, { active: false });
    await Promise.resolve();
    observer.disconnect();
    expect(cameraValues(view.camera)).toEqual(fitted);
    expect(laterWrites).toBe(0);

    Object.assign(act2Harness.player, { progress: 1, playing: false, regrowing: false });
    rerenderMap(view.rerender, { active: true });
    expect(cameraValues(view.camera)).toEqual(fitted);
    fireEvent.wheel(view.viewport, { deltaY: -100, clientX: 400, clientY: 300 });
    expect(cameraValues(view.camera).scale).toBeGreaterThan(fitted.scale);
  });

  it('disabling the real player cancels its requested frame and returns settled on re-entry', async () => {
    const actual = await vi.importActual<typeof import('./act2Intro.js')>('./act2Intro.js');
    let pending: FrameRequestCallback | null = null;
    const cancelFrame = vi.fn(() => {
      pending = null;
    });
    const clock = {
      requestFrame: (callback: FrameRequestCallback) => {
        pending = callback;
        return 1;
      },
      cancelFrame,
    };
    const graph = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: ['a'] },
    ];
    const hook = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        actual.useAct2Intro({ enabled, stories: graph, edges: [], clock }),
      { initialProps: { enabled: true } },
    );
    act(() => hook.result.current.replay());
    expect(pending).not.toBeNull();

    hook.rerender({ enabled: false });
    expect(cancelFrame).toHaveBeenCalled();
    expect(hook.result.current.progress).toBe(1);
    expect(hook.result.current.playing).toBe(false);

    hook.rerender({ enabled: true });
    expect(hook.result.current.progress).toBe(1);
    expect(hook.result.current.playing).toBe(false);
  });
});

describe('act2-regrow-camera-preserves-the-run-and-reports-its-cost', () => {
  it('makes growth-only write-free and wires the same final product projection into the 40-island probe', async () => {
    window.history.replaceState(null, '', '/?artStyle=vector&act2=intro&cameraRasterisation=probe&cameraVariant=growth-only');
    const control = await mountMap();
    const fitted = cameraValues(control.camera);
    act2Harness.player.progress = 0.5;
    rerenderMap(control.rerender);
    expect(cameraValues(control.camera)).toEqual(fitted);
    control.unmount();

    Object.assign(act2Harness.player, { progress: 0, playing: true, regrowing: true });
    window.history.replaceState(null, '', '/?artStyle=vector&act2=intro&cameraRasterisation=probe&cameraVariant=final-product');
    const product = await mountMap();
    await waitFor(() => expect(cameraValues(product.camera).scale).toBeGreaterThan(fitted.scale));
    expect(window.__storytreeCameraRasterisationProbe?.snapshot().corpus.mappedIslandCount).toBe(40);
  });
});
