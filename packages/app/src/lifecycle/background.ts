/** Capability 1 · Lifecycle: keeping the app running in the background (contract 1.7). Not yet built. */
export interface TrayItem {
  readonly id: string;
  readonly label: string;
  readonly stops: boolean;
}

export const TRAY_MENU: readonly TrayItem[] = [];

export interface Background {
  windowClosed(): "keep-running" | "quit";
  quit(): Promise<void>;
}

export function background(_options: { stopDatabase: () => Promise<void>; exit: (code: number) => void }): Background {
  throw new Error("not built");
}
