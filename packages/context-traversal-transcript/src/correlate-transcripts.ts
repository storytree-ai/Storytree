/**
 * The join between a storytree session id and the host transcript windows written inside its
 * worktree (ADR-0235 clause 6), story `context-traversal-transcript`, capability
 * `transcript-session-correlation`.
 *
 * A host transcript session id is a harness-minted UUID; a storytree `sessionId` is the basename of
 * a `.claude/worktrees/<name>` git toplevel. Nothing joins them directly — what DOES join them is
 * the one fact both records carry: the working directory. Every transcript line records the `cwd`
 * it was written under, so a transcript belongs to storytree session `S` exactly when it was written
 * inside `S`'s worktree.
 *
 * That join is cwd-based, and the cwd is what makes it safe to scan the whole transcript root rather
 * than a session's own project directory. Measured across 631 project directories on 2026-08-21:
 * of 1,074 subagent transcripts, ZERO record a cwd inside a real storytree worktree other than the
 * one their parent transcript ran in, so widening the scan cannot attribute a window to the wrong
 * session. Two shapes correlate to nobody and are omitted rather than guessed at: a subagent whose
 * cwd pinned to the main checkout at spawn (176 files), and a worktree-ISOLATED subagent, which gets
 * its own `.claude/worktrees/agent-<id>` and therefore derives its own identity (57 files).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface CorrelatedWindow {
  /** The host session id recorded on the transcript's lines — this window's identity. */
  readonly windowId: string;
  /** Absolute path to the transcript file. */
  readonly file: string;
  /** The earliest `timestamp` seen on a correlating line, used only for ordering. */
  readonly firstObservedAt: string;
}

export interface TranscriptCorrelation {
  /** The storytree session id that was asked about, echoed back. */
  readonly sessionId: string;
  /** Every correlated window, oldest first. Empty is a normal result, never an error. */
  readonly windows: readonly CorrelatedWindow[];
  /** Every `*.jsonl` file considered — the honest denominator for "0 correlated". */
  readonly scannedFiles: number;
  /**
   * Files that correlated to this session but spoke ONLY for subagent windows, so they named no
   * host window of their own and are absent from {@link windows}.
   *
   * This is the size of a real blind spot, reported rather than left silent: a subagent burns
   * context inside this session's worktree, and 58-63% of decision-record reads across this repo's
   * transcripts are subagent reads. Whether those windows should become occupancy events, and under
   * which identity, is a separate open decision — this count is what makes the omission visible
   * while it stands.
   */
  readonly sidechainFiles: number;
}

const TRANSCRIPT_DIR_ENV = "STORYTREE_TRANSCRIPT_DIR";

/**
 * The host transcript root: `STORYTREE_TRANSCRIPT_DIR` when set (env always wins), else
 * `~/.claude/projects`. Mirrors `resolveTraversalDir()` in `@storytree/context-traversal-capture`
 * exactly. Never called by {@link correlateTranscripts}, which takes an explicit `dir` — that split
 * keeps every test in this package HOME-independent.
 */
