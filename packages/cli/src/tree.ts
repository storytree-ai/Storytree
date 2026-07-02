// Back-compat shim (the ADR-0112 pattern): `treeCommand` moved to `@storytree/drive` so non-CLI
// consumers (the desktop sidecar's orientation runner) reach the read surface without importing the
// command hub. The registered REAL proof (`stories/notice-board/tree-view.md` →
// `packages/cli/src/tree.test.ts`) keeps proving the same command through this shim.
export { treeCommand } from "@storytree/drive";
export type { TreeDeps } from "@storytree/drive";
