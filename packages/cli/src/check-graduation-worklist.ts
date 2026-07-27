// Best-effort OFFLINE agent-memory graduation nudge (ADR-0095 Decision 7, park-lease-filtered per
// ADR-0202), wired into `pnpm gate`.
//
// The graduation engine is offline — it reads the harness agent-memory dir + the seed snapshot +
// the machine-local park ledger, no DB — so unlike check:corpus-sync this ALWAYS runs (no creds, no
// network). It surfaces, at the pre-merge moment, how many LIVE durable-memory CANDIDATES await a
// librarian pass: only candidates that are NEW (no park record), CHANGED (their content hash broke
// since review), or LEASE-EXPIRED count (ADR-0202 D4 — the WARN is normally zero and meaningful
// when it isn't; parked candidates are silenced while their lease holds, their count surfaced on
// the OK line). It NEVER writes and NEVER fails the gate.
//
//   - memory store present + live candidates  -> WARN naming the new/changed/expired breakdown.
//   - memory store present + zero live        -> OK (naming the parked count).
//   - memory store / seed absent (fresh worktree, CI, web container) -> SKIP.
//
// The judgment stays the librarian-curator's: this only counts candidates, it does not decide which
// are genuinely durable or whether a park verdict holds.
//
// FAIL-CLOSED AT A DRAIN CEILING (added by `verification-integrity-arc` under ADR-0252 D3, in
// ADR-0168 D4's shape). This was WARN-only, exit 0 always — and it is the very queue ADR-0168 cites as
// the evidence that a WARN-backed worklist with no drain OBLIGATION rots ("grew 31→58 in one session
// and drained nothing"). The ceiling itself lives in the pure `graduation-drain.ts`; this shell reads
// disk, injects the clock, and sets the exit code. The OK/WARN levels are UNCHANGED — RED is layered
// above them, so this check is strictly stronger than before and never quieter.
//
// Reachability policy is unchanged and now matters more: every SKIP path below still exits 0, and a
// breach computed against an absent/unreadable park ledger is reported but NOT enforced (fail-closed
// on the queue, fail-open on the substrate).

import { existsSync } from "node:fs";
import os from "node:os";

import {
  classifyWorklist,
  graduationCandidates,
  leaseExpiresOn,
  novelCandidates,
  type LibrarySnapshot,
} from "@storytree/library";

import {
  GRADUATION_NUDGE_TAG as TAG,
  defaultLedgerPath,
  defaultMemoryDir,
  defaultSnapshotPath,
  graduationNudge,
  readMemoryDir,
  readParkLedger,
  readSnapshot,
  type MemoryReadResult,
} from "./graduate.js";
import { evaluateGraduationDrain, type GraduationCandidate } from "./graduation-drain.js";

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
  const novel = novelCandidates(graduationCandidates(read.memories, snapshot, { now }));
  const novelNames = new Set(novel.map((c) => c.source));
  const ledgerPath = defaultLedgerPath(memoryDir);
  const { ledger, problem } = readParkLedger(ledgerPath);
  const worklist = classifyWorklist(
    read.memories.filter((m) => novelNames.has(m.name)),
    ledger,
    { now },
  );
  const nudge = graduationNudge(worklist.counts);
  const emit = nudge.level === "WARN" ? console.warn : console.log;
  for (const line of nudge.lines) emit(line);

  // ---- the drain ceiling (ADR-0168 D4's shape) ------------------------------------------------
  //
  // The ledger is USABLE only when it was both present and parseable. Absent is the normal
  // pre-backfill state and unreadable is surfaced as `problem`; either way every candidate then
  // classifies `new`, which would turn a substrate failure into a queue breach.
  const candidates: GraduationCandidate[] = worklist.entries.map((e) => {
    const record = ledger.parks[e.memory.name];
    return {
      name: e.memory.name,
      status: e.status,
      ...(e.status === "expired" && record !== undefined
        ? { leaseExpiredOn: leaseExpiresOn(record) }
        : {}),
    };
  });
  const drain = evaluateGraduationDrain(candidates, {
    currentDate: now,
    ledgerUsable: problem === undefined && existsSync(ledgerPath),
  });

  // An existing-but-invalid ledger is treated as EMPTY (everything shows live) — surfaced, never
  // silent (ADR-0095), but still advisory: the librarian fixes the ledger, the gate never reds.
  if (problem !== undefined) {
    console.warn(`${TAG}   (park ledger unreadable — treated as empty: ${problem})`);
  }
  // Surface unparseable memory files too — honesty over a silent drop (ADR-0095) — but never fail.
  // These are DROPPED from the worklist, so they can only ever under-count the backlog: an
  // unparseable memory file can never push the ceiling over.
  if (read.unparseable.length > 0) {
    console.warn(`${TAG}   (${read.unparseable.length} memory file(s) unparseable — see \`storytree library graduate --review\`.)`);
  }

  // A breach the ledger could not support is REPORTED, never enforced and never dropped.
  if (drain.suppressed !== undefined) {
    console.warn(`${TAG}   (drain ceiling not enforced — ${drain.suppressed}.)`);
    for (const b of drain.breaches) console.warn(`${TAG}     would breach: ${b}`);
    return;
  }

  if (drain.level !== "red") return;

  console.error(
    `${TAG} RED — graduation drain ceiling breached: ${drain.liveCount} live ` +
      `(${drain.newCount} new, ${drain.changedCount} changed, ${drain.expiredCount} lease-expired) · ` +
      `${drain.parkedCount} parked.`,
  );
  for (const b of drain.breaches) console.error(`${TAG}   ${b}`);
  console.error(
    `${TAG}   Landing is blocked until the pre-merge LIBRARIAN PASS drains this queue (ADR-0095 D7 /`,
  );
  console.error(
    `${TAG}   ADR-0168 D4): \`pnpm storytree library graduate --review\`, then spawn the`,
  );
  console.error(
    `${TAG}   librarian-curator — graduate the genuinely durable, PARK the keepers with a reason`,
  );
  console.error(
    `${TAG}   (\`storytree library graduate park <name> --reason "…"\`), clearing the backlog below`,
  );
  console.error(
    `${TAG}   N=${drain.config.liveCeiling} / M=${drain.config.overdueCeilingDays}d.`,
  );
  console.error(
    `${TAG}   (Queue hygiene only — this never decides what graduates. Machine-local; CI SKIPs it.)`,
  );
  // FAIL-CLOSED: only a genuine ceiling breach against a usable ledger sets a non-zero exit.
  process.exitCode = 1;
}

try {
  main();
} catch (err) {
  // Even an unexpected error is advisory only — never fail the gate on the graduation nudge.
  console.log(`${TAG} SKIP — unexpected error (${(err as Error).message}); worklist unverified.`);
}
