/**
 * Capability 1 · Lifecycle: the app keeps running in the background (contract 1.7, ADR-0636 D3).
 * Closing the window does not stop storytree or its database, so agents' activity is still
 * recorded while the window is closed. The tray icon's Quit is the one way to stop it: the database
 * is stopped once, and the app exits only after it has stopped. apps/desktop wires this to
 * Electron's events.
 */
export interface TrayItem {
  /** What the item does: `show` brings the window back, `quit` stops the app. */
  readonly id: "show" | "quit";
  readonly label: string;
  /** Whether choosing it stops the app and its database. */
  readonly stops: boolean;
}

/** The tray icon's menu. */
export const TRAY_MENU: readonly TrayItem[] = [
  { id: "show", label: "Open storytree 0.3", stops: false },
  { id: "quit", label: "Quit storytree 0.3", stops: true },
];

export interface Background {
  /** The last window was closed: the app keeps running, and nothing is stopped. */
  windowClosed(): "keep-running";
  /** Stop the database, then exit. Asking again waits for the same stop. */
  quit(code?: number): Promise<void>;
}

export interface BackgroundOptions {
  /** Stops the database (and closes what reads it). */
  stopDatabase: () => Promise<void>;
  /** Ends the app. */
  exit: (code: number) => void;
}

export function background({ stopDatabase, exit }: BackgroundOptions): Background {
  let quitting: Promise<void> | undefined;
  return {
    windowClosed: () => "keep-running",
    quit(code = 0) {
      quitting ??= stopDatabase()
        .catch(() => {})
        .then(() => exit(code));
      return quitting;
    },
  };
}
