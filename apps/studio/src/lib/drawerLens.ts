// The top drawer's LENS reader (ADR-0267 D1 + ADR-0314 D6) — which of the drawer's two lenses the
// URL opens. A pure `?…`-param reader, sibling of `readRenderScene` / `readLayoutMode` in
// worldSettings.ts, reading the search string that precedes the `#hash` rather than a hash route.
//
// IT LIVES HERE RATHER THAN ON THE COMPONENT, AND THAT PLACEMENT IS DELIBERATE. Both the drawer
// (to pick a slot) and TreeView (to own the URL write and to gate the arcs fetch) need it, and
// three TreeView test files stub `./LibraryDrawer.js` down to `{ LibraryDrawer: () => null }` to
// keep the pan/camera suites light. A pure reader exported from the component would force every one
// of those stubs to grow a copy of this logic, and the next such test file to rediscover why.
//
// `readLibraryOverlay` deliberately STAYS on LibraryDrawer.tsx: it is `library-drawer-shell`'s
// signed real.testFile contract (four ids), and moving it would re-point signed verdicts at a file
// that no longer holds what they were signed over.

/**
 * Which lens the drawer shows. ADR-0267 D1 reassigns the drawer's PRIMARY slot from the Library to
 * arcs; ADR-0314 D6 answers where the demoted Library goes — an `Arcs | Library` toggle in the
 * drawer header, the same slot, one click, arcs as the default.
 */
export type DrawerLens = 'arcs' | 'library';

/** The lens the collapsed handle opens onto — arcs, the primary slot (ADR-0267 D1). */
export const DEFAULT_DRAWER_LENS: DrawerLens = 'arcs';

/**
 * Which lens, if any, this search string opens. `?overlay=arcs` and `?overlay=library` each expand
 * the drawer onto their own lens; anything else — absent, empty, or an unrecognised value — leaves
 * it collapsed, so a stale or hand-typed param degrades to the closed handle rather than to a blank
 * expanded drawer.
 */
export function readDrawerLens(search: string): DrawerLens | null {
  const overlay = new URLSearchParams(search).get('overlay');
  if (overlay === 'library') return 'library';
  if (overlay === 'arcs') return 'arcs';
  return null;
}
