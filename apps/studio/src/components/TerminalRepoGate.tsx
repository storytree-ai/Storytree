// TerminalRepoGate — the terminal-repo-gate capability (embedded-terminal story downstream, ADR-0174/
// ADR-0185). A thin WRAPPER around the byte-locked `TerminalDock`: it renders the dock ONLY once the
// `desktopRepo` bridge (the `ready`/`onChanged` slice, alongside the picker's `pick`/`get`) reports a
// valid repo cwd, otherwise renders a fail-closed gate message. Where the bridge is absent (the
// studio-standalone case — no desktop preload) it renders `TerminalDock` directly and never touches
// the bridge, letting the dock show its own honest disabled state.
//
// THIN CLIENT — no `@storytree/agent` / `@storytree/drive` import, no model path (ADR-0004 / ADR-0108
// d.1; modelPathBoundary.test.ts). The gate's only route to the selection is `window.desktopRepo`.
//
// LOCAL CAST, NOT A GLOBAL AUGMENTATION — `RepoPicker.tsx` already augments the global
// `Window.desktopRepo` with the `pick`/`get` shape; a second global augmentation with a different
// (`ready`/`onChanged`) shape would conflict. So this file reads the bridge through a LOCAL interface
// + a local cast, never `declare global`.
//
// KEYED REMOUNT — the dock is rendered `<TerminalDock key={cwd} .../>`: when the cwd changes, React's
// key change unmounts the old dock (disposing its pty) and mounts a fresh one in the new repo. This is
// the whole mechanism behind "a repo change reopens the terminal".
//
// WRAPS THE BYTE-LOCKED TERMINALDOCK — imports it, never edits it. This file's own CSS lives in a
// separate `.terminal-gate*` namespace, never touching `.terminal-dock*`.

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { TerminalDock, type TerminalDockSeed } from './TerminalDock';

/** The `ready`/`onChanged` slice of the `desktopRepo` bridge this gate consumes (alongside the
 *  picker's `pick`/`get` on the same bridge). Read locally — see the LOCAL CAST note above. */
interface DesktopRepoGateBridge {
  ready(): Promise<string | null>;
  onChanged(cb: (cwd: string | null) => void): void;
}

function getDesktopRepoGateBridge(): DesktopRepoGateBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { desktopRepo?: DesktopRepoGateBridge }).desktopRepo;
}

export interface TerminalRepoGateProps {
  seed?: TerminalDockSeed;
  /** An injected (never imported) select affordance — the story wires `<RepoPicker/>` in here. Shown
   *  as the prominent control inside the gated chrome while no repo is selected, and forwarded into
   *  TerminalDock's `headerRight` slot (the repo gear) once a repo is ready. The gate places it; it
   *  never interprets it. */
  repoControl?: ReactNode;
}

export function TerminalRepoGate({
  seed,
  repoControl,
}: TerminalRepoGateProps = {}): React.JSX.Element {
  const bridge = getDesktopRepoGateBridge();
  const [cwd, setCwd] = useState<string | null>(null);

  useEffect(() => {
    if (!bridge) return;

    let cancelled = false;
    void bridge.ready().then((resolved) => {
      if (!cancelled) setCwd(resolved);
    });
    bridge.onChanged((next) => {
      if (!cancelled) setCwd(next);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!bridge) {
    // Studio-standalone: no desktop preload, no repo concept to gate on. Render the dock directly —
    // it has no `desktopTerminal` bridge either and shows its own honest disabled state.
    return <TerminalDock {...(seed ? { seed } : {})} />;
  }

  if (!cwd) {
    // Fail-closed gated chrome — never a silent block, and never shown without a reason. Covers
    // both the new-user (never-selected) and stale/invalid-persisted cases honestly: `ready()`
    // resolves null for both.
    return (
      <div className="terminal-gate">
        <div className="terminal-gate-message">Select a repository to start the terminal</div>
        {repoControl != null && <div className="terminal-gate-control">{repoControl}</div>}
      </div>
    );
  }

  // Keyed on the cwd: a repo change swaps the key, unmounting the old dock (disposing its pty) and
  // mounting a fresh one in the new repo.
  return (
    <TerminalDock
      key={cwd}
      {...(repoControl != null ? { headerRight: repoControl } : {})}
      {...(seed ? { seed } : {})}
    />
  );
}
