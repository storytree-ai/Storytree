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

function listJsonlFiles(dirPath: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl")).map((entry) => path.join(dirPath, entry.name));
}

/** Walks `dir` itself plus one level of sub-directories, never deeper, never following anything
 * that is not a regular file. Unreadable directories degrade to "no files found there". */
function collectTranscriptFiles(dir: string): string[] {
  let topEntries: fs.Dirent[];
  try {
    topEntries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of topEntries) {
    if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(path.join(dir, entry.name));
    } else if (entry.isDirectory()) {
      files.push(...listJsonlFiles(path.join(dir, entry.name)));
    }
  }
  return files;
}

interface CorrelatingLine {
  readonly windowId: string;
  readonly timestamp: string;
}

/** Every line in `filePath` whose `cwd` correlates to `sessionId`. Never throws: an unreadable
 * file, a non-JSON line, or a line missing `cwd`/`sessionId`/`timestamp` simply contributes nothing. */
function readCorrelatingLines(filePath: string, sessionId: string): CorrelatingLine[] {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }

  const lines: CorrelatingLine[] = [];
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

    lines.push({ windowId, timestamp });
  }
  return lines;
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
  for (const file of files) {
    const lines = readCorrelatingLines(file, sessionId);
    const window = windowFromLines(file, lines);
    if (window !== undefined) windows.push(window);
  }

  windows.sort((a, b) => Date.parse(a.firstObservedAt) - Date.parse(b.firstObservedAt));

  return { sessionId, windows, scannedFiles: files.length };
}
