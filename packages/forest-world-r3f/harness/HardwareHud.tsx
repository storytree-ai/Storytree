// HardwareHud.tsx — the ADR-0380 D2 HARDWARE-FLOOR probe, run in whatever browser is
// looking at the page (dev-only harness).
//
// WHY THIS EXISTS. Question 2 of the live-render experiment is whether a live-rendered land
// clears the D2 floor: a Snapdragon X Elite X1E80100 with an INTEGRATED Adreno X1-85, no
// discrete GPU, no CUDA, at 2880x1920. The capture harness CANNOT answer it — headless
// Chromium on this box rasterises through ANGLE-on-SwiftShader, which is software, so its
// frame times are the compositor's present cadence and nothing more.
//
// The measurement therefore has to happen where the real GPU is. This panel reports the
// UNMASKED RENDERER STRING, which answers WHICH RASTERISER honestly and is what it is for.
//
// ⚠ CORRECTED 2026-08-19 — ITS TIMINGS ARE NOT A D2 VERDICT, AND ONCE READ AS ONE.
// This panel was built to let the owner answer question 2 by opening the page. It cannot,
// and the reason is structural rather than a tuning problem: `compare.html` renders each
// panel ONCE and blits it, so by the time these ninety `requestAnimationFrame` deltas are
// sampled the page is IDLE — and an idle page presents at the display's refresh interval on
// any hardware whatsoever. Measured on the real Adreno X1-85, a settled `compare.html` and a
// BLANK page both report a p50 of 16.70 ms. The number contains no scene.
//
// That is the same artefact the README correctly refused to quote from the SwiftShader run,
// reached by a different road — which is why the labels below say "idle cadence" and the
// verdict text says outright what the number is not. The real answer lives in
// `hardware-floor.mjs`, which draws a land continuously and times it with `gl.finish()`.

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
function readRenderer() {
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
        {/* Labelled IDLE, not `frame`. This page renders each panel once and then draws
            nothing, so these deltas are the display's presentation interval — see the verdict
            note below, and `hardware-floor-report.json` for the controls that measured it. */}
        <dt>idle cadence p50</dt>
        <dd>{reading.p50.toFixed(2)} ms</dd>
        <dt>idle cadence p95</dt>
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
          Hardware rasteriser engaged &mdash; so the GPU line above is a real answer to{' '}
          <em>which renderer</em>. The timings are <strong>not</strong> a D2 verdict, and this
          correction replaces what this panel used to claim: every panel on this page is drawn{' '}
          <strong>once</strong> and then blitted, so these deltas are the display&rsquo;s refresh
          interval and contain no scene. Measured on this GPU, a settled{' '}
          <code>compare.html</code> and a <strong>blank page</strong> present identically
          (16.70&thinsp;ms p50 each). For the real answer run{' '}
          <code>pnpm --filter @storytree/forest-world-r3f hardware-floor</code>, which draws a land
          continuously and times it with <code>gl.finish()</code>.
        </p>
      )}
    </aside>
  );
}
