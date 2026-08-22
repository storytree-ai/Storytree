/**
 * DRAIN OBSERVABILITY for the worktree reaper (worktree-reaper-integrity-arc, strand 3).
 *
 * THE DEFECT THIS CLOSES. The SessionStart reaper is silent-on-success AND silent-on-nothing-to-do by
 * contract, so a reaper that has drained nothing for weeks is indistinguishable from a healthy one.
 * That is why the poisoned idle clock (strand 1) rotted unseen while `.claude/worktrees/` grew to ~93
 * GB: every run held back 59 merged-clean worktrees for the same reason, every run said nothing, and
 * the only way to learn it was an owner running a manual stock take. It is an uninstrumented instance
 * of the failure class `verification-integrity-arc` exists to fence — a check that cannot go red.
 *
 * THE SHAPE. Three pure pieces, no IO of their own beyond a narrow injected ledger seam:
 *   1. {@link buildDrainRecord} — one run compressed to counts: population, what was reaped, and the
 *      keeps bucketed by {@link HoldReason}. Silence is replaced by a NUMBER, including zero.
 *   2. the LEDGER (`.claude/worktrees/.prune-history.jsonl`) — every EXECUTING run appends one line,
 *      so "held back N candidates every run for a week" becomes a readable series rather than an
 *      absence. Dry runs are deliberately NOT recorded: a dry run drains nothing by design, and
 *      logging it as `reaped 0` would manufacture a stall that never happened.
 *   3. {@link classifyDrainHealth} — the series read as ok / warn / FAIL. This is the half that can go
 *      red on its own, which the arc requires; the hook's silent-on-failure contract still covers
 *      crashes, but silence is no longer the signal for "nothing drained".
 *
 * WHAT MAKES THE RED HONEST. A busy factory that drains slower than it grows is not broken, so raw
 * "population is large" or "reaped 0 today" would cry wolf. The signature that IS broken is a full
 * idle-threshold period passing with a substantial COOLING cohort — worktrees reapable in every way
 * except idle — and nothing ever crossing. With an honest clock those must convert to reaps within a
 * threshold period; with the poisoned clock none of them ever could. So the red is bounded by the
 * reaper's own threshold, and the census beside it names which bucket is absorbing the population so
 * the reader is never left to guess whether it is the clock, a lock, or a dirty backlog.
 *
 * Values here are imported BY `worktree.ts`; the types it needs flow back as `import type` (erased),
 * so the dependency runs one way and there is no module cycle.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { HoldReason, WorktreeVerdict } from "./worktree.js";

// ---------------------------------------------------------------------------
// The record — one reaper run, compressed to counts
// ---------------------------------------------------------------------------

/** Every {@link HoldReason} counted, zero-filled — never a sparse map, so `min` across runs is safe. */
export type DrainHoldCounts = Readonly<Record<HoldReason, number>>;

/**
 * The display order for the hold census. `cooling` leads deliberately: it is the near-miss cohort a
 * healthy drain converts into reaps, so it is the first number worth reading.
 */
export const HOLD_ORDER: readonly HoldReason[] = [
  "cooling",
  "unmerged",
  "dirty",
  "locked",
  "detached",
  "live",
  "anchor",
];

const ZERO_HOLDS = {
  cooling: 0,
  unmerged: 0,
  dirty: 0,
  locked: 0,
  detached: 0,
  live: 0,
  anchor: 0,
} satisfies DrainHoldCounts;

/** One reaper run, as recorded on the ledger. Counts only — never a path list (this file is durable). */
export interface DrainRecord {
  /** Epoch ms the run finished. */
  readonly at: number;
  /** Did this run actually remove? A dry run drains nothing BY DESIGN and never proves a stall. */
  readonly executed: boolean;
  /** Every worktree under `.claude/worktrees/` this run considered. */
  readonly population: number;
  readonly registered: number;
  readonly orphan: number;
  /** Verdicts that said reap, after the confirm-clean pass. */
  readonly reapable: number;
  /** Actually removed (0 on a dry run, and 0 whenever the drain is stalled). */
  readonly reaped: number;
  /** Removals that failed (a wedged dir, a Windows lock). */
  readonly failed: number;
  /** Reapable but left for a later run by `--cap` / the hook cap. */
  readonly capped: number;
  /** The keeps, bucketed — the census that makes a held-back cohort legible. */
  readonly held: DrainHoldCounts;
}

