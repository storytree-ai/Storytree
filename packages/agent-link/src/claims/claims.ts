/**
 * Capability 5 · Claims (stories/agent-link.md). Not built yet: this stub gives the contracts'
 * tests something to fail against.
 */
import type { Library } from "@storytree/library";

import type { ActivityLog, Line } from "../activity/index.js";

/** A capability held by a session, as the log shows it. */
export interface Claim {
  capability: string;
  /** The holding session. */
  session: string;
  harness?: string;
  /** The holding session's harness as people call it: "Claude Code", "Codex". */
  label: string;
  reason: string;
  /** When it was claimed. */
  since: string;
  /** Whether the holding session is live, or idle past the quiet time (and so can be taken over). */
  holder: "live" | "idle";
}

/** Who is claiming, releasing or landing, and where. */
export interface ClaimContext {
  readonly log: ActivityLog;
  readonly library: Library;
  readonly project: string;
  readonly session: string;
  readonly harness?: string;
  readonly folder?: string;
  /** How long a holder may be quiet before its claim can be taken over. By default, sessions' quiet time. */
  readonly quietMs?: number;
}

export type ClaimAnswer =
  | { ok: true; claim: Claim; takenOverFrom?: Claim }
  | { ok: false; refused: "held"; holder: Claim }
  | { ok: false; refused: "unknown-capability"; capability: string };

export type ReleaseAnswer = { ok: true } | { ok: false; refused: "not-held"; holder?: Claim };

export type LandAnswer =
  | { ok: true; line: Line }
  | { ok: false; refused: "held"; holder: Claim }
  | { ok: false; refused: "unknown-capability"; capability: string };

/** An edit or command, and the capability it counts toward: undefined for unplanned activity. */
export interface Attributed {
  line: Line;
  capability: string | undefined;
}

export interface ClaimsOptions {
  readonly now?: Date;
  readonly quietMs?: number;
}

export async function claim(_context: ClaimContext, _capability: string, _reason: string): Promise<ClaimAnswer> {
  throw new Error("claims are not built yet");
}

export async function release(_context: ClaimContext, _capability: string): Promise<ReleaseAnswer> {
  throw new Error("claims are not built yet");
}

export async function land(_context: ClaimContext, _capability: string): Promise<LandAnswer> {
  throw new Error("claims are not built yet");
}

export function claimsFrom(_lines: readonly Line[], _options: ClaimsOptions = {}): Claim[] {
  throw new Error("claims are not built yet");
}

export async function readClaims(_log: ActivityLog, _project: string, _options: ClaimsOptions = {}): Promise<Claim[]> {
  throw new Error("claims are not built yet");
}

export function attributeFrom(_lines: readonly Line[]): Attributed[] {
  throw new Error("claims are not built yet");
}

export async function readAttribution(_log: ActivityLog, _project: string): Promise<Attributed[]> {
  throw new Error("claims are not built yet");
}
