// @vitest-environment jsdom
//
// The bottom panel's TAB HOST (`traversal-panel-arc`, increment `traversal-panel-bottom-tab-host`).
//
// ADR-0354 D1 adds a sibling tab and must NOT degrade the CLI, so the assertions are split evenly
// between "the traversal is reachable" and "the terminal is untouched":
//
//   • both-tabs: the panel renders a Terminal tab and a Traversal tab       (bdh-renders-both-tabs)
//   • terminal-default: the terminal is the tab an operator meets first     (bdh-opens-on-the-terminal)
//   • switch-mounts-child: selecting Traversal mounts its child             (bdh-traversal-tab-mounts-its-child)
//   • preserves-state: BOTH panes stay MOUNTED across a switch, so neither  (bdh-switch-preserves-tab-state)
//     tab loses its state — the terminal keeps its sessions, the traversal
//     keeps its selection
//   • one-fold: the panel folds and unfolds from ONE chevron, and a tab     (bdh-one-fold-for-the-panel)
//     click on a folded panel opens it on that tab
//   • hosts-the-dock: the terminal is rendered through the gate with the    (bdh-hosts-the-terminal-dock)
//     contract-12 host seam, so the dock draws no second frame
//   • seed-reveals-terminal: a map Build seed unfolds the panel AND brings  (bdh-seed-reveals-the-terminal)
//     the terminal forward — a seeded command must never land in a hidden pane
//
// The gate and the traversal tab are both STUBBED: this test targets the HOST's own wiring, never
// TerminalDock's xterm/session internals (TerminalDock.test.tsx pins those) and never the trace
// index (traversalIndex.test.ts pins that). The same discipline TerminalRepoGate.test.tsx uses.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

import { useEffect, useState } from 'react';

import { BottomDock, type BottomDockPanes } from './BottomDock';

// ── the two pane PROBES — mount/unmount logged so the test can prove the terminal pane is HIDDEN
//    rather than unmounted on a tab switch (the difference between preserving a live pty's
//    scrollback and paying a snapshot replay for every switch), plus a control that pushes a meta
//    line up into the host's tab strip.
//
//    HANDED IN THROUGH THE `panes` SLOT, not mocked over the modules (anti-slop-adoption-arc
//    inc-06, `no-module-mocking`). What is under test here is the PANEL — its tab strip, its
//    retention, its host seam — and the real pane bodies would each stand up a pty and a trace read
//    to prove none of it. The slots default to the real components, so production is unchanged.
const gateMock = {
  counter: 0,
  log: [] as Array<{ type: 'mount' | 'unmount'; id: number }>,
  lastHost: null as { expanded: boolean; onRequestExpand: () => void } | null,
};
const tabMock = {
  counter: 0,
  log: [] as Array<{ type: 'mount' | 'unmount'; id: number }>,
};

function TerminalPaneProbe(props: {
  seed?: { command: string; token: number };
  host?: { expanded: boolean; onRequestExpand: () => void };
}): React.JSX.Element {
  const [id] = useState(() => ++gateMock.counter);
  gateMock.lastHost = props.host ?? null;
  useEffect(() => {
    gateMock.log.push({ type: 'mount', id });
    return () => {
      gateMock.log.push({ type: 'unmount', id });
    };
  }, [id]);
  return (
    <div
      data-testid="terminal-gate-mock"
      data-gate-id={id}
      data-host-expanded={props.host ? String(props.host.expanded) : 'no-host'}
      data-seed={props.seed ? JSON.stringify(props.seed) : ''}
    />
  );
}

function TraversalPaneProbe(props: {
  active: boolean;
  onMeta: (meta: string | null) => void;
}): React.JSX.Element {
  const [id] = useState(() => ++tabMock.counter);
  useEffect(() => {
    tabMock.log.push({ type: 'mount', id });
    return () => {
      tabMock.log.push({ type: 'unmount', id });
    };
  }, [id]);
  return (
    <div data-testid="traversal-tab-mock" data-tab-id={id} data-active={String(props.active)}>
      <button type="button" onClick={() => props.onMeta('trace-a · 42 events')}>
        report meta
      </button>
    </div>
  );
}

