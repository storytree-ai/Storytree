// @storytree/notice-board — the notice-board organism (ADR-0068 step 6), extracted from the
// dissolving @storytree/core. The session-presence schema + staleness classification
// (PresenceDeclarationDoc / classifyPresence / mergeDeclaration / STALE_THRESHOLD_MS /
// POSSIBLY_DEAD_THRESHOLD_MS). Pure zod, browser-safe — the studio bundles it.
export * from "./presence.js";
