// `storytree own` — the session's inventory of the background work it is still running.
//
// THE QUESTION IT ANSWERS, which nothing answered before (`shared-box-session-ownership-arc` inc 1):
// "what am I still running, right now?" The harness notifies on a background task's completion OR
// failure, so a task that HANGS produces neither and its silence is indistinguishable from "already
// handled". The only record of a live job is a tool result that scrolls out of context. So a session
// can run every step of the ADR-0271 closing leg, report itself INERT, and still hold live work it
// has no way to discover — including a hung `library artifact edit` that commits afterwards and
// silently reverts a field another session had already corrected, attributable to nobody.
//
// It is also the FLOOR under this arc's cleanup entries. A safe reclaim cannot be designed against a
// list that does not exist: with no ownership signal to filter on, the only heuristic available is
// start time, and start time reaches across sessions and kills a sibling's live run. `--all` is that
// filter — it names WHO owns a process, so a reclaim is scoped by ownership rather than guessed.
//
// THE DECISION IS NOT HERE. Format, classification, the inert predicate and the clear rule are the
// pure `@storytree/drive` spawn registry; this file supplies the identity, the filesystem and the
// probe, and formats the envelope. Same split as `dispatch` / `dispatch-handle`.
//
// WHAT IT DOES NOT SEE, said out loud in the render rather than left to be discovered: only work
// that REGISTERED itself is here. Today that is the storytree CLI and the gate runner. A harness
// background shell, a detached editor, a browser someone launched by hand — none of those register,
// so an empty inventory means "nothing storytree started is still running", never "this box is
// idle". An inventory that overstated its own coverage would recreate the exact false-clear this
// command exists to remove.

import {
  IDENTITY_REFUSAL_BODY,
  type ClassifiedSpawn,
  type OwnershipSummary,
  clearExitedRecords,
  defaultRegistryRoot,
  deriveIdentity,
  formatAgeMs,
  holdsLiveWork,
  listRegisteredSessions,
  nodeAliveProbe,
  nodeSpawnRegistryIo,
  readOwnership,
  withoutPid,
  type SpawnRegistryIo,
} from "@storytree/drive";

import type { Envelope } from "./envelope.js";

export interface OwnDeps {
  readonly io: SpawnRegistryIo;
  readonly root: string;
  readonly now: () => number;
  readonly sessionId: () => string | null;
  readonly probe: (pid: number) => boolean | "unknown";
  /** This process — excluded from every inventory it reports. See {@link withoutPid}. */
  readonly selfPid: number;
}

/** Read one session's inventory, minus the reader itself. The ONE read path, so nothing forgets. */
function inventory(deps: OwnDeps, sessionId: string): OwnershipSummary {
  return withoutPid(
    readOwnership(sessionId, deps.io, deps.probe, deps.now(), deps.root),
    deps.selfPid,
  );
}

/** The live wiring: the real registry, the real clock, the worktree identity, the real probe. */
export function defaultOwnDeps(): OwnDeps {
  return {
    io: nodeSpawnRegistryIo(),
    root: defaultRegistryRoot(),
    now: () => Date.now(),
    // The same identity every claim-taking verb uses (ADR-0033 D1), and the same override the
    // traversal capture honours — one answer to "who am I", never a second derivation that can
    // disagree with the notice board about which session this is.
    sessionId: () => {
      const override = process.env["STORYTREE_SESSION_ID"];
      if (override !== undefined && override.trim().length > 0) return override.trim();
      return deriveIdentity()?.sessionId ?? null;
    },
    probe: nodeAliveProbe,
    selfPid: process.pid,
  };
}

export function ownHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree own — what background work is THIS session still running? (shared-box-session-ownership)",
      "",
      "  storytree own              this session's inventory: live work, and records left by work that died",
      "  storytree own --all        every session's, so a process can be attributed WITHOUT a start-time guess",
      "  storytree own clear        forget the records whose process is gone (never touches live ones)",
      "",
      "Run it before you declare a session inert (ADR-0271). A LIVE row means the closing leg is not",
      "finished: that work is still writing, and a hung `library artifact edit` that commits after you",
      "have gone silently reverts whatever corrected the field in the meantime.",
      "",
      "Only work that REGISTERED itself appears here — the storytree CLI and the gate runner. Harness",
      "background shells and hand-launched servers do not, so an empty inventory means \"nothing",
      "storytree started is still running\", never \"this box is idle\".",
    ].join("\n"),
    next: ["storytree own", "storytree own --all"],
  };
}

/** `pid 1234  12m  storytree build node x --real` — one row, aligned enough to scan. */
function row(entry: ClassifiedSpawn): string {
  const age = entry.ageMs === null ? "  ?" : formatAgeMs(entry.ageMs).padStart(3, " ");
  const pid = `pid ${String(entry.record.pid)}`.padEnd(11, " ");
  return `    ${pid} ${age}  ${entry.record.command}`;
}

