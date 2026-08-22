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
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { ClipboardAddon } from '@xterm/addon-clipboard';

/**
 * The constructors a terminal session is assembled from. Carried as constructors rather than as
 * pre-built instances because the dock builds one set PER TAB, and their lifetimes are the tab's.
 */
export interface TerminalToolkit {
  readonly Terminal: typeof Terminal;
  readonly FitAddon: typeof FitAddon;
  readonly WebglAddon: typeof WebglAddon;
  readonly Unicode11Addon: typeof Unicode11Addon;
  readonly WebLinksAddon: typeof WebLinksAddon;
  readonly SearchAddon: typeof SearchAddon;
  readonly ClipboardAddon: typeof ClipboardAddon;
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
