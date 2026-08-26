// The CONTEXT WINDOW METER's read route (`linked-session-context-arc`, increment
// `make-the-single-window-meter-useful`) — ADR-0452 D1/D2.
//
//   GET /api/context-windows   → this machine's recent session windows, each with its own fullness
//
// WHY THIS EXISTS BESIDE `/api/traversal`. The occupancy bar in the replay panel plots a series at a
// PLAYHEAD, for one trace an operator has picked out of a rail. That answers "how did this session's
// window move while it ran". It cannot answer the question ADR-0411 actually made load-bearing —
// "how full is a window, against the marks that decide whether it takes on more work" — because
// reaching it costs a pick and a scrub, and because it reads INGESTED traces.
//
// ★ AND THE INGEST IS THE REASON THIS ROUTE READS TRANSCRIPTS DIRECTLY. `residentInputTokens` reaches
// a trace only through an explicit `storytree traversal ingest <sessionId>`. Measured on this machine
// 2026-08-26: of 697 local traces, TWO carry the field. A widget built on traces would therefore be
// empty for 695 of 697 sessions and blank for the session looking at it — which is not a meter. The
// host transcripts, by contrast, are ambient: the harness writes one per window as the window runs.
// So this route reads the SAME files the ingest reads, through the SAME reader
// (`readTranscriptWindow`), and derives no parse rule of its own — the ingest and this route cannot
// come to describe one transcript differently.
//
// ★★ IT NEVER SUMS A HELPER WINDOW INTO A PARENT'S NUMBER (ADR-0413 D2, restated permanently by
// ADR-0452 D4). A helper runs an independent window that is gone by the time the parent reaches its
// own peak; adding them draws a fullness level no real window ever reached, and how close a window
// sits to its limit is the whole purpose of the reading. Helper readings ride the wire in their own
// per-file shape, beside the parent and never inside it — see `helpers` below.
//
// LOCAL ONLY, the same call ADR-0241 / the owner's 2026-08-10 decision made for traces: transcripts
// are per-machine. Hosted Cloud Run holds none, so it answers an honest empty list rather than
// inventing one, and there is deliberately no fallback that manufactures a series.

import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import { HttpError, sendJson } from './httpUtil';

// Type-only, so it is fully erased under `verbatimModuleSyntax` and never reaches the vite
// config-load graph — the runtime value is pulled by the lazy loader below, for exactly the reason
// traversalApi.ts loads its two packages lazily: vite.config.ts loads devApi.ts → apiRouter.ts
// through Node's plain ESM loader, where this package's `./transcript-occupancy.js`-style internal
// specifiers do not resolve (only the .ts files exist). `pnpm gate` does not run `vite build`, so a
// static import here would break the dev server with only CI Build to catch it.
type TranscriptModule = typeof import('@storytree/context-traversal-transcript');
let transcriptModulePromise: Promise<TranscriptModule> | null = null;
function loadTranscripts(): Promise<TranscriptModule> {
  return (transcriptModulePromise ??= import('@storytree/context-traversal-transcript'));
}

/**
 * How many session windows the widget answers with, newest first.
 *
 * A GLANCE surface, not an index: the question is "how full is the window in front of me, and how
 * do the recent ones compare", which a dozen answers and forty only crowds. The bound is also what
 * keeps the route's cost flat on a machine whose transcript root grows without limit — 3,219 parent
 * transcripts here on 2026-08-26, of which this reads twelve.
 */
const WINDOW_LIMIT = 12;

/**
 * A ceiling on helper transcripts read per request, across all windows.
 *
 * Helper files are the larger population by far (190 under this project alone against 126 parents),
 * they are individually small, and a single fan-out session can hold dozens. The cap is a cost
 * guard, and when it bites the wire says so rather than letting a partial count read as a total.
 */
const HELPER_READ_LIMIT = 240;

/** The harness's own marker for a line it synthesised rather than a model answering. */
const SYNTHETIC_MODEL_ID = '<synthetic>';

