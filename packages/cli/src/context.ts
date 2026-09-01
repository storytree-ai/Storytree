// `storytree context` — how full is THIS session's own context window, right now?
//
// THE QUESTION IT ANSWERS, which nothing answered before (`linked-session-context-arc`, increment
// `hand-a-running-session-its-own-occupancy`). ADR-0411 D3 makes a session's own occupancy the input
// to a real scheduling decision: past the SOFT mark (~700K) take on no NEW increment, at the HARD
// mark (850K) land what is green and hand over — checked at an increment boundary, never mid-unit
// (D5). D6 then says outright that a session without a real figure must announce that it ESTIMATED.
// Nothing fed that figure to a running session, so sessions have been estimating — including the one
// that landed this arc's increment 32 and the one that authored
// `oq-what-makes-the-context-meter-useful`. This is that gap closed, and the whole observable
// outcome is that a debrief cites a number instead of saying it guessed.
//
// ★ IT READS, IT DOES NOT ENFORCE. ADR-0411 D8 keeps the marks reversible and stated as live, and D6
// is explicit that the session still JUDGES — it just judges against a number it was handed rather
// than a feeling. So this prints a reading and D3's own instruction for the band; it refuses nothing,
// blocks nothing, and exits 0 whatever the number is. A future session reaching for a threshold
// refusal here is reaching for something D8 deliberately did not build.
//
// ★★ THE NUMBER IS THIS WINDOW'S, AND HELPERS ARE NEVER IN IT (ADR-0413 D2, permanent, restated by
// ADR-0452 D4). ADR-0411 D4 says the same from the other side: a session that fans work out keeps its
// own window small and sharp, and reading that as a low number is CORRECT rather than an
// under-report. The render says so out loud, because a low figure on a heavy fan-out session is
// exactly where a reader would otherwise suspect the instrument.
//
// ★★★ AN ABSENCE IS NEVER A ZERO. A window with nothing readable prints why, names where it looked
// and how far, and tells the session to fall back to ADR-0411 D6's "I estimated" — because 0 tokens
// resident and "I could not read your window" send a session to opposite decisions.
//
// WHERE THE WORK IS. Not here: the transcript parse rules and the session→window join both live in
// `@storytree/context-traversal-transcript` and are shared with the studio meter, which is what stops
// the two surfaces describing one transcript differently. This file supplies the identity, the
// harness hint and the render — the same split `own` / `dispatch` keep.

import { deriveIdentity, IDENTITY_REFUSAL_BODY } from "@storytree/drive";
import {
  bandGuidance,
  HARD_MARK_TOKENS,
  MARKS_GOVERN_THE_NEXT_UNIT,
  readOwnContextWindow,
  SOFT_MARK_TOKENS,
  type ContextBand,
  type OwnWindowRead,
} from "@storytree/context-traversal-transcript";

import type { Envelope } from "./envelope.js";

/**
 * The env var the harness stamps with the window id of the process it is running.
 *
 * A SELECTOR, never a second identity rule. What decides which windows are eligible is the cwd
 * correlation in `@storytree/context-traversal-transcript` — a transcript is this session's exactly
 * when it recorded a `cwd` inside this worktree — and this only picks among those, which is the one
 * thing that rule cannot do on its own. It matters because a worktree SLOT is reused: the slot this
 * was written in held three windows, all correlating by cwd, and without the hint the reading is the
 * most recently active of them. That is usually right and is not always right, so a session is told
 * which way it was picked.
 *
 * Absent on harnesses that do not set it, which is a supported shape and not a fault.
 */
const HARNESS_WINDOW_ID_ENV = "CLAUDE_CODE_SESSION_ID";

export interface ContextDeps {
  /** This session's storytree identity, or `null` in the primary checkout (ADR-0033 D1). */
  readonly sessionId: () => string | null;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly read: typeof readOwnContextWindow;
  readonly now: () => number;
}

export function defaultContextDeps(): ContextDeps {
  return {
    sessionId: () => deriveIdentity()?.sessionId ?? null,
    env: process.env,
    read: readOwnContextWindow,
    now: () => Date.now(),
  };
}

