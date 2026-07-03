/**
 * Spawn deps type adapter (spawn-deps-composition capability, ADR-0137 Phase 3).
 *
 * SpawnSurfaceDeps is @storytree/agent's spawn tool surface dep contract (defined in
 * agent/spawn-tool-surface.ts and consumed by HeadlessOrchestratorArgs["spawn"]).
 * Re-exported here via the indexed type so drive-package consumers — the desktop
 * sidecar's composition and orchestrate() itself — have a named, stable type without
 * a deep subpath import into @storytree/agent internals.
 *
 * NO import from @storytree/cli (ADR-0112 hard invariant: drive reaches agent and
 * library/store, never CLI).
 */

import type { HeadlessOrchestratorArgs } from "@storytree/agent";

/**
 * The deps the caller injects to mount the spawn tool surface on an orchestrate() session:
 *   - store: ClaimStore — the claim store (real pg in production, a recording fake in tests)
 *   - sessionId: string — the orchestrator session id, stamped into every spawn claim
 *   - branch: string — the orchestrator session branch, stamped into every spawn claim
 *   - spawnStoryAuthor — starts a write-scoped story-author SDK session, returns a summary
 *   - spawnBuilder — starts a write-scoped builder SDK session, returns a summary
 *
 * Derived via HeadlessOrchestratorArgs["spawn"] — structurally identical to
 * SpawnSurfaceDeps in @storytree/agent/spawn-tool-surface, no independent definition.
 * The desktop sidecar (backend-entry.ts) builds and injects this; orchestrate() threads it
 * through to runHeadlessOrchestrator unchanged (additive threading, ADR-0112 precedent).
 */
export type SpawnSurfaceDeps = NonNullable<HeadlessOrchestratorArgs["spawn"]>;