/** The path segment the harness puts a window's spawned helpers under. */
const HELPER_SEGMENT = 'subagents';

/** One helper window that ran under a session window. Never folded into the parent's number. */
export interface ContextHelperWire {
  /**
   * The transcript FILE's base name, and that is deliberately the whole identity available: a
   * subagent transcript stamps its PARENT's `sessionId` on every line (measured 2026-08-21, 188/188
   * files), so a helper window has no id of its own anywhere in the record. The file is what
   * distinguishes one helper from another.
   */
  readonly file: string;
  /** Distinct model requests this helper window made. */
  readonly requestCount: number;
  /** The fullest this helper's OWN window was observed to be. Never added to the parent's figure. */
  readonly peakTokens: number;
  /** `null` when no reading carried a usable timestamp — never a fabricated "now". */
  readonly lastObservedAt: string | null;
}

/** One session window — an orchestration session's own context window. The signed subject. */
export interface ContextWindowWire {
  /** The host window id every usable line of the transcript agreed on. */
  readonly windowId: string;
  /**
   * The window's LATEST reading — what the meter fills to.
   *
   * ★ SYNTHETIC READINGS ARE EXCLUDED, and skipping that is a visible defect rather than a nicety.
   * The harness emits `model: "<synthetic>"` lines carrying an all-zero usage block; measured here
   * 2026-08-26, 22 such observations across 125 windows, every one of them zero, and TWO windows
   * END on one. Taking the last observation verbatim therefore draws an EMPTY meter for a window
   * that reached 437.5k and another that reached 429.3k. The count that was skipped rides the wire
   * as {@link syntheticObservations} so the exclusion is visible rather than silent.
   */
  readonly residentTokens: number;
  /** The fullest this window was observed to be. Differs from {@link residentTokens} after a
   *  compaction — the occupancy quantity FALLS, which is the whole reason ADR-0248 rejected the
   *  monotonic billing total. */
  readonly peakTokens: number;
  /** Readings that entered the figures above. */
  readonly observationCount: number;
  /** Readings excluded as synthetic — reported, never silently dropped. */
  readonly syntheticObservations: number;
  /** The model of the latest counted reading, when the line declared one. */
  readonly modelId: string | null;
  /** `null` when no counted reading carried a usable timestamp. */
  readonly lastObservedAt: string | null;
  /** When the transcript file last changed — how this list is ordered, and the only freshness fact
   *  available for a window whose readings are all undated. */
  readonly lastWrittenAt: string;
  /**
   * The helper windows this session spawned, each with its OWN reading. THE UNSIGNED HALF
   * (ADR-0452 D3) — permitted as a proposal, carrying no owner attestation.
   *
   * Empty means no helper transcript sits beside this window's file. `helpersJoined: false` means
   * the join could not be made at all, which is a different fact and must not render as "none".
   */
  readonly helpers: readonly ContextHelperWire[];
  /**
   * Whether the helper join could be made for this window.
   *
   * The join is the harness's own layout — a window's helpers live under `<window>/subagents/**`
   * beside `<window>.jsonl` — and it is VERIFIED rather than assumed: the transcript's own read
   * `windowId` must equal its file's base name. When they disagree, the directory beside the file
   * is not provably this window's, so the helpers are not claimed. A session is never inferred from
   * a directory NAME here, the same rule `collectTranscriptFiles` keeps.
   */
  readonly helpersJoined: boolean;
}

