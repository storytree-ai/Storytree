// RepoPicker — the renderer repo picker (repo-picker-panel capability, embedded-terminal story
// downstream, ADR-0137/0174). Reflects the current repo selection over the `desktopRepo`
// contextBridge the desktop preload injects on `window`, opens the native picker on click, and
// updates the shown selection on a resolved path.
//
// THIN CLIENT — no `@storytree/agent` / `@storytree/drive` import, no model path (ADR-0004 /
// ADR-0108 d.1; modelPathBoundary.test.ts). The renderer's ONLY route to the selection is
// `window.desktopRepo` (mirrors `desktopAuth` / `desktopApply` / `desktopTerminal`): `get` reads
// the current persisted selection, `pick` opens the native directory dialog and resolves the
// chosen VALIDATED path or `null` on cancel/invalid.
//
// DEGRADES HONESTLY where the bridge is absent (the `StoreBanner` store-unreachable / `TerminalDock`
// no-bridge precedent) — the studio-standalone case (no desktop preload) never calls `get`/`pick`,
// never hangs waiting on a promise that will never arrive, and never crashes the surrounding studio;
// it renders a plain disabled "repo picker unavailable" state instead.
//
// OWN NAMESPACE — `.repo-picker*` CSS, never `.terminal-dock*` (the byte-locked TerminalDock's
// surface). This component never modifies TerminalDock and is mounted beside it, not inside it.

import { useCallback, useEffect, useState } from 'react';

/** The bridge the desktop preload exposes on `window` (absent in the hosted/dev studio — a browser).
 *  Its shape mirrors `desktopAuth` / `desktopApply` / `desktopTerminal`: `pick` opens the native
 *  directory dialog (the Electron main drives `dialog.showOpenDialog` → `repo-selection.select`),
 *  resolving the chosen VALIDATED path or `null` (cancelled, or an invalid dir); `get` reads the
 *  current persisted selection (the main drives `repo-selection.current`), or `null`. */
export interface DesktopRepoBridge {
  pick(): Promise<string | null>;
  get(): Promise<string | null>;
}

declare global {
  interface Window {
    /** Injected by the desktop preload (ADR-0174). Undefined in the hosted/dev studio. */
    desktopRepo?: DesktopRepoBridge;
  }
}

function getDesktopRepo(): DesktopRepoBridge | undefined {
  return typeof window !== 'undefined' ? window.desktopRepo : undefined;
}

export function RepoPicker(): React.JSX.Element {
  const bridge = getDesktopRepo();
  const [selection, setSelection] = useState<string | null>(null);

  // Reflect the current selection on mount — only when the bridge exists, and only once.
  useEffect(() => {
    if (!bridge) return;
    let cancelled = false;
    void bridge.get().then((path) => {
      if (!cancelled) setSelection(path);
    });
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  const onClick = useCallback((): void => {
    if (!bridge) return;
    void bridge.pick().then((path) => {
      // A cancelled (null) pick leaves the shown selection unchanged.
      if (path !== null) setSelection(path);
    });
  }, [bridge]);

  if (!bridge) {
    // Studio-standalone: no desktop preload. Never call get/pick, never hang, never crash the
    // surrounding studio — an honest disabled state instead.
    return (
      <div className="repo-picker repo-picker-disabled">
        <span className="repo-picker-unavailable">repo picker unavailable</span>
      </div>
    );
  }

  return (
    <div className="repo-picker">
      <span className="repo-picker-selection">{selection ?? 'default checkout'}</span>
      <button type="button" className="repo-picker-button" onClick={onClick}>
        Choose repository
      </button>
    </div>
  );
}