export function resolveTranscriptDir(): string {
  const override = process.env[TRANSCRIPT_DIR_ENV];
  if (override !== undefined && override.trim().length > 0) return override;
  return path.join(os.homedir(), ".claude", "projects");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Splits a `cwd` into path segments, accepting `/` and `\` interchangeably, dropping empties (so
 * a trailing separator, a leading separator, and a doubled separator all collapse harmlessly). */
function segmentsOf(cwd: string): string[] {
  return cwd
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment.length > 0);
}

/**
 * True when `cwd` is, or is nested inside, a directory whose path carries the CONSECUTIVE segments
 * `.claude`, `worktrees`, `<sessionId>` — anywhere in the path, exact string equality on the
 * session segment. Segments present but out of order, or a session segment that merely starts with
 * or is a prefix of `sessionId`, never correlate.
 */
function correlatesTo(cwd: string, sessionId: string): boolean {
  const segments = segmentsOf(cwd);
  for (let i = 0; i <= segments.length - 3; i++) {
    if (segments[i] === ".claude" && segments[i + 1] === "worktrees" && segments[i + 2] === sessionId) {
      return true;
    }
  }
  return false;
}

/**
 * How many directory levels below the transcript root the scan descends.
 *
 * The host writes transcripts at THREE different depths, measured on disk 2026-08-21 across 631
 * project directories (4,044 `*.jsonl` files); depth is counted as directories descended below the
 * root:
 *
 * | depth | shape                                                       | files |
 * | ----- | ----------------------------------------------------------- | ----- |
 * | 1     | `<project>/<window>.jsonl`                                   | 2,970 |
 * | 3     | `<project>/<window>/subagents/<agent>.jsonl`                 |   771 |
 * | 5     | `<project>/<window>/subagents/workflows/<wf>/<agent>.jsonl`  |   303 |
 *
 * A scan bounded at depth 1 therefore reached the parent windows and NONE of the 1,074 subagent
 * windows — it spent its one level on `<window>/`, an intermediate directory holding no transcript
 * at all, and stopped exactly one short of `subagents/`. Bounding at 3 would still have missed the
 * 303 workflow-subagent files, so this constant is deliberately set one level BELOW nothing and one
 * level ABOVE the deepest shape observed: the headroom is what keeps a further nesting level from
 * silently re-blinding the scan the way the depth-1 bound did.
 *
 * The bound is kept rather than removed because an unbounded walk of the transcript root is a real
 * cost — the scan already reads every file it finds — and because a bound is the cheap guard
 * against a pathological tree. The two protections the original bound carried are unchanged and do
 * NOT depend on the depth: recursion happens only for `entry.isDirectory()`, which is false for a
 * symlink or a Windows junction, so the walk still never follows anything that is not a real
 * directory; and a session is still never inferred from a directory NAME, only from a recorded `cwd`.
 */
const MAX_SCAN_DEPTH = 6;

/**
 * Every `*.jsonl` at or below `dir`, to {@link MAX_SCAN_DEPTH} directory levels, never following
 * anything that is not a real directory. Unreadable directories degrade to "no files found there"
 * rather than throwing, so one unreadable project cannot blind the whole scan.
 *
 * EXPORTED so the decision-read ingest (`ingest-decision-reads.ts`) walks the SAME tree at the SAME
 * bound rather than growing a second walk beside it — a duplicate walk is how one of them ends up
 * fixed and the other left at the depth-1 bound that once hid every subagent transcript. The depth
 * rule itself belongs to {@link MAX_SCAN_DEPTH} above and is not this export's to vary.
 */
export function collectTranscriptFiles(dir: string, maxDepth: number = MAX_SCAN_DEPTH): string[] {
  const files: string[] = [];

  const visit = (current: string, depth: number): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isFile()) {
        if (entry.name.endsWith(".jsonl")) files.push(full);
      } else if (entry.isDirectory() && depth < maxDepth) {
        visit(full, depth + 1);
      }
    }
  };

  visit(dir, 0);
  return files;
}

interface CorrelatingLine {
  readonly windowId: string;
  readonly timestamp: string;
}

interface FileCorrelation {
  /** Correlating lines that speak for the host window itself — the only ones a window is built from. */
  readonly windowLines: CorrelatingLine[];
  /** Correlating lines a SUBAGENT wrote: real context, but not this file's own window identity. */
  readonly sidechainLines: number;
}

/**
 * Every line in `filePath` whose `cwd` correlates to `sessionId`, split by who wrote it.
 *
 * The split exists because a subagent transcript stamps its PARENT's `sessionId` on every line
 * (measured 2026-08-21: 188/188 subagent files under `~/.claude/projects` record the parent window's
 * id, carrying their own identity in `agentId` instead). Admitting those lines as window lines would
 * therefore mint a SECOND `CorrelatedWindow` bearing an id the parent's own transcript already
 * claims — turning one host window into several and making `windows.length` count transcript files
 * rather than windows. They are counted instead, so the omission is reported rather than silent.
 *
 * Never throws: an unreadable file, a non-JSON line, or a line missing `cwd`/`sessionId`/`timestamp`
 * simply contributes nothing.
 */
function readCorrelatingLines(filePath: string, sessionId: string): FileCorrelation {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return { windowLines: [], sidechainLines: 0 };
  }

  const windowLines: CorrelatingLine[] = [];
  let sidechainLines = 0;
  for (const rawLine of raw.split(/\r?\n/)) {
    if (rawLine.trim() === "") continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawLine);
    } catch {
      continue;
    }
    if (!isPlainObject(parsed)) continue;

    const cwd = parsed.cwd;
    const windowId = parsed.sessionId;
    const timestamp = parsed.timestamp;
    if (typeof cwd !== "string" || typeof windowId !== "string" || typeof timestamp !== "string") continue;
    if (!correlatesTo(cwd, sessionId)) continue;

    if (parsed.isSidechain === true) {
      sidechainLines++;
      continue;
    }

    windowLines.push({ windowId, timestamp });
  }
  return { windowLines, sidechainLines };
}

/** A file correlates when at least one of its lines does; a file whose correlating lines disagree
 * about `windowId` is refused rather than guessed at. */
function windowFromLines(file: string, lines: readonly CorrelatingLine[]): CorrelatedWindow | undefined {
  if (lines.length === 0) return undefined;

  const distinctIds = new Set(lines.map((line) => line.windowId));
  if (distinctIds.size !== 1) return undefined;
  const [windowId] = distinctIds;
  if (windowId === undefined) return undefined;

  let firstObservedAt: string | undefined;
  for (const line of lines) {
    if (firstObservedAt === undefined || Date.parse(line.timestamp) < Date.parse(firstObservedAt)) {
      firstObservedAt = line.timestamp;
    }
  }
  if (firstObservedAt === undefined) return undefined;

  return { windowId, file, firstObservedAt };
}

export function correlateTranscripts(
  sessionId: string,
  location: { readonly dir: string },
): TranscriptCorrelation {
  const files = collectTranscriptFiles(location.dir);

  const windows: CorrelatedWindow[] = [];
  let sidechainFiles = 0;
  for (const file of files) {
    const { windowLines, sidechainLines } = readCorrelatingLines(file, sessionId);
    const window = windowFromLines(file, windowLines);
    if (window !== undefined) {
      windows.push(window);
    } else if (sidechainLines > 0) {
      // Correlated by cwd, but every correlating line was a subagent's: a real window this scan
      // reaches and cannot yet name, counted so "0 correlated" and "reached but omitted" differ.
      sidechainFiles++;
    }
  }

  windows.sort((a, b) => Date.parse(a.firstObservedAt) - Date.parse(b.firstObservedAt));

  return { sessionId, windows, scannedFiles: files.length, sidechainFiles };
}