/** The slot value every render below passes. */
const PANES: BottomDockPanes = {
  terminal: (props) => <TerminalPaneProbe {...props} />,
  traversal: (props) => <TraversalPaneProbe {...props} />,
};

/** The panes are hidden via `hidden`, so "visible" means the pane wrapper is not hidden. */
function paneHidden(testId: string): boolean {
  const child = screen.getByTestId(testId);
  return child.closest('.bottom-dock-pane')?.hasAttribute('hidden') ?? true;
}

beforeEach(() => {
  gateMock.counter = 0;
  gateMock.log.length = 0;
  gateMock.lastHost = null;
  tabMock.counter = 0;
  tabMock.log.length = 0;
});

afterEach(() => cleanup());

describe('BottomDock — the panel offers both tabs (bdh-renders-both-tabs)', () => {
  it('renders a Terminal tab and a Traversal tab in one tablist', () => {
    render(<BottomDock panes={PANES} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['›_Terminal', '⌁Traversal']);
  });

  it('opens on the TERMINAL — the traversal is the new sibling, not the new default', () => {
    render(<BottomDock panes={PANES} />);
    expect(screen.getByRole('tab', { name: /terminal/i }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /traversal/i }).getAttribute('aria-selected')).toBe('false');
  });

  it('keeps the terminal available — ADR-0354 D1 adds a tab and never replaces the CLI', () => {
    render(<BottomDock panes={PANES} />);
    expect(screen.getByTestId('terminal-gate-mock')).toBeTruthy();
  });
});

describe('BottomDock — one fold for the whole panel (bdh-one-fold-for-the-panel)', () => {
  it('starts folded, so the panel does not cover the map until it is asked for', () => {
    render(<BottomDock panes={PANES} />);
    expect(screen.getByRole('button', { name: /expand bottom panel/i })).toBeTruthy();
    // Folded: neither pane is showing, though both are mounted.
    expect(paneHidden('terminal-gate-mock')).toBe(true);
    expect(paneHidden('traversal-tab-mock')).toBe(true);
  });

  it('unfolds from the ONE chevron — never one per tab', () => {
    render(<BottomDock panes={PANES} />);
    expect(screen.getAllByRole('button', { name: /bottom panel$/i })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /expand bottom panel/i }));
    expect(paneHidden('terminal-gate-mock')).toBe(false);
    expect(screen.getByRole('button', { name: /collapse bottom panel/i })).toBeTruthy();
  });

  it('opens ON the tab that was clicked when the panel was folded', () => {
    render(<BottomDock panes={PANES} />);
    // An operator clicking "Traversal" on a folded panel means "show me the traversal", not "note
    // my preference and stay shut".
    fireEvent.click(screen.getByRole('tab', { name: /traversal/i }));
    expect(paneHidden('traversal-tab-mock')).toBe(false);
    expect(paneHidden('terminal-gate-mock')).toBe(true);
  });

  it('folds again when the tab already forward is clicked', () => {
    render(<BottomDock panes={PANES} />);
    fireEvent.click(screen.getByRole('button', { name: /expand bottom panel/i }));
    fireEvent.click(screen.getByRole('tab', { name: /terminal/i }));
    expect(paneHidden('terminal-gate-mock')).toBe(true);
  });
});

