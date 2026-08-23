// The terminal-toolkit seam — the xterm constructors `TerminalDock` builds a session out of.
//
// WHY IT EXISTS (anti-slop-adoption-arc inc-06, `no-module-mocking`). The dock imported seven
// `@xterm/*` modules directly, and its test replaced all seven with `vi.mock`. The DOUBLES were
// never the problem — they are careful, faithful fakes of exactly the xterm surface the dock uses,
// which is what a jsdom test needs, since a real terminal wants a layout engine and a GPU context.
// What was wrong was the INSTALLATION: rewriting the module system because the component offered
// nowhere to substitute at. This is that somewhere.
//
// Same shape as the studio's other two seams of this kind (`AppDataContext`, `DiagramRenderer`):
// a narrow value, a context, and a REAL DEFAULT, so production behaviour is unchanged and no
// caller has to pass anything.

import { createContext, useContext } from 'react';

import { Terminal } from '@xterm/xterm';
import type { ITerminalInitOnlyOptions, ITerminalOptions } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import type { IClipboardProvider } from '@xterm/addon-clipboard';

/**
 * THE SEAM DECLARES THE SURFACE THE DOCK USES, NOT THE WHOLE OF XTERM.
 *
 * It named `typeof Terminal` and friends until `anti-slop-adoption-arc` inc-09. That made the seam
 * a re-export of xterm's classes rather than a contract, and the consequence landed in the test: a
 * jsdom double cannot BE an xterm `Terminal` (a real one wants a layout engine and a GPU context),
 * so the suite reached for `fakeToolkit as unknown as TerminalToolkit` and every member of every
 * fake went unchecked. Naming the surface makes the doubles ORDINARY VALUES of the seam's type —
 * a renamed method is a compile error on both sides, and the real xterm classes satisfy these
 * interfaces structurally, so production is unchanged.
 *
 * The rule of thumb when adding to a fake: if the DOCK does not call it, it does not belong here.
 */

/** Anything `Terminal.loadAddon` accepts. */
export interface TerminalAddonLike {
  dispose(): void;
}

/** The `Terminal` surface `TerminalDock` drives. */
export interface TerminalLike {
  readonly cols: number;
  readonly rows: number;
  /** The Unicode11Addon's registration point — the dock sets `activeVersion = '11'`. */
  readonly unicode: { activeVersion: string };
  open(parent: HTMLElement): void;
  write(data: string, callback?: () => void): void;
  clear(): void;
  focus(): void;
  dispose(): void;
  resize(columns: number, rows: number): void;
  paste(data: string): void;
  getSelection(): string;
  hasSelection(): boolean;
  loadAddon(addon: TerminalAddonLike): void;
  /**
   * The three subscriptions the dock takes. `void`, not a disposable: the dock never unsubscribes
   * (the handlers die with the terminal), so `void` fits BOTH the real `IDisposable` return and a
   * double that returns nothing — and it says which of the two facts the seam actually relies on.
   */
  onData(handler: (data: string) => void): void;
  onResize(handler: (size: { cols: number; rows: number }) => void): void;
  onTitleChange(handler: (title: string) => void): void;
  attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean): void;
}

/** The fit addon's surface: the dock activates it against a terminal, then calls `fit()`. */
export interface FitAddonLike extends TerminalAddonLike {
  activate(terminal: TerminalLike): void;
  fit(): void;
}

/** The search addon's surface — find-in-scrollback, driven by the panel's search chrome. */
export interface SearchAddonLike extends TerminalAddonLike {
  findNext(term: string): boolean;
  findPrevious(term: string): boolean;
}

/** The WebGL addon's surface: loaded after `open()`, and disposed on a context loss. */
export interface WebglAddonLike extends TerminalAddonLike {
  /** The dock ignores the subscription (the addon dies with the tab), so `void` fits both the
   *  real addon's `IDisposable` return and a double that returns nothing. */
  onContextLoss(handler: () => void): void;
}

/**
 * The constructors a terminal session is assembled from. Carried as constructors rather than as
 * pre-built instances because the dock builds one set PER TAB, and their lifetimes are the tab's.
 */
export interface TerminalToolkit {
  readonly Terminal: new (options?: ITerminalOptions & ITerminalInitOnlyOptions) => TerminalLike;
  readonly FitAddon: new () => FitAddonLike;
  readonly WebglAddon: new () => WebglAddonLike;
  readonly Unicode11Addon: new () => TerminalAddonLike;
  readonly SearchAddon: new () => SearchAddonLike;
  readonly WebLinksAddon: new (
    handler: (event: MouseEvent, uri: string) => void,
  ) => TerminalAddonLike;
  readonly ClipboardAddon: new (
    base64?: undefined,
    provider?: IClipboardProvider,
  ) => TerminalAddonLike;
}

/** The real engine — what every production mount uses. */
export const xtermToolkit: TerminalToolkit = {
  Terminal,
  FitAddon,
  WebglAddon,
  Unicode11Addon,
  WebLinksAddon,
  SearchAddon,
  ClipboardAddon,
};

/** `null` means "use {@link xtermToolkit}". */
export const TerminalToolkitContext = createContext<TerminalToolkit | null>(null);

/** The provided toolkit, or the real xterm one. */
export function useTerminalToolkit(): TerminalToolkit {
  return useContext(TerminalToolkitContext) ?? xtermToolkit;
}
