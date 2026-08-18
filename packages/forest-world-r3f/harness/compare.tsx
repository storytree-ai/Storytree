// compare.tsx — entry point for the live-render experiment's evidence page (dev-only).
//
// It publishes a SETTLED signal on `window` once React has mounted and every panel has
// rasterised. The capture script waits on that signal instead of sleeping: this arc has
// twice shipped a harness whose evidence was captured mid-draw, and the desktop E2E
// harness already established the pattern (`captureSettledScreenshot` gates on an
// app-published signal rather than a fixed delay).

import { createRoot } from 'react-dom/client';

import { HardwareHud } from './HardwareHud.js';
import { PlantComparison } from './PlantComparison.js';

declare global {
  interface Window {
    /** Set once every panel has drawn — the capture script's gate. */
    __stExperimentSettled?: boolean;
  }
}

function App() {
  return (
    <>
      {/* The D2 hardware probe measures whatever browser is looking at the page, and OWNS
          the settled signal: it finishes last (90 frames), so gating on it guarantees the
          panels have long since drawn AND that the capture never photographs a HUD that is
          still counting. */}
      <HardwareHud
        onSettled={() => {
          window.__stExperimentSettled = true;
        }}
      />
      <PlantComparison />
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
