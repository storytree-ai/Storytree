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
// The derived arc → children join (ADR-0183 D3 / ADR-0267 D4): ONE rollup the cli renders and the
// studio server serves, so the two surfaces can never disagree about what an arc contains.
export * from "./arc-rollup.js";
export * from "./node-build.js";
// Per-slice token-usage persistence (accounting, never proof): the SdkRunInfo → UsageEventDoc
// mapping + the advisory append the build paths run after proveUnit.
export * from "./usage.js";
export * from "./story-build.js";
export * from "./adopt.js";
export * from "./orchestrate.js";
export * from "./chat-stream.js";
// The ADR-0137 spawn-deps composition (`buildSpawnDeps`) and the ADR-0152 landing-deps composition
// (`buildLandingDeps`) were exported here until ADR-0175 retired both surfaces with the interactive
// orchestrator (ADR-0174) rather than re-aiming them into `app-guide`. Deliberately absent — see
// apps/desktop/src/backend/{spawn,landing}-surface-retired.test.ts, the guards that keep them gone.
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
// the noticeboard IS the claim ledger; declare/done live in ./noticeboard.js as the claim-taking
// anchor ceremony + bulk release (presence retired, ADR-0200 D7).
export * from "./noticeboard-claims.js";
// The session-isolation wall (ADR-0255 D1, ADR-0257 D1, narrowed by ADR-0284): the STATIC
// `permissions.deny` block that makes the primary checkout unwritable by the agent's file tools,
// generated from `repo-manifest.json` so the lobby surface and the wall cannot drift apart.
//
// This is the WHOLE wall. The claim-aware `PreToolUse` half — the decision core, the claim receipt
// and the Claude adapter — was RETIRED by ADR-0284 D2/D4, never registered, and deleted rather than
// parked: a hook blocks only on exit code 2, so an absent script or a crash lets the write through,
// which is not an authority boundary. Recover it from git if the Codex adapter (ADR-0257 D2/D3/D7)
// ever needs the containment logic.
export * from "./write-authority-rules.js";
// The ambient session surface (statusline glance + claim heartbeat + the SessionStart nudge +
// the never-blocking-hooks audit) — ledger-sourced since the presence retirement (ADR-0200 D5/D7).
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
