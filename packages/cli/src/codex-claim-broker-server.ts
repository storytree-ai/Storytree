// Back-compat shim after the codex-claim-broker move to @storytree/notice-board (ADR-0375):
// apps/desktop may not import @storytree/cli (ADR-0112), but the broker is claim machinery that
// @storytree/notice-board already owns, so it now lives at @storytree/notice-board/codex-broker
// (server.ts for this file's former content). Re-exported here so cli files importing
// "./codex-claim-broker-server.js" are unchanged (the packages/cli/src/secrets.ts shim precedent).
export * from "@storytree/notice-board/codex-broker";
