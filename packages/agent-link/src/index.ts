// @storytree/agent-link: the user's own Claude Code or Codex using storytree by itself
// (stories/agent-link.md). It reaches the library only through the library's public API.
export { findProject, locateStorytree, MARKER_FILE, NOT_A_PROJECT, NOT_RUNNING, route, setUpProject, storytreeHome } from "./routing/index.js";
export type { LocateOptions, ProjectLookup, Route, SetUpOptions, StorytreeAddress } from "./routing/index.js";
export { ACTIVITY_DATABASE, NEW_LINE, openActivityLog } from "./activity/index.js";
export type { ActivityLog, Line, LineKind, LinesSince, NewLine, OpenOptions } from "./activity/index.js";
