import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// xterm.js base stylesheet — makes the embedded TerminalDock render (ADR-0174). Imported here (the app
// entry), never inside TerminalDock.tsx, which carries a signed --real verdict anchored to its bytes.
import '@xterm/xterm/css/xterm.css';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

// The `?harness=buildrun` dev harness that drove <BuildSection>/<AdoptPanel> through their real
// usePollableRun hook went with the components themselves (ADR-0404 D4). It existed to make the
// Build/Adopt "building…" affordance seeable without a DB or build engine; with no in-app dispatch
// there is no such affordance to look at. It was the only `?harness=` consumer, so the query-param
// switch goes too — a build is dispatched from the CLI now (`storytree node|story build`).
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