/** `312,412` — deterministic grouping, so a render is the same under every ICU build. */
function groupDigits(value: number): string {
  return String(Math.trunc(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** `312k` — the coarse form, for reading a number against two marks quoted in the same unit. */
function thousands(value: number): string {
  return `${Math.round(value / 1000)}k`;
}

/** `4m`, `3h`, `2d` — how long ago, at the coarsest unit that is still true. */
function ageLabel(iso: string | null, nowMs: number): string {
  if (iso === null) return "undated";
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "undated";
  const minutes = Math.max(0, Math.round((nowMs - at) / 60_000));
  if (minutes === 0) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const BAND_LABEL = {
  calm: "CALM",
  soft: "SOFT MARK",
  hard: "HARD MARK",
} satisfies Record<ContextBand, string>;

/** Why there is no reading, said in the terms that tell a session what to do next. */
function absenceLines(read: OwnWindowRead): readonly string[] {
  switch (read.absence) {
    case "no-transcript-root":
      return [
        "No session transcript exists under the root below, so there is nothing to read.",
        "That is where the harness writes them; `STORYTREE_TRANSCRIPT_DIR` moves it.",
      ];
    case "no-correlated-window":
      return [
        `None of the transcripts read was written inside this session's worktree (${read.sessionId}).`,
        "A transcript belongs to a session when it recorded a `cwd` inside that session's worktree,",
        "so this is what it looks like when the bound below did not reach yours, or when this",
        "harness writes its transcripts somewhere else.",
      ];
    default:
      return [
        "This session's transcript was found and carries no usable reading yet.",
        "★ THAT IS NOT ZERO OCCUPANCY. A window whose only readings are the harness's own",
        "`<synthetic>` lines reads as empty and is not — two windows on this machine ENDED on one",
        "at 437k and 429k. An absence is reported rather than filled in with a number.",
      ];
  }
}

function scanLines(read: OwnWindowRead): readonly string[] {
  const { scan } = read;
  return [
    `  looked at:  the ${scan.windowFilesRead} most recently written of ${scan.windowFilesFound} session transcripts` +
      ` (bound ${scan.candidateLimit})`,
    `  of those:   ${scan.correlatedWindows} written inside this worktree`,
    `  root:       ${scan.root}`,
  ];
}

function renderAbsence(read: OwnWindowRead): Envelope {
  return {
    // `ok` because the command did its job: it looked, and it is telling the truth about what it
    // found. A false `ok` would make a routine "no transcript here" indistinguishable from a broken
    // instrument, and this command is read at the end of a session where that distinction matters.
    ok: true,
    body: [
      `storytree context — NO READING for session "${read.sessionId}", and that is not a zero.`,
      "",
      ...absenceLines(read),
      "",
      ...scanLines(read),
      "",
      "Fall back to ADR-0411 D6: judge your own headroom and SAY IN THE DEBRIEF that you estimated",
      `it. The marks are unchanged by the absence — no new increment past ~${thousands(SOFT_MARK_TOKENS)},` +
        ` hand over at ${thousands(HARD_MARK_TOKENS)}, checked at an increment boundary.`,
      // Carries its own leading blank line so no bare "" spacer sits on a changed span: an empty
      // string literal is a mutant no assertion can honestly kill, while this one dies with the clause.
      `
${MARKS_GOVERN_THE_NEXT_UNIT}`,
    ].join("\n"),
    next: ["storytree context", "storytree own"],
  };
}

function renderReading(read: OwnWindowRead, nowMs: number): Envelope {
  const window = read.window;
  const band = read.band;
  if (window === null || band === null) return renderAbsence(read);

  const identity =
    read.selectedBy === "harness-window-id"
      ? "confirmed — the harness named this window id and it is one of yours"
      : read.harnessWindowUnmatched
        ? "UNCONFIRMED — the harness named a window this scan did not reach; this is the most recently" +
          " active window in your worktree"
        : "unconfirmed — no harness window id here, so this is the most recently active window in your worktree";

  const excluded =
    window.syntheticObservations === 0
      ? ""
      : ` · ${window.syntheticObservations} synthetic reading${window.syntheticObservations === 1 ? "" : "s"} excluded`;

  return {
    ok: true,
    body: [
      `storytree context — session "${read.sessionId}", window ${window.windowId}`,
      "",
      `  resident:   ${groupDigits(window.residentTokens)} tokens  (${thousands(window.residentTokens)})`,
      `  peak:       ${groupDigits(window.peakTokens)} tokens  (${thousands(window.peakTokens)})`,
      `  band:       ${BAND_LABEL[band]} — ${bandGuidance(band)}`,
      `  marks:      soft ~${thousands(SOFT_MARK_TOKENS)} · hard ${thousands(HARD_MARK_TOKENS)}  (ADR-0411 D3, tuned by ADR-0499 D1)`,
      "",
      `  read from:  ${window.observationCount} model request${window.observationCount === 1 ? "" : "s"}` +
        `, last ${ageLabel(window.lastObservedAt, nowMs)}${excluded}`,
      `  identity:   ${identity}`,
      ...scanLines(read),
      "",
      "This is YOUR window and nothing else. Helper and subagent windows are never counted into it",
      "(ADR-0413 D2) — a helper's window is gone by the time yours peaks, so summing them would draw a",
      "fullness no window ever reached. A session that fans work out keeps its own number small, and",
      "that is a correct reading rather than an under-report (ADR-0411 D4).",
      "",
      // Only when the two figures actually differ. Printed unconditionally it is noise on the common
      // case, and noise is what stops the lines that DO matter from being read.
      ...(window.peakTokens > window.residentTokens
        ? [
            "Peak above resident means this window was COMPACTED: the occupancy quantity FALLS, which",
            "is why the reading is resident tokens and not a billing total (ADR-0248 D1). Your band is",
            "read from the CURRENT figure, which is the one that says how much room you have now.",
            "",
          ]
        : []),
      "It advises, it does not stop you (ADR-0411 D8). Check it at an INCREMENT BOUNDARY — the",
      "question is “do I have room for the next one?”, never “should I stop right now?” (D5).",
      // Carries its own leading blank line so no bare "" spacer sits on a changed span: an empty
      // string literal is a mutant no assertion can honestly kill, while this one dies with the clause.
      `
${MARKS_GOVERN_THE_NEXT_UNIT}`,
    ].join("\n"),
    next: ["storytree arc show <arc-id> --pg", "storytree own"],
  };
}

export function contextHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree context — how full is THIS session's own context window? (ADR-0411 D3/D6)",
      "",
      "  storytree context        this session's own window: resident tokens, peak, and its band",
      "",
      "Run it at an INCREMENT BOUNDARY, before deciding whether to take on the next one — that is",
      "what ADR-0411 D5 makes it, a scheduling read rather than an interruption. Past the soft mark",
      `(~${thousands(SOFT_MARK_TOKENS)}) take on no NEW increment; at the hard mark (${thousands(HARD_MARK_TOKENS)})` +
        " land what is green, write",
      "the handover onto the owning arc, release your claims, and let a fresh session continue.",
      // Carries its own leading blank line so no bare "" spacer sits on a changed span: an empty
      // string literal is a mutant no assertion can honestly kill, while this one dies with the clause.
      `
${MARKS_GOVERN_THE_NEXT_UNIT}`,
      "",
      "It reads and never enforces (D8). D6's point is that the judgement is INFORMED rather than",
      "guessed — where this prints no reading, say in your debrief that you ESTIMATED.",
      "",
      "The figure is your OWN conversation window. Helper and subagent windows are never folded in",
      "(ADR-0413 D2 / ADR-0411 D4): a session that fans work out has a small number, and that is",
      "correct rather than an under-report.",
      "",
      "Offline and read-only — host transcripts are local files, so it needs no database and no",
      "network. `STORYTREE_TRANSCRIPT_DIR` moves the root it reads.",
    ].join("\n"),
    next: ["storytree context"],
  };
}

export function contextCommand(deps: ContextDeps = defaultContextDeps()): Envelope {
  const sessionId = deps.sessionId();

  // The primary checkout has no session identity by decision (ADR-0033 D1), and here that is not a
  // formality: the reading is found by matching a transcript's recorded `cwd` against a worktree, so
  // the shared lobby has nothing to match on and any answer would be a guess about whose window it
  // had picked up.
  if (sessionId === null) {
    return {
      ok: false,
      body: [
        "storytree context needs a session identity, and this checkout has none.",
        "",
        IDENTITY_REFUSAL_BODY,
        "",
        "This command finds your window by matching a transcript's recorded working directory against",
        "your worktree, so without one there is nothing to match — and picking the busiest window on",
        "the box would hand you somebody else's number.",
      ].join("\n"),
      next: ["storytree context"],
    };
  }

  // A blank env var is NO hint, never an empty-string one: passed through it would match no window
  // and raise `harnessWindowUnmatched`, which is a claim that the harness and the scan disagreed.
  const harnessWindowId = deps.env[HARNESS_WINDOW_ID_ENV]?.trim();
  const read =
    harnessWindowId === undefined || harnessWindowId.length === 0
      ? deps.read({ sessionId })
      : deps.read({ sessionId, harnessWindowId });

  return read.window === null ? renderAbsence(read) : renderReading(read, deps.now());
}
