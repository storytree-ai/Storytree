// @vitest-environment jsdom
//
// terminal-repo-gate capability (embedded-terminal story downstream, ADR-0174/0185). An integration
// test over TWO mocked seams — the `desktopRepo` contextBridge's `ready`/`onChanged` slice
// (`window.desktopRepo`) and the byte-locked `TerminalDock` (stubbed here so this test targets the
// GATE's own wiring, never TerminalDock's xterm/session internals, which TerminalDock.test.tsx
// already pins). This is the wrapper's own behaviour test, not a single isolated assertion — it
// spans:
//
//   • gate-when-no-repo: no valid cwd → a fail-closed gate message, no terminal        (trg-gates-when-no-repo-selected)
//   • show-when-ready: a resolved cwd swaps the gate for the terminal                  (trg-shows-terminal-once-repo-ready)
//   • reopen-on-change: a repo change RE-KEYS the dock (old instance unmounts, a       (trg-reopens-on-repo-change)
//     fresh one mounts) — and a change back to no-repo re-shows the gate
//   • forward-seed: the `seed` prop is forwarded straight through to the terminal      (trg-forwards-seed-to-terminal)
//   • degrade-when-absent: with no bridge, TerminalDock renders directly, `ready`/     (trg-degrades-when-bridge-absent)
//     `onChanged` are never touched
//
// THIN CLIENT: the gate reaches the selection ONLY through `window.desktopRepo` (mocked here — no
// real IPC/Electron) and wraps TerminalDock (stubbed here — no real xterm). It imports no
// `@storytree/agent` / `@storytree/drive` (modelPathBoundary.test.ts, a generic file scan, stays
// green with no gate-specific addition needed) and holds no model path. It mounts its OWN
// `.terminal-gate` namespace, never touching `.terminal-dock*` (TerminalDock's byte-locked surface).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { useEffect, useState } from 'react';

// ── the TerminalDock stub — records MOUNT/UNMOUNT (not re-render) via a lazy `useState` id
//    (assigned once per instance, bumping on every fresh mount) paired with an `useEffect([id])`
//    mount/unmount log. This is how the test observes the gate's `key={cwd}` remount (a fresh pty
//    on a repo change) without reaching into TerminalDock's real xterm/session internals — exactly
//    the discipline ReviewBlocks.test.tsx uses stubbing `./Markdown`. ──────────────────────────────
const dockMock = vi.hoisted(() => ({
  counter: 0,
  log: [] as Array<{ type: 'mount' | 'unmount'; id: number }>,
}));

vi.mock('./TerminalDock', () => ({
  TerminalDock: (props: { seed?: { command: string; token: number } }) => {
    const [id] = useState(() => ++dockMock.counter);
    useEffect(() => {
      dockMock.log.push({ type: 'mount', id });
      return () => {
        dockMock.log.push({ type: 'unmount', id });
      };
    }, [id]);
    return (
      <div
        data-testid="terminal-dock-mock"
        data-dock-id={id}
        data-seed={props.seed ? JSON.stringify(props.seed) : ''}
      />
    );
  },
}));

// ── the desktopRepo bridge's `ready`/`onChanged` slice — installed on `window` per test (deleted
//    for the absent-bridge case). `onChanged` captures its callback so a test can fire a simulated
//    repo change. ──────────────────────────────────────────────────────────────────────────────
const bridgeMock = vi.hoisted(() => ({
  ready: vi.fn<() => Promise<string | null>>(),
  onChanged: vi.fn<(cb: (cwd: string | null) => void) => void>(),
  changeHandler: undefined as ((cwd: string | null) => void) | undefined,
}));

import { TerminalRepoGate } from './TerminalRepoGate';

/** Flush the microtask queue the bridge's `ready()` promise resolves on. */
const flush = (): Promise<void> => act(async () => {});

const GATE_MESSAGE = /select a repository to start the terminal/i;

beforeEach(() => {
  dockMock.counter = 0;
  dockMock.log = [];
  bridgeMock.ready.mockReset();
  bridgeMock.onChanged.mockReset();
  bridgeMock.changeHandler = undefined;
  bridgeMock.onChanged.mockImplementation((cb) => {
    bridgeMock.changeHandler = cb;
  });
  (window as unknown as { desktopRepo?: typeof bridgeMock }).desktopRepo = bridgeMock;
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { desktopRepo?: typeof bridgeMock }).desktopRepo;
});

