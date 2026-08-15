// @storytree/notice-board/codex-broker — the Codex out-of-sandbox claim broker (ADR-0355/ADR-0368/
// ADR-0375), moved here from `packages/cli/src/codex-claim-broker*.ts` and
// `codex-session-containment.ts`'s topology half so a host that may not import `@storytree/cli`
// (`apps/desktop`, ADR-0112) can still hold the broker. NEVER re-exported from the root `.` barrel,
// which the studio's browser bundle imports.
//
// `packages/cli/src/codex-claim-broker*.ts` are now thin re-export shims over this subpath, so every
// existing cli import keeps working unchanged (the `packages/cli/src/secrets.ts` shim precedent,
// ADR-0112).
//
// ## `resident.ts` is deliberately NOT re-exported here — read this before "completing" the barrel
//
// It is the one module that opens a Cloud SQL pool, so re-exporting it drags the connector into
// every bundle of every consumer. That is not hypothetical: adding it here broke
// `codex-worktree-create-entry.test.ts`'s bundle assertion, because the sandboxed LOBBY BOOTSTRAP
// dials the broker through `client.ts` and would have shipped the connector with it — the exact
// property ADR-0368 exists to establish (the bootstrap holds NO credential, since it runs as the
// account every credential path is denied to).
//
// A host that means to HOLD the authority imports `@storytree/notice-board/codex-broker/resident`
// explicitly, which is a short import and an honest one: opening a database pool should be a thing
// you asked for by name.
export * from "./topology.js";
export * from "./broker.js";
export * from "./door.js";
export * from "./server.js";
export * from "./client.js";
