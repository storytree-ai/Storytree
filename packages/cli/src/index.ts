// @storytree/cli — the agent's exploratory, just-in-time interface to the Library (ADR-0022).
// The dispatch (`run`) + the guidance envelope are exported for embedding and tests; `main.ts`
// is the executable entry that wires the store and prints.
export { run, dashboard, viewArtifact, listCategory } from "./commands.js";
export type { RunDeps } from "./commands.js";
export { formatEnvelope } from "./envelope.js";
export type { Envelope } from "./envelope.js";
