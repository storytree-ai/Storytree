// Back-compat shim after the codex-claim-broker move to @storytree/notice-board (ADR-0375):
// apps/desktop may not import @storytree/cli (ADR-0112), but the broker is claim machinery that
// @storytree/notice-board already owns, so it now lives at @storytree/notice-board/codex-broker
// (resident.ts for this file's former content). Re-exported here so cli files importing
// "./codex-claim-broker-resident.js" (notably codex-claim-broker-entry.ts, a real entry point, not
// a shim) are unchanged (the packages/cli/src/secrets.ts shim precedent).
// The `/resident` subpath, NOT the barrel: this module opens a Cloud SQL pool and is kept OFF the
// barrel so the sandboxed lobby bootstrap (which dials the broker's client) cannot ship the connector
// transitively — the property `codex-worktree-create-entry.test.ts` asserts at bundle level.
export * from "@storytree/notice-board/codex-broker/resident";
