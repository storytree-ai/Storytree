// The diagram-engine seam the markdown renderer draws ```mermaid fences through.
//
// WHY IT EXISTS (anti-slop-adoption-arc inc-06, `no-module-mocking`). `Markdown` imports `mermaid`
// directly, and every suite that rendered markdown containing a diagram replaced that import with
// `vi.mock('mermaid', …)` — rewriting the module system at runtime because there was no seam to
// substitute at. This is that seam, and it is the same shape the studio already uses for its other
// non-injectable dependency (`AppDataContext`): a narrow interface, a context, and a REAL DEFAULT,
// so nothing about production changes when nobody provides one.
//
// The interface is deliberately the two-method subset `Markdown` actually needs rather than
// mermaid's surface — a test double stands in for what the renderer USES, not for the library.

import { createContext, useContext } from 'react';

/** What `Markdown` needs of a diagram engine: turn diagram source into an SVG string. */
export interface DiagramRenderer {
  /**
   * Render `chart` to SVG. `id` is unique per call (React 19 StrictMode double-invokes effects, so
   * two in-flight renders must not collide on one DOM id). Rejects when the source does not parse —
   * the caller fails soft and shows the source.
   */
  render(id: string, chart: string): Promise<{ svg: string }>;
}

/**
 * `null` means "use the real engine" — the default lives with the `mermaid` import in
 * `components/Markdown.tsx` so no other module pulls mermaid into its bundle.
 */
export const DiagramRendererContext = createContext<DiagramRenderer | null>(null);

/** The provided renderer, or `null` when nothing overrode it (the production path). */
export function useDiagramRendererOverride(): DiagramRenderer | null {
  return useContext(DiagramRendererContext);
}