describe('BottomDock — switching preserves each tab’s state (bdh-switch-preserves-tab-state)', () => {
  it('mounts the traversal tab’s child when its tab is selected', () => {
    render(<BottomDock panes={PANES} />);
    fireEvent.click(screen.getByRole('tab', { name: /traversal/i }));
    expect(screen.getByTestId('traversal-tab-mock')).toBeTruthy();
    expect(screen.getByTestId('traversal-tab-mock').dataset['active']).toBe('true');
  });

  it('HIDES rather than unmounts the pane left behind, and the same instance comes back', () => {
    render(<BottomDock panes={PANES} />);
    fireEvent.click(screen.getByRole('button', { name: /expand bottom panel/i }));
    const firstGateId = screen.getByTestId('terminal-gate-mock').dataset['gateId'];

    fireEvent.click(screen.getByRole('tab', { name: /traversal/i }));
    fireEvent.click(screen.getByRole('tab', { name: /terminal/i }));

    // The terminal keeps its xterm instances and scrollback because it was never torn down; the
    // traversal keeps its selected trace for the same reason. An unmount would survive (sessions
    // are app-owned, ADR-0189) but would pay a snapshot replay per switch and lose the selection.
    expect(gateMock.log.filter((e) => e.type === 'unmount')).toHaveLength(0);
    expect(tabMock.log.filter((e) => e.type === 'unmount')).toHaveLength(0);
    expect(screen.getByTestId('terminal-gate-mock').dataset['gateId']).toBe(firstGateId);
  });

  it('tells the traversal tab when it is NOT the forward one, so it does not read while unseen', () => {
    render(<BottomDock panes={PANES} />);
    fireEvent.click(screen.getByRole('button', { name: /expand bottom panel/i }));
    expect(screen.getByTestId('traversal-tab-mock').dataset['active']).toBe('false');
    fireEvent.click(screen.getByRole('tab', { name: /traversal/i }));
    expect(screen.getByTestId('traversal-tab-mock').dataset['active']).toBe('true');
  });
});

describe('BottomDock — the dock is HOSTED, not nested (bdh-hosts-the-terminal-dock)', () => {
  it('passes the contract-12 host seam down, so the dock draws no second frame', () => {
    render(<BottomDock panes={PANES} />);
    expect(gateMock.lastHost).not.toBeNull();
    // The dock's fold state is the HOST's: true only while the panel is open on the terminal tab.
    expect(screen.getByTestId('terminal-gate-mock').dataset['hostExpanded']).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: /expand bottom panel/i }));
    expect(screen.getByTestId('terminal-gate-mock').dataset['hostExpanded']).toBe('true');
    // Forward the OTHER tab and the dock is folded from its own point of view — which is what stops
    // it fitting an xterm into a pane nobody can see.
    fireEvent.click(screen.getByRole('tab', { name: /traversal/i }));
    expect(screen.getByTestId('terminal-gate-mock').dataset['hostExpanded']).toBe('false');
  });

  it('forwards a map Build seed straight through to the terminal', () => {
    render(<BottomDock seed={{ command: 'pnpm storytree node build x', token: 3 }} panes={PANES} />);
    expect(screen.getByTestId('terminal-gate-mock').dataset['seed']).toContain('node build x');
  });

  it('REVEALS the terminal when the dock asks — a seeded command never lands in a hidden pane', () => {
    render(<BottomDock panes={PANES} />);
    fireEvent.click(screen.getByRole('tab', { name: /traversal/i }));
    expect(paneHidden('terminal-gate-mock')).toBe(true);

    // This is what TerminalDock's seed effect calls through `host.onRequestExpand` (contract 12).
    // `act` because the call originates outside React's own event handling, exactly as the dock's
    // seed effect does.
    act(() => gateMock.lastHost?.onRequestExpand());

    expect(paneHidden('terminal-gate-mock')).toBe(false);
    expect(screen.getByRole('tab', { name: /terminal/i }).getAttribute('aria-selected')).toBe('true');
  });
});

describe('BottomDock — the tab strip names the selected trace', () => {
  it('renders no meta container at all until a trace is chosen', () => {
    render(<BottomDock panes={PANES} />);
    fireEvent.click(screen.getByRole('tab', { name: /traversal/i }));
    expect(screen.queryByTestId('bottom-dock-meta')).toBeNull();
  });

  it('shows what the traversal tab reports, and clears it on the way out of that tab', () => {
    render(<BottomDock panes={PANES} />);
    fireEvent.click(screen.getByRole('tab', { name: /traversal/i }));
    fireEvent.click(screen.getByRole('button', { name: 'report meta' }));
    expect(screen.getByTestId('bottom-dock-meta').textContent).toBe('trace-a · 42 events');

    // A tab the operator cannot see should not still be describing itself in the strip.
    fireEvent.click(screen.getByRole('tab', { name: /terminal/i }));
    expect(screen.queryByTestId('bottom-dock-meta')).toBeNull();
  });
});