/** Tally the keeps in a verdict set by bucket. */
export function tallyHolds(verdicts: readonly WorktreeVerdict[]): DrainHoldCounts {
  const held = { ...ZERO_HOLDS } satisfies Record<HoldReason, number>;
  for (const v of verdicts) {
    if (v.hold !== null) held[v.hold] += 1;
  }
  return held;
}

export interface DrainRunOutcome {
  readonly at: number;
  readonly executed: boolean;
  readonly reaped: number;
  readonly failed: number;
  readonly capped: number;
}

/** Compress one run's verdicts + removal outcome into the durable record. */
export function buildDrainRecord(
  verdicts: readonly WorktreeVerdict[],
  outcome: DrainRunOutcome,
): DrainRecord {
  return {
    at: outcome.at,
    executed: outcome.executed,
    population: verdicts.length,
    registered: verdicts.filter((v) => v.kind === "registered").length,
    orphan: verdicts.filter((v) => v.kind === "orphan").length,
    reapable: verdicts.filter((v) => v.decision === "reap").length,
    reaped: outcome.reaped,
    failed: outcome.failed,
    capped: outcome.capped,
    held: tallyHolds(verdicts),
  };
}

// ---------------------------------------------------------------------------
// The ledger — an append-only JSONL series beside the prune lock
// ---------------------------------------------------------------------------

/** Keep the series bounded: ~200 runs is weeks of history at a few KB, and it never needs rotating. */
export const DRAIN_HISTORY_LIMIT = 200;

/** The ledger path. A FILE inside the worktrees dir, so `listChildDirs` never sees it as a candidate. */
export function drainLedgerPath(worktreesDir: string): string {
  return path.join(worktreesDir, ".prune-history.jsonl");
}

/** The narrow ledger seam — kept off {@link WorktreeIo} so existing IO stubs are untouched. */
export interface DrainLedgerIo {
  /** Whole-file read; null when absent or unreadable (an absent ledger is "no history", not an error). */
  read(file: string): string | null;
  /** Whole-file write. The series is trimmed to {@link DRAIN_HISTORY_LIMIT} first, so this stays small. */
  write(file: string, text: string): void;
}

export const defaultDrainLedgerIo: DrainLedgerIo = {
  read(file) {
    try {
      return readFileSync(file, "utf8");
    } catch {
      return null;
    }
  },
  write(file, text) {
    writeFileSync(file, text, "utf8");
  },
};

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/**
 * Parse the ledger. Malformed lines are SKIPPED, never thrown on: a half-written line from a killed
 * run must not blind the whole series (a parser that dies on bad input is its own silent failure).
 * Missing hold buckets zero-fill, so a record written by an older build still counts.
 */
export function parseDrainHistory(text: string | null): DrainRecord[] {
  if (text === null) return [];
  const out: DrainRecord[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const at = num(r["at"], NaN);
    if (!Number.isFinite(at)) continue;
    const heldRaw = (typeof r["held"] === "object" && r["held"] !== null ? r["held"] : {}) as Record<
      string,
      unknown
    >;
    const held = { ...ZERO_HOLDS } satisfies Record<HoldReason, number>;
    for (const k of HOLD_ORDER) held[k] = num(heldRaw[k]);
    out.push({
      at,
      executed: r["executed"] === true,
      population: num(r["population"]),
      registered: num(r["registered"]),
      orphan: num(r["orphan"]),
      reapable: num(r["reapable"]),
      reaped: num(r["reaped"]),
      failed: num(r["failed"]),
      capped: num(r["capped"]),
      held,
    });
  }
  out.sort((a, b) => a.at - b.at);
  return out;
}

/** Serialise a series back to JSONL, trimmed to the newest {@link DRAIN_HISTORY_LIMIT} records. */
export function serialiseDrainHistory(history: readonly DrainRecord[]): string {
  const kept = history.slice(-DRAIN_HISTORY_LIMIT);
  return kept.map((r) => JSON.stringify(r)).join("\n") + (kept.length > 0 ? "\n" : "");
}

export function readDrainHistory(io: DrainLedgerIo, file: string): DrainRecord[] {
  return parseDrainHistory(io.read(file));
}

