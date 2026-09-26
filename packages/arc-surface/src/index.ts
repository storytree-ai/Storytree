// @storytree/arc-surface: the arc surface story (stories/arc-surface.md). Its Work states and live
// reading are shared with the forest, which reads them (ADR-0632 D3). Everything exported here is
// safe to bundle into the page: it imports nothing from Node.
export { workStates } from "./work-states/work-states.js";
export type { PartState, WorkStates } from "./work-states/work-states.js";