describe('TerminalRepoGate', () => {
  // ── trg-gates-when-no-repo-selected ──────────────────────────────────────────
  it('trg-gates-when-no-repo-selected: renders a fail-closed gate when no valid repo is selected', async () => {
    bridgeMock.ready.mockResolvedValue(null);
    const { container } = render(<TerminalRepoGate />);

    await flush();

    expect(bridgeMock.ready).toHaveBeenCalledTimes(1);
    expect(screen.getByText(GATE_MESSAGE)).toBeTruthy();
    expect(screen.queryByTestId('terminal-dock-mock')).toBeNull();
    expect(container.querySelector('.terminal-gate')).toBeTruthy();
  });

  // ── trg-shows-terminal-once-repo-ready ───────────────────────────────────────
  it('trg-shows-terminal-once-repo-ready: swaps to the terminal once a valid repo cwd resolves', async () => {
    bridgeMock.ready.mockResolvedValue('/Users/dev/repos/storytree');
    render(<TerminalRepoGate />);

    await flush();

    expect(screen.getByTestId('terminal-dock-mock')).toBeTruthy();
    expect(screen.queryByText(GATE_MESSAGE)).toBeNull();
  });

  // ── trg-reopens-on-repo-change ────────────────────────────────────────────────
  it('trg-reopens-on-repo-change: a repo change re-keys the dock (fresh pty) and reverts to the gate on deselect', async () => {
    bridgeMock.ready.mockResolvedValue('/Users/dev/repos/storytree');
    render(<TerminalRepoGate />);
    await flush();

    expect(bridgeMock.onChanged).toHaveBeenCalledTimes(1);
    const firstId = Number(screen.getByTestId('terminal-dock-mock').getAttribute('data-dock-id'));
    expect(dockMock.log).toEqual([{ type: 'mount', id: firstId }]);

    // A repo CHANGE re-keys the dock: the old instance unmounts, a fresh one mounts.
    act(() => {
      bridgeMock.changeHandler?.('/Users/dev/repos/other-project');
    });
    await flush();

    const secondId = Number(screen.getByTestId('terminal-dock-mock').getAttribute('data-dock-id'));
    expect(secondId).not.toEqual(firstId);
    expect(dockMock.log).toEqual([
      { type: 'mount', id: firstId },
      { type: 'unmount', id: firstId },
      { type: 'mount', id: secondId },
    ]);

    // A change to NO repo reverts to the fail-closed gate, unmounting the terminal.
    act(() => {
      bridgeMock.changeHandler?.(null);
    });
    await flush();

    expect(screen.getByText(GATE_MESSAGE)).toBeTruthy();
    expect(screen.queryByTestId('terminal-dock-mock')).toBeNull();
    expect(dockMock.log).toEqual([
      { type: 'mount', id: firstId },
      { type: 'unmount', id: firstId },
      { type: 'mount', id: secondId },
      { type: 'unmount', id: secondId },
    ]);
  });

  // ── trg-forwards-seed-to-terminal ────────────────────────────────────────────
  it('trg-forwards-seed-to-terminal: forwards the seed prop straight through to the terminal once ready', async () => {
    bridgeMock.ready.mockResolvedValue('/Users/dev/repos/storytree');
    const seed = { command: 'pnpm storytree node build x --real --store pg', token: 1 };
    render(<TerminalRepoGate seed={seed} />);

    await flush();

    const dock = screen.getByTestId('terminal-dock-mock');
    expect(dock.getAttribute('data-seed')).toEqual(JSON.stringify(seed));
  });

  // ── trg-degrades-when-bridge-absent ──────────────────────────────────────────
  it('trg-degrades-when-bridge-absent: with no desktopRepo bridge renders the terminal directly, never touching ready/onChanged', async () => {
    delete (window as unknown as { desktopRepo?: typeof bridgeMock }).desktopRepo;

    expect(() => render(<TerminalRepoGate />)).not.toThrow();
    await flush();

    expect(screen.getByTestId('terminal-dock-mock')).toBeTruthy();
    expect(screen.queryByText(GATE_MESSAGE)).toBeNull();
    expect(bridgeMock.ready).not.toHaveBeenCalled();
    expect(bridgeMock.onChanged).not.toHaveBeenCalled();
  });
});
