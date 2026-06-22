// The studio dev front's build seam (ADR-0090): the public build entries the server-process worker
// drives — `nodeBuild` (a single capability node, `--live`) and `storyBuild` (a whole story,
// `--real`). Re-exported from ONE narrow subpath (`@storytree/cli/build`) so the studio imports a
// single build surface, and the worker routes a unit id to the right entry by its tier. ADR-0004:
// the FRONTEND imports NONE of this — only the server-process worker does, lazily.
export { nodeBuild } from "./node-build.js";
export { storyBuild } from "./story-build.js";
