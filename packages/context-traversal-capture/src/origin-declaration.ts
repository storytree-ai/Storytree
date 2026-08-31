/**
 * THE PERSISTED ORIGIN DECLARATION — story `context-traversal-capture`, capability
 * `terminal-capture-activation` (ADR-0484 D7).
 *
 * A session declares how it came to exist ONCE, and every later invocation in that session stamps
 * the answer on the lines it writes. This module is the whole filesystem half of that: one small
 * JSON file per session, beside the session's own trace and its ship cursor. The RESOLUTION rules
 * live in the pure `session-origin.ts`, which reads what this returns.
 *
 * WHY A FILE AND NOT ONLY AN ENVIRONMENT VARIABLE. Both channels exist and neither replaces the
 * other. The environment is what a storytree-OWNED cut can set mechanically; it is unavailable for
 * the cut that actually dominates today, because a session is cut through the desktop's
 * `spawn_task`, whose environment the harness owns and we cannot inject into. What the cutting
 * session CAN do is put a line in the brief it authors for its successor, and this file is where
 * running that line lands. Compliance-dependent, and honest about being so — the alternative on
 * offer was inferring the cut from timing or worktree reuse, which the increment refuses outright.
 *
 * FAIL-SILENT IN BOTH DIRECTIONS, on the capture path's own contract (ADR-0241 D3). An unwritable
 * home returns false and the session simply stays undeclared; an unreadable or unrecognised
 * declaration returns null, which resolves to NO origin rather than to a guessed one. That is the
 * safe direction here and the opposite of `readShipCursor`'s: a cursor that cannot be read re-ships
 * bytes the store's idempotence absorbs, while an origin that cannot be read must never become a
 * claim.
 */
import fs from "node:fs";
import path from "node:path";

import { parseSessionOriginDeclaration } from "./session-origin.js";
import type { SessionOriginDeclaration } from "./session-origin.js";

/**
 * The filename suffix a session's origin declaration is stored under, beside its `.jsonl` trace and
 * its `.ship.json` cursor. Not `.jsonl`, so it never enters `listTraversalSessions`' scan.
 */
export const SESSION_ORIGIN_EXT = ".origin.json";

/** Where one session's declaration lives. Exported so the CLI can name the file it just wrote. */
export function sessionOriginPath(dir: string, sessionId: string): string {
  return path.join(dir, `${sessionId}${SESSION_ORIGIN_EXT}`);
}

/**
 * Read a session's declaration, or null when it has none this reader understands.
 *
 * The three ways to get null are deliberately ONE answer: no file, unparseable bytes, and a
 * document of a shape this version does not know all mean "this session has not told us", and a
 * caller that distinguished them would be tempted to treat one of them as a weaker kind of claim.
 */
export function readSessionOriginDeclaration(
  dir: string,
  sessionId: string,
): SessionOriginDeclaration | null {
  // ONE `try`, not two. A missing file and unparseable bytes are the same answer, so a second
  // handler around the parse could only ever return what this one already returns — and a handler
  // whose removal changes nothing is a rule nothing can hold.
  try {
    // Stryker disable next-line StringLiteral: EQUIVALENT — an unrecognised encoding string is not
    // rejected by the runtime this suite runs on, so `"utf8"` -> `""` reads the same bytes. The
    // literal is kept because it states the intent; nothing observable distinguishes the two.
    const raw = fs.readFileSync(sessionOriginPath(dir, sessionId), "utf8");
    return parseSessionOriginDeclaration(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Persist a session's declaration, replacing any earlier one.
 *
 * A REPLACE rather than an append, because a session has exactly one origin: a second declaration is
 * a correction of the first, not a second event. What a correction cannot reach is the lines ALREADY
 * written under the old answer — those keep what they were stamped with, and a trace holding both
 * answers classifies `mixed` rather than silently adopting the newer one.
 */
export function writeSessionOriginDeclaration(
  dir: string,
  sessionId: string,
  declaration: SessionOriginDeclaration,
): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true });
    // Stryker disable next-line StringLiteral: EQUIVALENT — utf8 is `writeFileSync`'s own default,
    // so naming it changes nothing observable; it is stated because the reader is explicit too.
    fs.writeFileSync(sessionOriginPath(dir, sessionId), `${JSON.stringify(declaration)}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}
