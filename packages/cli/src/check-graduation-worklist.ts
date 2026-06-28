// Best-effort OFFLINE agent-memory graduation nudge (ADR-0095 Decision 7), wired into `pnpm gate`.
//
// The graduation engine is offline — it reads the harness agent-memory dir + the seed snapshot, no
// DB — so unlike check:corpus-sync this ALWAYS runs (no creds, no network). It surfaces, at the
// pre-merge moment, how many durable-memory CANDIDATES await a librarian graduation pass: the missing
// PROMPT that makes the learning loop turn (ADR-0095 runs graduation as a pre-merge librarian step,
// but nothing was surfacing the worklist, so it fired ~once). It NEVER writes and NEVER fails the gate.
//
//   - memory store present + novel candidates -> WARN naming the count + `library graduate --review`.
//   - memory store present + zero candidates  -> OK.
//   - memory store / seed absent (fresh worktree, CI, web container) -> SKIP.
//
// The judgment stays the librarian-curator's: this only counts candidates, it does not decide which
// are genuinely durable (most are event-specific and rejected, ADR-0095 D8). WARN-only, exit 0 always.

import os from "node:os";

import { graduationCandidates, novelCandidates, type LibrarySnapshot } from "@storytree/library";

import {
  GRADUATION_NUDGE_TAG as TAG,
  defaultMemoryDir,
  defaultSnapshotPath,
  graduationNudge,
  readMemoryDir,
  readSnapshot,
  type MemoryReadResult,
} from "./graduate.js";

function main(): void {
  const memoryDir = defaultMemoryDir(os.homedir());

  let read: MemoryReadResult;
  try {
    read = readMemoryDir(memoryDir);
  } catch {
    // No harness agent-memory store here (fresh worktree / CI / web container) — nothing to surface.
    console.log(`${TAG} SKIP — no agent-memory store at ${memoryDir}; nothing to surface.`);
    return;
  }

  let snapshot: LibrarySnapshot;
  try {
    snapshot = readSnapshot(defaultSnapshotPath());
  } catch (e) {
    console.log(`${TAG} SKIP — could not read the seed snapshot (${(e as Error).message}); worklist unverified.`);
    return;
  }

  const now = new Date().toISOString().slice(0, 10);
  const novel = novelCandidates(graduationCandidates(read.memories, snapshot, { now })).length;
  const nudge = graduationNudge(novel);
  const emit = nudge.level === "WARN" ? console.warn : console.log;
  for (const line of nudge.lines) emit(line);

  // Surface unparseable memory files too — honesty over a silent drop (ADR-0095) — but never fail.
  if (read.unparseable.length > 0) {
    console.warn(`${TAG}   (${read.unparseable.length} memory file(s) unparseable — see \`storytree library graduate --review\`.)`);
  }
  // WARN-only: never sets a non-zero exit code.
}

try {
  main();
} catch (err) {
  // Even an unexpected error is advisory only — never fail the gate on the graduation nudge.
  console.log(`${TAG} SKIP — unexpected error (${(err as Error).message}); worklist unverified.`);
}
