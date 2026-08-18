// HardwareHud.tsx — the ADR-0380 D2 HARDWARE-FLOOR probe, run in whatever browser is
// looking at the page (dev-only harness).
//
// WHY THIS EXISTS. Question 2 of the live-render experiment is whether a live-rendered land
// clears the D2 floor: a Snapdragon X Elite X1E80100 with an INTEGRATED Adreno X1-85, no
// discrete GPU, no CUDA, at 2880x1920. The capture harness CANNOT answer it — headless
// Chromium on this box rasterises through ANGLE-on-SwiftShader, which is software, so its
// frame times are the compositor's present cadence and nothing more.
//
// The measurement therefore has to happen where the real GPU is, which means it has to
// happen in front of the owner. Rather than hand back a command and a request to read a
// devtools panel, the page measures itself and prints the two things that decide it: the
// UNMASKED RENDERER STRING (which says whether a GPU was engaged at all) and the frame-time
// distribution. If the renderer string says SwiftShader, the numbers below it mean nothing,
// and the HUD says so itself rather than leaving that inference to the reader — a frame time
// with no provenance is exactly how a software cadence gets quoted as a hardware verdict.

import { useEffect, useState } from 'react';

interface Reading {
  renderer: string;
  version: string;
  software: boolean;
  p50: number;
  p95: number;
  worst: number;
  dpr: number;
  screen: string;
}

/** Read the GPU identity WITHOUT keeping a context alive — one throwaway canvas. */
function readRenderer(): { renderer: string; version: string } {
  const c = document.createElement('canvas');
  const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
  if (!gl) return { renderer: 'NO WEBGL CONTEXT', version: 'none' };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    renderer: dbg
      ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
      : 'unavailable (extension blocked)',
    version: String(gl.getParameter(gl.VERSION)),
  };
}

export function HardwareHud({ onSettled }: { onSettled: () => void }) {
  const [reading, setReading] = useState<Reading | null>(null);

  useEffect(() => {
    const { renderer, version } = readRenderer();
    const deltas: number[] = [];
    let last = performance.now();
    let n = 0;
    const tick = () => {
      const now = performance.now();
      deltas.push(now - last);
      last = now;
      n++;
      if (n < 90) {
        requestAnimationFrame(tick);
        return;
      }
      // Drop the first sample: it spans mount work, not a steady-state frame.
      const s = deltas.slice(1).sort((a, b) => a - b);
      setReading({
        renderer,
        version,
        software: /swiftshader|llvmpipe|software|basic render/i.test(renderer),
        p50: s[Math.floor(s.length * 0.5)] ?? 0,
        p95: s[Math.floor(s.length * 0.95)] ?? 0,
        worst: s[s.length - 1] ?? 0,
        dpr: window.devicePixelRatio,
        screen: `${window.screen.width}x${window.screen.height}`,
      });
      onSettled();
    };
    requestAnimationFrame(tick);
  }, [onSettled]);

  if (!reading) {
    return (
      <aside className="hud measuring">
        <strong>measuring this machine&hellip;</strong>
      </aside>
    );
  }

  return (
    <aside className={`hud ${reading.software ? 'software' : 'hardware'}`}>
      <strong>This machine, measured just now</strong>
      <dl>
        <dt>GPU</dt>
        <dd>{reading.renderer}</dd>
        <dt>WebGL</dt>
        <dd>{reading.version}</dd>
        <dt>display</dt>
        <dd>
          {reading.screen} at dpr {reading.dpr}
        </dd>
        <dt>frame p50</dt>
        <dd>{reading.p50.toFixed(2)} ms</dd>
        <dt>frame p95</dt>
        <dd>{reading.p95.toFixed(2)} ms</dd>
        <dt>worst</dt>
        <dd>{reading.worst.toFixed(2)} ms</dd>
      </dl>
      {reading.software ? (
        <p className="verdict bad">
          SOFTWARE RASTERISER &mdash; the frame times above are the compositor&rsquo;s present cadence
          and say <strong>nothing</strong> about GPU cost. This is what the headless capture sees, and
          it is why the ADR-0380 D2 hardware-floor question is not answered by the committed report.
          Open this page in an ordinary browser window on the target machine to get a real reading.
        </p>
      ) : (
        <p className="verdict ok">
          Hardware rasteriser engaged, so these frame times are real. Note the honest caveat: this page
          draws a few dozen small static meshes, not a whole island, so a comfortable number here is a
          NECESSARY condition for D2 and not a sufficient one.
        </p>
      )}
    </aside>
  );
}