/** What this request examined, and what it did not. */
export interface ContextScanWire {
  /** WHERE the server looked. On the wire because "no windows" and "no transcripts under the root I
   *  was pointed at" send an operator to different places (`STORYTREE_TRANSCRIPT_DIR` moves it). */
  readonly root: string;
  /** Session transcripts found under the root. */
  readonly windowFilesFound: number;
  /** How many of them this request actually read — {@link WINDOW_LIMIT} at most. */
  readonly windowFilesRead: number;
  /** Helper transcripts found beside the windows that were read. */
  readonly helperFilesFound: number;
  /** How many of those were read. Below `helperFilesFound` when {@link HELPER_READ_LIMIT} bit. */
  readonly helperFilesRead: number;
  /**
   * Helper transcripts under the WHOLE root, not only beside the windows read.
   *
   * On the wire because the two counts answer different questions and the difference is the honest
   * one: measured 2026-08-26, the twelve most recent windows on this machine had spawned NO helper
   * at all while 190 helper transcripts sat under this project. Without this number the helper
   * section would read "no helper windows" when the truth is "none under what I looked at" — the
   * same absence-versus-not-looked distinction `root` exists to keep.
   */
  readonly helperFilesOnMachine: number;
}

export interface ContextWindowsWire {
  readonly scan: ContextScanWire;
  /** Newest first, by the transcript file's own last-written time. */
  readonly windows: readonly ContextWindowWire[];
}

function isHelperPath(file: string): boolean {
  return file.split(/[\\/]/).includes(HELPER_SEGMENT);
}

/** The `<window>/subagents` directory that sits beside `<window>.jsonl`, when the id agrees. */
function helperDirFor(file: string, windowId: string): string | null {
  const base = path.basename(file, '.jsonl');
  if (base !== windowId) return null;
  return path.join(path.dirname(file), base, HELPER_SEGMENT);
}

function helperFilesUnder(dir: string): string[] {
  const found: string[] = [];
  const visit = (current: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      // An unreadable directory is "no helpers found there", never a failed request: the parent
      // window's own reading is the signed half and must not be lost to a helper-side fault.
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      // `isDirectory()` is false for a symlink or a Windows junction, so this never follows one —
      // the same protection `collectTranscriptFiles` relies on.
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) found.push(full);
    }
  };
  visit(dir);
  return found;
}

interface Reading {
  readonly at: string;
  readonly residentInputTokens: number;
  readonly modelId?: string;
}

function isCounted(reading: Reading): boolean {
  return reading.modelId !== SYNTHETIC_MODEL_ID;
}

function peakOf(readings: readonly Reading[]): number {
  return readings.reduce((max, r) => Math.max(max, r.residentInputTokens), 0);
}

/**
 * Read the transcript root and fold it into the widget's answer.
 *
 * Exported so the priming call below and the route share ONE body — a second walk beside it is how
 * one of them ends up bounded differently from the other.
 */
