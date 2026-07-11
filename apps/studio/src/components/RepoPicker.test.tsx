// @vitest-environment jsdom
//
// repo-picker-panel capability (embedded-terminal story downstream, ADR-0137/0174). An integration
// test over the ONE mocked seam — the `desktopRepo` contextBridge (`window.desktopRepo`) — exactly
// as TerminalDock mocks `desktopTerminal` and StoreBanner's desktop leg mocks `desktopApply`. This
// pins the FRONTEND behaviour only:
//
//   • mount + reflect the current selection over the bridge          (rpp-reflects-current-selection-on-mount)
//   • default-checkout label when the current selection is null      (rpp-shows-default-checkout-label)
//   • click opens the native picker, updates on a resolved path      (rpp-opens-picker-and-updates-on-resolve)
//   • a cancelled (null) pick leaves the shown selection unchanged   (rpp-leaves-selection-unchanged-on-cancel)
//   • honest disabled state when the bridge is absent                (rpp-degrades-when-bridge-absent)
//
// THIN CLIENT: RepoPicker reaches the selection ONLY through `window.desktopRepo` (mocked here — no
// real IPC / dialog / Electron). It imports no `@storytree/agent` / `@storytree/drive` (enforced by
// modelPathBoundary.test.ts) and holds no model path. It mounts in its OWN `.repo-picker` namespace,
// never touching `.terminal-dock*` (the byte-locked TerminalDock's surface).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

// ── the desktopRepo bridge — installed on `window` per test (deleted for the absent-bridge case).
//    Both calls resolve asynchronously (a real IPC round-trip would too), so tests await a flush
//    before asserting the reflected/updated selection. ─────────────────────────────────────────
const bridgeMock = vi.hoisted(() => ({
  pick: vi.fn<() => Promise<string | null>>(),
  get: vi.fn<() => Promise<string | null>>(),
}));

import { RepoPicker } from './RepoPicker';

/** Flush the microtask queue the bridge's promises resolve on. */
const flush = (): Promise<void> => act(async () => {});

/** The picker's own namespace root — must never collide with `.terminal-dock*`. */
function pickerRoot(container: HTMLElement): HTMLElement {
  const el = container.querySelector('.repo-picker');
  if (!el) throw new Error('.repo-picker root not found');
  return el as HTMLElement;
}

beforeEach(() => {
  bridgeMock.pick.mockReset();
  bridgeMock.get.mockReset();
  (window as unknown as { desktopRepo?: typeof bridgeMock }).desktopRepo = bridgeMock;
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { desktopRepo?: typeof bridgeMock }).desktopRepo;
});

describe('RepoPicker', () => {
  // ── rpp-reflects-current-selection-on-mount ──────────────────────────────────
  it('rpp-reflects-current-selection-on-mount: reads the current selection over the bridge on mount and shows it', async () => {
    bridgeMock.get.mockResolvedValue('/Users/dev/repos/storytree');
    const { container } = render(<RepoPicker />);

    await flush();

    expect(bridgeMock.get).toHaveBeenCalledTimes(1);
    expect(bridgeMock.pick).not.toHaveBeenCalled();
    expect(pickerRoot(container)).toBeTruthy();
    expect(screen.getByText('/Users/dev/repos/storytree')).toBeTruthy();
  });

  // ── rpp-shows-default-checkout-label ─────────────────────────────────────────
  it('rpp-shows-default-checkout-label: a null current selection renders an honest default-checkout label', async () => {
    bridgeMock.get.mockResolvedValue(null);
    render(<RepoPicker />);

    await flush();

    expect(screen.getByText(/default checkout/i)).toBeTruthy();
  });

  // ── rpp-opens-picker-and-updates-on-resolve ──────────────────────────────────
  it('rpp-opens-picker-and-updates-on-resolve: clicking opens the native picker over the bridge and updates the shown selection on a resolved path', async () => {
    bridgeMock.get.mockResolvedValue(null);
    bridgeMock.pick.mockResolvedValue('/Users/dev/repos/other-project');
    render(<RepoPicker />);
    await flush();
    expect(screen.getByText(/default checkout/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /repository|repo/i }));
    await flush();

    expect(bridgeMock.pick).toHaveBeenCalledTimes(1);
    expect(screen.getByText('/Users/dev/repos/other-project')).toBeTruthy();
    expect(screen.queryByText(/default checkout/i)).toBeNull();
  });

  // ── rpp-leaves-selection-unchanged-on-cancel ─────────────────────────────────
  it('rpp-leaves-selection-unchanged-on-cancel: a cancelled (null) pick leaves the shown selection unchanged', async () => {
    bridgeMock.get.mockResolvedValue('/Users/dev/repos/storytree');
    bridgeMock.pick.mockResolvedValue(null);
    render(<RepoPicker />);
    await flush();
    expect(screen.getByText('/Users/dev/repos/storytree')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /repository|repo/i }));
    await flush();

    expect(bridgeMock.pick).toHaveBeenCalledTimes(1);
    // The prior selection is still shown — a cancelled pick never clears/overwrites it.
    expect(screen.getByText('/Users/dev/repos/storytree')).toBeTruthy();
  });

  // ── rpp-degrades-when-bridge-absent ──────────────────────────────────────────
  it('rpp-degrades-when-bridge-absent: an absent desktopRepo bridge renders an honest disabled state, never calls pick/get', async () => {
    delete (window as unknown as { desktopRepo?: typeof bridgeMock }).desktopRepo;

    expect(() => render(<RepoPicker />)).not.toThrow();
    await flush();

    expect(screen.getByText(/repo picker unavailable/i)).toBeTruthy();
    expect(bridgeMock.get).not.toHaveBeenCalled();
    expect(bridgeMock.pick).not.toHaveBeenCalled();
  });
});
