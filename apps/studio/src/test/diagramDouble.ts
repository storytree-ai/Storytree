// A faithful test implementation of the `DiagramRenderer` seam (lib/diagram.ts).
//
// WHY (anti-slop-adoption-arc inc-06, `no-module-mocking`). Suites that render markdown containing
// a ```mermaid fence used to `vi.mock('mermaid', …)`. mermaid's real render needs a browser layout
// engine, so SOMETHING has to stand in — but the thing to stand in for is what `Markdown` USES, and
// that is now a two-line interface rather than a whole library. This is that stand-in: it records
// what it was asked to draw and answers a deterministic SVG, so a suite can assert the routing
// (which fences reach the engine, and with what source) instead of asserting on a mocked module.

import type { DiagramRenderer } from '../lib/diagram';

export interface DiagramDouble extends DiagramRenderer {
  /** Every (id, chart) pair the renderer was handed, oldest first. */
  readonly calls: ReadonlyArray<{ id: string; chart: string }>;
  /** The diagram sources it was asked to draw, oldest first. */
  charts(): readonly string[];
  /** Forget the history. */
  clear(): void;
}

/**
 * A renderer that succeeds, answering an SVG carrying the source it was given — so a test can tell
 * WHICH diagram reached the host element, not merely that one did.
 */
export function diagramDouble(): DiagramDouble {
  const calls: Array<{ id: string; chart: string }> = [];
  return {
    calls,
    charts: () => calls.map((call) => call.chart),
    clear: () => {
      calls.length = 0;
    },
    render: async (id, chart) => {
      calls.push({ id, chart });
      return { svg: `<svg data-testid="mmd-svg">${chart}</svg>` };
    },
  };
}

/** A renderer that REJECTS, for the fail-soft path where a broken diagram shows its source. */
export function failingDiagramDouble(message = 'Parse error on line 1'): DiagramDouble {
  const calls: Array<{ id: string; chart: string }> = [];
  return {
    calls,
    charts: () => calls.map((call) => call.chart),
    clear: () => {
      calls.length = 0;
    },
    render: async (id, chart) => {
      calls.push({ id, chart });
      throw new Error(message);
    },
  };
}