function renderSession(summary: OwnershipSummary, lines: string[]): void {
  for (const entry of summary.live) lines.push(row(entry));
  for (const entry of summary.unknown) {
    lines.push(`${row(entry)}   [UNKNOWN — the liveness probe could not tell; treat as running]`);
  }
  for (const entry of summary.leaked) {
    lines.push(`${row(entry)}   [gone — died without de-registering]`);
  }
}

/**
 * The one-session report. `ok` is TRUE whether or not work is live — this is an inventory, not a
 * verdict, and a session with three live builds is in a perfectly normal state. What must not happen
 * is that state going unnoticed, which is why the live count leads the body.
 */
function reportSelf(deps: OwnDeps, sessionId: string): Envelope {
  const summary = inventory(deps, sessionId);
  const lines: string[] = [`storytree own — session "${sessionId}"`, ""];

  if (!holdsLiveWork(summary) && summary.leaked.length === 0 && summary.unreadable.length === 0) {
    lines.push("  No registered background work. Nothing storytree started is still running.");
  } else {
    const live = summary.live.length + summary.unknown.length;
    lines.push(
      live === 0
        ? "  LIVE: none."
        : `  LIVE: ${String(live)} — this session is still running work. It is NOT inert.`,
    );
    renderSession(summary, lines);
  }

  if (summary.unreadable.length > 0) {
    lines.push(
      "",
      `  ${String(summary.unreadable.length)} record(s) could not be read (a write interrupted mid-flight):`,
    );
    for (const bad of summary.unreadable) lines.push(`    ${bad.filePath} — ${bad.reason}`);
  }

  lines.push(
    "",
    "  Only registered work appears here (the storytree CLI, the gate runner). Harness background",
    "  shells and hand-launched servers register nothing, so this is not a census of the box.",
  );
  if (summary.leaked.length > 0) lines.push("  Clear the dead records: storytree own clear");

  return {
    ok: true,
    body: lines.join("\n"),
    next: holdsLiveWork(summary) ? ["storytree own", "storytree own --all"] : ["storytree own --all"],
  };
}

/**
 * Every session's inventory. THE POINT IS ATTRIBUTION: a process here is named with its owner, so a
 * session reclaiming resources filters by ownership instead of by start time. Read-only on purpose —
 * this command will not stop another session's work, and nothing here should be read as licence to.
 */
function reportAll(deps: OwnDeps, mine: string | null): Envelope {
  const sessions = listRegisteredSessions(deps.io, deps.root);
  const lines: string[] = ["storytree own --all — registered background work, by owning session", ""];
  let liveTotal = 0;

  for (const sessionId of sessions) {
    const summary = inventory(deps, sessionId);
    if (summary.live.length + summary.unknown.length + summary.leaked.length === 0) continue;
    liveTotal += summary.live.length + summary.unknown.length;
    lines.push(`  ${sessionId}${sessionId === mine ? "  (you)" : ""}`);
    renderSession(summary, lines);
    lines.push("");
  }

  if (liveTotal === 0 && lines.length === 2) {
    lines.push("  No session has registered background work.");
  }
  lines.push(
    "A row here names an OWNER. Scope any reclaim to your own rows — a start-time sweep on this box",
    "kills a sibling's live run, and the sibling gets no signal about why its work died.",
  );
  return { ok: true, body: lines.join("\n"), next: ["storytree own"] };
}

/** Forget the records whose process is gone. Live and unjudgeable records are left alone. */
function clear(deps: OwnDeps, sessionId: string): Envelope {
  const summary = inventory(deps, sessionId);
  const result = clearExitedRecords(summary, deps.io, deps.root);
  const lines = [
    result.cleared === 0
      ? `storytree own clear — nothing to clear for "${sessionId}".`
      : `storytree own clear — forgot ${String(result.cleared)} record(s) whose process is gone.`,
  ];
  if (result.keptLive > 0) {
    lines.push(`  kept ${String(result.keptLive)} LIVE record(s) — that work is still running.`);
  }
  if (result.keptUnknown > 0) {
    lines.push(
      `  kept ${String(result.keptUnknown)} record(s) the probe could not judge — unknown is not dead.`,
    );
  }
  return { ok: true, body: lines.join("\n"), next: ["storytree own"] };
}

export function ownCommand(args: readonly string[], deps: OwnDeps = defaultOwnDeps()): Envelope {
  const sessionId = deps.sessionId();

  if (args.includes("--all")) return reportAll(deps, sessionId);

  // Every other shape is about THIS session, so it needs an identity. The primary checkout has
  // none by decision (ADR-0033 D1) — and here that refusal is not merely a convention: records are
  // keyed by session, so a lobby invocation has no directory to read and would report an empty
  // inventory, which is the false clear this command exists to remove.
  if (sessionId === null) {
    return {
      ok: false,
      body: [
        "storytree own needs a session identity, and this checkout has none.",
        "",
        IDENTITY_REFUSAL_BODY,
        "",
        "`storytree own --all` works anywhere — it reports every session's registered work by owner.",
      ].join("\n"),
      next: ["storytree own --all"],
    };
  }

  if (args[0] === "clear") return clear(deps, sessionId);
  return reportSelf(deps, sessionId);
}