export interface RecordResult {
  readonly ok: boolean;
  readonly error?: string;
}

/**
 * Append one record. Returns a result rather than throwing — a ledger that cannot be written must not
 * fail the prune it was observing, but it must not be swallowed in silence either: the caller prints
 * the reason (which is, itself, the drain going un-observed).
 */
export function recordDrainRun(
  io: DrainLedgerIo,
  file: string,
  record: DrainRecord,
): RecordResult {
  try {
    io.write(file, serialiseDrainHistory([...parseDrainHistory(io.read(file)), record]));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// The health verdict — the half that can go red
// ---------------------------------------------------------------------------

/** Fewer executing runs than this cannot tell a stall from a quiet afternoon. */
export const DRAIN_MIN_RUNS = 4;
/**
 * A cooling cohort at least this large must yield SOME reap within one idle-threshold period. Below
 * it, "reaped 0" is ordinary — a handful of near-misses can legitimately all be touched again.
 */
export const DRAIN_COOLING_FLOOR = 10;
/** No executing run for this long means the reaper itself stopped, which is its own kind of blind. */
export const DRAIN_STOPPED_MS = 7 * 24 * 60 * 60 * 1000;
/** Draining, but the population still gained this much across the window — losing ground. */
export const DRAIN_GROWTH_WARN = 15;

export type DrainHealth = "ok" | "unproven" | "stopped" | "outpaced" | "stalled";
export type DrainLevel = "ok" | "warn" | "fail";

export interface DrainVerdict {
  readonly status: DrainHealth;
  readonly level: DrainLevel;
  readonly headline: string;
  readonly detail: readonly string[];
}

export interface DrainHealthOpts {
  readonly now: number;
  /** The reaper's idle threshold — the window a stall must span before it is provable, not guessed. */
  readonly thresholdMs: number;
}

const hours = (ms: number): string => `${Math.round(ms / 3_600_000)}h`;
const days = (ms: number): string => `${Math.floor(ms / 86_400_000)}d`;

/**
 * Read the recorded series as a health verdict.
 *
 * Only EXECUTING runs are judged: a dry run reaps nothing by design, so counting it would let a week
 * of dry runs fake a stall (and, worse, let a real stall hide behind them).
 */
export function classifyDrainHealth(
  history: readonly DrainRecord[],
  opts: DrainHealthOpts,
): DrainVerdict {
  const runs = history.filter((r) => r.executed).sort((a, b) => a.at - b.at);
  const newest = runs[runs.length - 1];
  const oldest = runs[0];

  if (newest === undefined || oldest === undefined) {
    return {
      status: "unproven",
      level: "warn",
      headline: "no executing reaper run has ever been recorded — the drain is unproven",
      detail: [
        "The SessionStart hook records every run it executes; an empty ledger means it has not run",
        "here yet (a fresh checkout), or it is failing before it reaches the ledger.",
      ],
    };
  }

  const since = opts.now - newest.at;
  if (since >= DRAIN_STOPPED_MS) {
    return {
      status: "stopped",
      level: "warn",
      headline: `the reaper has not executed for ${days(since)} — the SessionStart hook may be broken`,
      detail: [
        `last recorded run: ${new Date(newest.at).toISOString()} (reaped ${newest.reaped}, population ${newest.population})`,
        "check scripts/worktree-prune-hook.sh and .claude/settings.json.",
      ],
    };
  }

  const span = newest.at - oldest.at;
  const reaped = runs.reduce((n, r) => n + r.reaped, 0);
  const minCooling = Math.min(...runs.map((r) => r.held.cooling));
  const window = `${runs.length} run(s) over ${hours(span)}`;
  const base = [
    `window: ${new Date(oldest.at).toISOString()} → ${new Date(newest.at).toISOString()} (${window})`,
    `reaped across the window: ${reaped}`,
    `population: ${oldest.population} → ${newest.population}`,
  ];

  // A stall is only PROVABLE once a full idle-threshold period has been observed: a worktree that
  // entered the cooling cohort at age 0 needs exactly that long to become reapable.
  const provable = runs.length >= DRAIN_MIN_RUNS && span >= opts.thresholdMs;

  if (provable && reaped === 0 && minCooling >= DRAIN_COOLING_FLOOR) {
    return {
      status: "stalled",
      level: "fail",
      headline:
        `the drain is STALLED — ${window} (a full ${hours(opts.thresholdMs)} idle period) reaped 0 ` +
        `while at least ${minCooling} worktrees sat cooling throughout`,
      detail: [
        ...base,
        `smallest cooling cohort seen: ${minCooling} (floor ${DRAIN_COOLING_FLOOR})`,
        "A cooling worktree is reapable in every way EXCEPT idle, so with an honest clock some of",
        "these must have crossed the threshold. None did. Read the hold census below to see which",
        "bucket is absorbing them — a poisoned idle clock, a lock with no releaser, and a dirty",
        "backlog all look like this from here, and they have different remedies.",
      ],
    };
  }

  if (!provable) {
    return {
      status: "unproven",
      level: "warn",
      headline:
        `the drain is unproven — only ${window}; a stall needs ${DRAIN_MIN_RUNS} runs spanning ` +
        `${hours(opts.thresholdMs)} (one full idle period) before it can be called`,
      detail: base,
    };
  }

  if (newest.population - oldest.population >= DRAIN_GROWTH_WARN) {
    return {
      status: "outpaced",
      level: "warn",
      headline:
        `the drain is OUTPACED — it reaped ${reaped} across ${window}, but the population still grew ` +
        `${oldest.population} → ${newest.population}`,
      detail: [
        ...base,
        "Worktrees are being created faster than they are provably dead. Not a defect in the reaper;",
        "a signal that the threshold, the hook cap, or the creation rate needs the owner's attention.",
      ],
    };
  }

  return {
    status: "ok",
    level: "ok",
    headline: `the drain is live — ${reaped} reaped across ${window}`,
    detail: base,
  };
}

/**
 * Should the SessionStart hook SPEAK about this verdict?
 *
 * The hook is silent-on-success and silent-on-nothing-to-do by contract, and that is precisely how a
 * reaper that had drained nothing for weeks stayed indistinguishable from a healthy one. So silence
 * is no longer the signal for "nothing drained" — but the cure must not be a nag either.
 *
 * `unproven` is deliberately SILENT here. It is the honest state of a fresh ledger for the first
 * ~48 h, and a heads-up printed at every session start for two days would train the reader to filter
 * this channel out — recreating the blindness by a different route. It is not hidden: `storytree
 * worktree drain` reports it on demand. The three states below are the ones a reader can act on.
 */
export function shouldAnnounceDrain(status: DrainHealth): boolean {
  return status === "stalled" || status === "outpaced" || status === "stopped";
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** `cooling 57 · unmerged 9 · locked 6` — zero buckets omitted, cooling always first. */
export function formatHolds(held: DrainHoldCounts): string {
  const parts = HOLD_ORDER.filter((k) => held[k] > 0).map((k) => `${k} ${held[k]}`);
  return parts.length > 0 ? parts.join(" · ") : "none";
}

/**
 * The population census for ONE run — the "manual stock take" the arc says an owner should never
 * have to perform, printed on every prune whether or not anything was reaped.
 */
export function formatDrainCensus(record: DrainRecord): string[] {
  const heldTotal = HOLD_ORDER.reduce((n, k) => n + record.held[k], 0);
  return [
    `POPULATION ${record.population} under .claude/worktrees/ (${record.registered} registered, ${record.orphan} orphaned)`,
    `  reapable  ${String(record.reapable).padStart(4)}` +
      (record.executed
        ? `   reaped ${record.reaped}${record.failed > 0 ? `, failed ${record.failed}` : ""}${record.capped > 0 ? `, capped ${record.capped}` : ""}`
        : "   (survey only — nothing removed)"),
    `  held      ${String(heldTotal).padStart(4)}   ${formatHolds(record.held)}`,
  ];
}

/** The health verdict as printable lines, tagged OK / WARN / FAIL like the house checks. */
export function formatDrainHealth(verdict: DrainVerdict): string[] {
  const tag = verdict.level === "fail" ? "FAIL" : verdict.level === "warn" ? "WARN" : "OK";
  return [`DRAIN ${tag} — ${verdict.headline}`, ...verdict.detail.map((d) => `  ${d}`)];
}
