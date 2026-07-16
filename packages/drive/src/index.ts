// @storytree/drive — the build/orchestrate runtime barrel (the `.` export, ADR: the drive
// extraction). The drivers that compose the orchestrator spine + the agent leaf + the live stores
// into node/story builds, adoption, and the headless orchestrator, returning the CLI Envelope.
// Consumed by the terminal CLI (`@storytree/cli`, which re-exports for back-compat) and the studio
// server. HARD INVARIANT: this package imports NOTHING from `@storytree/cli` (no cycle).
//
// Re-exports every moved module's public surface so the consumers that used to import `./x.js`
// from cli now import the same names from `@storytree/drive`. The `./build` and `./secrets`
// subpaths carry the narrow build seam + secrets hydration separately (studio imports those lazily).

export * from "./envelope.js";
export * from "./secrets.js";
export * from "./adr-frontmatter.js";
export * from "./adr-metas.js";
export * from "./node-build.js";
// Per-slice token-usage persistence (accounting, never proof): the SdkRunInfo → UsageEventDoc
// mapping + the advisory append the build paths run after proveUnit.
export * from "./usage.js";
export * from "./story-build.js";
export * from "./adopt.js";
export * from "./orchestrate.js";
export * from "./chat-stream.js";
// The spawn-deps composition (ADR-0137 Phase 3): `buildSpawnDeps` + the `SpawnSurfaceDeps` shape the
// desktop sidecar composes and threads through the chat mount → startChatStream → orchestrate.
export * from "./spawn-deps.js";
// The landing-deps composition (ADR-0152): `buildLandingDeps` + the exec seam the desktop sidecar
// composes and threads through the chat mount → startChatStream → orchestrate (the merge ceremony).
export * from "./landing-deps.js";
// The inspect-deps composition (ADR-0173): `buildInspectDeps` — the desktop sidecar composes the real
// read-only `gh`/`git` inspection deps and threads them through the chat mount → startChatStream →
// orchestrate (the CI/git diagnosis surface). Observation only; each tool refuses a mutating arg.
export * from "./inspect-deps.js";
export * from "./wisp-smoke.js";
export * from "./oq-gate.js";
export * from "./resolve-report.js";
export * from "./curate.js";
export * from "./noticeboard.js";
// The graded claim-ledger verbs (ADR-0200 D2): claim / upgrade / downgrade / release / claims —
// the noticeboard IS the claim ledger; declare/done stay byte-compatible in ./noticeboard.js.
export * from "./noticeboard-claims.js";
export * from "./ambient-presence.js";
export * from "./db-control.js";
// The read/orientation surface (the ADR-0112 pattern, applied to the ADR-0108 orientation gap):
// the tree view, the library dashboard + its health checks and doctrine pointers, and the
// composed read-only orientation runner the desktop sidecar hands to the chat session.
export * from "./tree.js";
export * from "./tree-verdicts.js";
export * from "./tree-attestations.js";
export * from "./health.js";
export * from "./doctrine.js";
export * from "./library-dashboard.js";
export * from "./orientation-runner.js";
export * from "./orientation-reads.js";
