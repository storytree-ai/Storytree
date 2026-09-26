/**
 * Capability 4 · Sessions (stories/agent-link.md). Not built yet: this stub gives the contracts'
 * tests something to fail against.
 */
import type { ActivityLog, Line } from "../activity/index.js";

/** The quiet time after which a session whose lines have stopped reads as idle: 30 minutes to start with. */
export const QUIET_MS = 30 * 60 * 1000;

/** Live while its lines keep arriving, idle after the quiet time, ended once its end line arrives. */
export type SessionState = "live" | "idle" | "ended";

/** One agent window, as the activity log shows it. */
export interface Session {
  /** The harness's own id for the session. */
  session: string;
  /** Which harness it runs in, as the harness names itself: `claude-code`, `codex`, … */
  harness?: string;
  /** The harness as people call it: "Claude Code", "Codex". */
  label: string;
  /** The folder it works in. */
  folder?: string;
  /** When its first line was written. */
  startedAt: string;
  /** When its latest line was written. */
  lastSeenAt: string;
  state: SessionState;
  /** False while no hook of this session has written a line: it is flagged "hooks not running". */
  hooksRunning: boolean;
}

export interface SessionOptions {
  /** The time to judge by. By default, now. */
  readonly now?: Date;
  /** How long a session may be quiet before it reads as idle. By default, QUIET_MS. */
  readonly quietMs?: number;
}

export function sessionsFrom(_lines: readonly Line[], _options: SessionOptions = {}): Session[] {
  throw new Error("sessions are not built yet");
}

export async function readSessions(_log: ActivityLog, _project: string, _options: SessionOptions = {}): Promise<Session[]> {
  throw new Error("sessions are not built yet");
}