export async function readContextWindows(): Promise<ContextWindowsWire> {
  const { collectTranscriptFiles, resolveTranscriptDir, readTranscriptWindow } = await loadTranscripts();
  const root = resolveTranscriptDir();
  const all = collectTranscriptFiles(root);

  // Order by the file's own mtime: the freshest window is the one an operator is most likely to be
  // sitting inside, and it is the only ordering available before anything has been read. Statting is
  // ~50 ms for 3,219 files here; READING them all would be minutes, which is why the bound exists.
  const windowFiles: { file: string; mtimeMs: number }[] = [];
  let helperFilesOnMachine = 0;
  for (const file of all) {
    if (isHelperPath(file)) {
      helperFilesOnMachine += 1;
      continue;
    }
    try {
      windowFiles.push({ file, mtimeMs: fs.statSync(file).mtimeMs });
    } catch {
      // Vanished between the walk and the stat — a transcript is append-only but a project directory
      // can still be removed under us. Not a failed request.
    }
  }
  windowFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const windows: ContextWindowWire[] = [];
  let helperFilesFound = 0;
  let helperFilesRead = 0;

  for (const { file, mtimeMs } of windowFiles.slice(0, WINDOW_LIMIT)) {
    const read = readTranscriptWindow(file);
    // No agreed window identity, or nothing readable: the file names no window, so there is nothing
    // to draw a meter for. Omitted rather than rendered as an empty window, which would be a claim
    // about a session rather than about the absence of its readings.
    if (read.windowId === undefined || read.observations.length === 0) continue;

    const counted = read.observations.filter(isCounted);
    if (counted.length === 0) continue;
    const latest = counted[counted.length - 1];
    if (latest === undefined) continue;

    const helperDir = helperDirFor(file, read.windowId);
    const helpers: ContextHelperWire[] = [];
    if (helperDir !== null) {
      const files = helperFilesUnder(helperDir);
      helperFilesFound += files.length;
      for (const helperFile of files) {
        if (helperFilesRead >= HELPER_READ_LIMIT) break;
        helperFilesRead += 1;
        const helperRead = readTranscriptWindow(helperFile);
        const readings = helperRead.sidechainObservations;
        if (readings.length === 0) continue;
        const last = readings[readings.length - 1];
        helpers.push({
          file: path.basename(helperFile),
          requestCount: readings.length,
          peakTokens: peakOf(readings),
          lastObservedAt: last?.at ?? null,
        });
      }
      helpers.sort((a, b) => b.peakTokens - a.peakTokens);
    }

    windows.push({
      windowId: read.windowId,
      residentTokens: latest.residentInputTokens,
      peakTokens: peakOf(counted),
      observationCount: counted.length,
      syntheticObservations: read.observations.length - counted.length,
      modelId: latest.modelId ?? null,
      lastObservedAt: latest.at,
      lastWrittenAt: new Date(mtimeMs).toISOString(),
      helpers,
      helpersJoined: helperDir !== null,
    });
  }

  // SELECTED by file mtime above, PRESENTED by last reading — two different jobs, and conflating
  // them draws a list whose stated order contradicts the ages printed down it. mtime is the only
  // ordering available before a file is read, so it has to choose WHICH twelve; but a transcript is
  // also touched by things that are not model requests (tool results land in the same tree), so a
  // window can be the freshest FILE while its last actual request is hours old. Observed on this
  // machine before the re-sort: ages reading 1m, 33m, 5h, 25m, 15h down a list captioned "newest
  // first". Undated readings keep their mtime rank rather than being pushed to either end.
  windows.sort((a, b) => lastActivityMs(b) - lastActivityMs(a));

  return {
    scan: {
      root,
      windowFilesFound: windowFiles.length,
      windowFilesRead: Math.min(windowFiles.length, WINDOW_LIMIT),
      helperFilesFound,
      helperFilesRead,
      helperFilesOnMachine,
    },
    windows,
  };
}

/** When a window was last OBSERVED making a request, falling back to when its file last changed. */
function lastActivityMs(window: ContextWindowWire): number {
  if (window.lastObservedAt !== null) {
    const parsed = Date.parse(window.lastObservedAt);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.parse(window.lastWrittenAt);
}

/**
 * Pull the lazily-imported transcript module and take the first reading OFF the request path.
 *
 * The same move `primeTraversalIndex` makes and for the same measured reason: the lazy import is
 * most of the cold cost, and unprimed it lands on the FIRST click — which is exactly the click an
 * owner makes when the widget is staged for a LOOK. Fire-and-forget and failure-tolerant: a machine
 * with no transcript root resolves to an empty answer, and any fault here must degrade to "the first
 * request pays what it used to", never to a dev server that will not start.
 */
export async function primeContextWindows(): Promise<void> {
  try {
    await readContextWindows();
  } catch {
    // Priming is an optimisation, never a precondition.
  }
}

/**
 * Dispatch `GET /api/context-windows`. Read-only by decision, not omission: a transcript is the
 * harness's own record and nothing in this arc writes one from a UI — so a non-GET is refused by
 * name, the posture `handleTraversal` already takes.
 */
export async function handleContextWindows(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if ((req.method ?? 'GET') !== 'GET') {
    throw new HttpError(
      405,
      'method not allowed — the context-window meter is read-only (a transcript is the harness’s own record)',
    );
  }
  sendJson(res, 200, await readContextWindows());
}
