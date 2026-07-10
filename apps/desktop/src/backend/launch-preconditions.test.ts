// Tests for the desktop launch-precondition gate (launch-preconditions.ts, ADR-0176 §1).
//
// WHAT THIS PINS:
//   - git-first ordering: a missing git checkout refuses IMMEDIATELY with `unmet: "git-repo"` and
//     NEVER calls the injected `ensureDb` — waking the DB is pointless with no checkout to build from.
//   - the DB half passes `ensureDb`'s `EnsureDbResult` through VERBATIM: `{ ok: true, started }` becomes
//     `{ ok: true, startedDb: started }`; `{ ok: false, reason }` becomes `{ ok: false, unmet: "db",
//     reason }` — the drive refusal reason surfaces unchanged, never reworded.
//   - the happy path (repo present, DB reachable) resolves `{ ok: true, startedDb }`.
//   - `describeLaunchRefusal` renders two DISTINCT, precondition-naming messages for the two refusal
//     kinds — the "git-repo" copy names running from a git checkout; the "db" copy carries the
//     passthrough reason.
//
// This is a pure composition over injected effects (`probeGitRepo` / `ensureDb` / `log`) — no real git,
// no real DB, no live SDK — mirroring `db-control.ts`'s `ensureDbUp` and `sidecar-startup.ts`'s
// `acquireBackendStore`.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ensureLaunchPreconditions,
  describeLaunchRefusal,
} from "./launch-preconditions.js";
import type { EnsureDbResult } from "@storytree/drive";

function makeLog(): { log: (m: string) => void; lines: string[] } {
  const lines: string[] = [];
  return { log: (m: string) => lines.push(m), lines };
}

test("ensureLaunchPreconditions: no git checkout refuses immediately and NEVER calls ensureDb", async () => {
  const { log } = makeLog();
  let ensureDbCalled = false;
  const result = await ensureLaunchPreconditions({
    probeGitRepo: async () => false,
    ensureDb: async (): Promise<EnsureDbResult> => {
      ensureDbCalled = true;
      return { ok: true, started: false };
    },
    log,
  });
  assert.equal(ensureDbCalled, false, "ensureDb must never fire on the git-absent path");
  assert.deepEqual(result, {
    ok: false,
    unmet: "git-repo",
    reason: "run storytree from a git checkout",
  });
});

test("ensureLaunchPreconditions: git present + db reachable (no cold start) resolves ok with startedDb=false", async () => {
  const { log } = makeLog();
  const result = await ensureLaunchPreconditions({
    probeGitRepo: async () => true,
    ensureDb: async (): Promise<EnsureDbResult> => ({ ok: true, started: false }),
    log,
  });
  assert.deepEqual(result, { ok: true, startedDb: false });
});

test("ensureLaunchPreconditions: git present + db had to cold-start resolves ok with startedDb=true", async () => {
  const { log } = makeLog();
  const result = await ensureLaunchPreconditions({
    probeGitRepo: async () => true,
    ensureDb: async (): Promise<EnsureDbResult> => ({ ok: true, started: true }),
    log,
  });
  assert.deepEqual(result, { ok: true, startedDb: true });
});

test("ensureLaunchPreconditions: git present + db unreachable carries the drive refusal reason through unchanged", async () => {
  const { log } = makeLog();
  const dbReason =
    "the database did not accept connections within 420s of db:up. A cold Cloud SQL start usually takes ~5–6 min…";
  const result = await ensureLaunchPreconditions({
    probeGitRepo: async () => true,
    ensureDb: async (): Promise<EnsureDbResult> => ({ ok: false, reason: dbReason }),
    log,
  });
  assert.deepEqual(result, { ok: false, unmet: "db", reason: dbReason });
});

test("describeLaunchRefusal: the git-repo refusal names running from a git checkout", () => {
  const message = describeLaunchRefusal({
    ok: false,
    unmet: "git-repo",
    reason: "run storytree from a git checkout",
  });
  assert.match(message, /git checkout/);
});

test("describeLaunchRefusal: the db refusal carries the passthrough reason and differs from the git-repo copy", () => {
  const dbReason = "could not start the database: no ADC token found";
  const gitMessage = describeLaunchRefusal({
    ok: false,
    unmet: "git-repo",
    reason: "run storytree from a git checkout",
  });
  const dbMessage = describeLaunchRefusal({
    ok: false,
    unmet: "db",
    reason: dbReason,
  });
  assert.match(dbMessage, new RegExp(dbReason.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.notEqual(dbMessage, gitMessage);
});
