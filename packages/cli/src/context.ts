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
  categoryLabel,
  HARD_MARK_TOKENS,
  MANDATORY_CATEGORIES,
  MARKS_GOVERN_THE_NEXT_UNIT,
  readOwnContextWindow,
  readWindowComposition,
  SOFT_MARK_TOKENS,
  type ContextBand,
  type OwnWindowRead,
  type WindowComposition,
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
  /** What the window is MADE OF — read from the SAME file `read` folded, never re-selected. */
  readonly composition: typeof readWindowComposition;
  readonly now: () => number;
}

export function defaultContextDeps(): ContextDeps {
  return {
    sessionId: () => deriveIdentity()?.sessionId ?? null,
    env: process.env,
    read: readOwnContextWindow,
    composition: readWindowComposition,
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

/**
 * `61.2%` — one decimal, so two slices a few points apart still read as different. Callers pass a
 * non-zero whole: a composition with slices has bytes by construction, and one without never
 * reaches a share.
 */
function percent(part: number, whole: number): string {
  return `${((part / whole) * 100).toFixed(1)}%`;
}

/**
 * The share of the composition a session cannot trim — the categories that arrive whether it asks
 * or not. What ADR-0330 D1 budgets the repo-owned part of, and what the remedy line must never
 * send a session to "fix".
 */
function mandatoryBytes(composition: WindowComposition): number {
  return composition.slices
    .filter((slice) => MANDATORY_CATEGORIES.includes(slice.category))
    .reduce((sum, slice) => sum + slice.bytes, 0);
}

/**
 * A slice that is at least this share of the intake is what the window is ABOUT, and the remedy
 * line names it. Below it no single class dominates and there is honestly nothing to trim.
 */
const DOMINANT_SHARE = 0.4;

/**
 * What to DO about the composition — the half that makes the reading worth having at an increment
 * boundary (`context-window-composition-arc` increment 1: "a remedy rather than only a reading").
 *
 * Keyed on the dominant class, and every remedy names a lever this session actually holds. The
 * mandatory arm deliberately hands back NO lever: that share is the harness's and the repo's, and a
 * session told to trim it would go looking for a knob that ADR-0330 D1 says is not its to turn.
 */
function compositionRemedy(composition: WindowComposition): string {
  const largest = composition.slices[0];
  if (largest === undefined) return "nothing entered this window yet";
  const mandatory = mandatoryBytes(composition);
  const share = largest.bytes / composition.accountedBytes;

  if (largest.category === "tool-output" && share >= DOMINANT_SHARE) {
    return (
      `tool output is ${percent(largest.bytes, composition.accountedBytes)} of what entered — page long outputs` +
      " (`| head`, `--out <file>`) and hand exploration to a digest subagent whose window is its own" +
      " (`storytree library artifact delegate-exploration-to-digest-subagents`)"
    );
  }
  if (largest.category === "tool-calls" && share >= DOMINANT_SHARE) {
    return (
      `the session's own tool-call payloads are ${percent(largest.bytes, composition.accountedBytes)} — a large Write` +
      " or Edit input stays resident as long as the window does; write a file once and edit it in place"
    );
  }
  if (mandatory / composition.accountedBytes >= DOMINANT_SHARE) {
    return (
      `mandatory context is ${percent(mandatory, composition.accountedBytes)} — none of it is this session's to trim;` +
      " the repo-owned part is budgeted by ADR-0330 D1 and `storytree doctor` reports it"
    );
  }
  return (
    `no single class dominates (largest: ${categoryLabel(largest.category)} at` +
    ` ${percent(largest.bytes, composition.accountedBytes)}) — nothing here to trim; the band above is the reading that matters`
  );
}

/** The `made of:` block — every slice, largest first, in the bytes the transcript recorded. */
function compositionLines(composition: WindowComposition): readonly string[] {
  if (composition.residualAbsence === "unreadable-file") {
    return [
      "  made of:    UNREADABLE — the transcript this reading came from could not be re-read for its",
      "              composition. The fullness above stands; what fills it is not known.",
    ];
  }

  const width = Math.max(0, ...composition.slices.map((slice) => categoryLabel(slice.category).length));
  const rows = composition.slices.map((slice) => {
    const label = categoryLabel(slice.category).padEnd(width);
    const bytes = groupDigits(slice.bytes).padStart(12);
    const share = percent(slice.bytes, composition.accountedBytes).padStart(6);
    // An unclassified slice always has at least one label behind it — that is what put it there.
    const labels = slice.category === "unclassified" ? `  (${composition.unclassifiedLabels.join(", ")})` : "";
    return `    ${label}  ${bytes} B  ${share}  ${groupDigits(slice.records)} record${slice.records === 1 ? "" : "s"}${labels}`;
  });

  const setAside: string[] = [];
  if (composition.sidechainLinesExcluded > 0) {
    setAside.push(`${groupDigits(composition.sidechainLinesExcluded)} helper-window line(s) excluded (ADR-0413 D2)`);
  }
  if (composition.bookkeeping.records > 0) {
    setAside.push(
      `${groupDigits(composition.bookkeeping.records)} bookkeeping record(s) set aside (${composition.bookkeeping.kinds.join(", ")})`,
    );
  }
  if (composition.unparseableLines > 0) setAside.push(`${groupDigits(composition.unparseableLines)} unparseable line(s)`);

  const guidanceLabelled = composition.slices.some((slice) => slice.category === "project-guidance");

  const residual = composition.residual;
  const unseen =
    residual === null
      ? [
          "  unseen:     UNKNOWN — no counted model request to read a resident figure from, so the harness",
          "              floor (system prompt + tool definitions) cannot be sized here. It is not zero.",
        ]
      : [
          `  unseen:     ≈${groupDigits(residual.residualTokens)} tokens were resident at the first request that no transcript line`,
          "              accounts for — the harness's system prompt, tool definitions, and anything it injected",
          `              without recording it. (${groupDigits(residual.firstRequestResidentTokens)} resident − ≈${groupDigits(residual.visibleTokensEstimate)}` +
            ` for ${groupDigits(residual.visibleBytesBeforeFirstRequest)} visible bytes at ${residual.charsPerToken} chars/token.)`,
          "              Not this session's to trim (ADR-0330 D1).",
        ];

  return [
    "  made of:    what has ENTERED this window, in bytes as the transcript recorded them (ADR-0330 D1's",
    "              unit) — its intake over its life, not what is resident after a compaction",
    ...rows,
    ...(setAside.length > 0 ? [`              ${setAside.join(" · ")}`] : []),
    ...(guidanceLabelled
      ? []
      : ["              project guidance (CLAUDE.md / MEMORY.md) is not labelled by this harness — it travels inside the unseen slice"]),
    ...unseen,
    `  remedy:     ${compositionRemedy(composition)}`,
  ];
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

function renderReading(read: OwnWindowRead, composition: WindowComposition, nowMs: number): Envelope {
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
      ...compositionLines(composition),
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
      "  storytree context        this session's own window: resident tokens, peak, its band — and what",
      "                           it is made of, by the harness's own labels, with a remedy",
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
      "The `made of:` block splits the window's INTAKE by the labels the harness itself puts on each",
      "record (ADR-0516 D3 — labels and lengths, never content), in bytes (ADR-0330 D1's unit). The",
      "`unseen:` line is the harness's own preamble — system prompt and tool definitions — which no",
      "transcript records and which can only be shown as what was resident at the first request minus",
      "what the transcript accounts for (D4). It is reported as an unknown quantity, never omitted and",
      "never zero. The `remedy:` line names the one lever the dominant class leaves this session.",
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

  if (read.window === null) return renderAbsence(read);
  // The SAME file the fullness came from — a second selection is how a fullness and a composition
  // come to describe two different windows.
  return renderReading(read, deps.composition(read.window.file), deps.now());
}
