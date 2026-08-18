// compare.tsx — entry point for the live-render experiment's evidence page (dev-only).
//
// It publishes a SETTLED signal on `window` once React has mounted and every panel has
// rasterised. The capture script waits on that signal instead of sleeping: this arc has
// twice shipped a harness whose evidence was captured mid-draw, and the desktop E2E
// harness already established the pattern (`captureSettledScreenshot` gates on an
// app-published signal rather than a fixed delay).

import { createRoot } from 'react-dom/client';

import { PlantComparison } from './PlantComparison.js';

declare global {
  interface Window {
    /** Set once every panel has drawn — the capture script's gate. */
    __stExperimentSettled?: boolean;
  }
}

createRoot(document.getElementById('root')!).render(<PlantComparison />);

// Two frames after mount: React has committed and every panel's `useEffect` has run its
// synchronous `renderer.render`, so the framebuffers hold their final pixels.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__stExperimentSettled = true;
  });
});
