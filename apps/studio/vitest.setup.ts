// vitest setup — alias `self` to `globalThis` for the NODE test environment.
//
// The studio's pure-logic suites run in the `node` environment (only component tests opt into jsdom via
// `@vitest-environment`). Since ADR-0174 mounted <TerminalDock/> in TreeView, importing `TreeView.js`
// for its exported pure helpers (buildWorld / sceneAdapter / buildingIsland / sharedIslandPanel) now
// transitively loads `@xterm/addon-fit`, whose UMD wrapper passes a bare `self` as its module root.
// `self` is undefined in Node → a load-time ReferenceError before any test runs. Aliasing it to
// globalThis is the standard browser-global shim; it never overrides jsdom's own `self` (the guard
// leaves an existing binding untouched), so the component/jsdom suites are unaffected.
if (typeof (globalThis as { self?: unknown }).self === 'undefined') {
  (globalThis as { self: unknown }).self = globalThis;
}
