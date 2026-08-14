// The SPAWN RECORD FORMAT — plain Node ESM, so the registrars that are not TypeScript can share it.
//
// WHY THIS FILE IS `.mjs` AND NOT `.ts` (`shared-box-session-ownership-arc`, increment 2). ADR-0366
// built the registry and wired the two registrars that happened to be TypeScript: the CLI entry point
// and the gate runner. The processes that actually OUTLIVE a session are the detached ones, and the
// launcher that spawns them — `scripts/studio.mjs` — is plain Node ESM by decision, because it must
// run before (and without) a workspace install of anything beyond the studio app itself. It cannot
// import `spawn-registry.ts` at all.
//
// That left exactly two options: the launcher hand-writes the same JSON into the same directory, or
// the format moves somewhere both callers can reach. Duplication was rejected because of the
// DIRECTION it fails in. A drifted copy does not announce itself — the launcher keeps writing records
// `storytree own` has quietly stopped reading, and the inventory reports a clean bill over a live
// vite server holding :5173. That is the same false clear the arc exists to remove, reintroduced by
// the fix for it. So the format lives here, `spawn-registry.ts` RE-EXPORTS these functions rather
// than restating them (pinned by reference equality in `spawn-record.test.ts`), and there is one
// definition of where a record lives and what it says.
//
// WHAT THIS FILE MAY CONTAIN, and why the constraint is real rather than stylistic: node builtins
// only, no workspace imports, no TypeScript. `scripts/studio.mjs` reaches it by relative path, so it
// resolves with no `node_modules` present at all. Its exported surface is typed by the sibling
// `spawn-record.d.mts`, the arrangement `scripts/resolve-bash.d.mts` already uses — TypeScript
// callers get full types, and the implementation stays runnable by bare node.
//
// THE HONESTY RULES IT INHERITS, unchanged from the registry it serves:
//   - FAIL-SILENT. Registration is instrumentation. A read-only home or a full disk leaves the run
//     uninventoried — the state every run was in before this existed — and never breaks it.
//   - IDENTITY-GATED (ADR-0033 D1). No session identity, no record: the primary checkout and CI
//     register nothing, because a record filed under no owner cannot be scoped to one on the way out.
//   - A LEAKED RECORD IS SIGNAL. Nothing here deletes a record it did not just write. A process that
//     died without de-registering leaves evidence, and that evidence is the point.

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------
// Where a record lives
// ---------------------------------------------------------------------------

/** Default registry root: `~/.storytree/spawns` — beside `secrets.json`, the house per-user dir. */
export function defaultRegistryRoot() {
  return path.join(os.homedir(), ".storytree", "spawns");
}

/**
 * A session id reduced to something safe as a single path component. Identities come from git
 * worktree names (ADR-0033) and from `STORYTREE_SESSION_ID`, which nothing validates — a separator
 * in either would silently write the record into a different session's directory, which is exactly
 * the cross-session reach the registry exists to prevent.
 */
export function sanitizeSessionId(sessionId) {
  const cleaned = String(sessionId)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[.-]+/, "");
  return cleaned.length > 0 ? cleaned : "unnamed-session";
}

/**
 * Where one process's record lives. The pid is the filename, so a registration is a write to a path
 * no other process names and a de-registration is an unlink of that same path — no locking, no
 * read-modify-write, and no torn lines when several sessions register at once.
 */
export function spawnRecordPath(root, sessionId, pid) {
  return path.join(root, sanitizeSessionId(sessionId), `${String(pid)}.json`);
}

/** Serialize a record. One line, so a truncated write is visibly truncated rather than plausible. */
export function formatSpawnRecord(record) {
  return `${JSON.stringify(record)}\n`;
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

function builtinRunGit(args) {
  return String(execFileSync("git", args, { encoding: "utf8" })).trim();
}

function basename(p) {
  const parts = String(p).trim().replace(/[/\\]+$/, "").split(/[/\\]/);
  return parts[parts.length - 1] ?? "";
}

function samePath(a, b) {
  const norm = (p) => String(p).trim().replaceAll("\\", "/").replace(/\/+$/, "");
  return norm(a) === norm(b);
}

/**
 * Who owns a process started from here — the ADR-0033 D1 worktree identity, plus the
 * `STORYTREE_SESSION_ID` override that lets a spawned runtime inherit its parent session.
 *
 * THIS MUST ANSWER WHAT THE NOTICE BOARD ANSWERS. `deriveIdentity` in `noticeboard.ts` is the
 * authority for claim-taking and stays there untouched; this is its plain-ESM twin, needed because a
 * launcher that cannot import TypeScript still has to file its record under the right owner. Two
 * derivations that could disagree would be worse than none: a record written under a name the
 * session's own `storytree own` never looks up is a row that exists and is invisible. So
 * `spawn-record.test.ts` runs BOTH over one scenario table and fails if they ever differ — the copy
 * is held honest mechanically rather than by whoever edits one of them remembering the other.
 *
 * The rules, in order: 1) `.claude/worktrees/<name>` → `<name>`; 2) any other git-registered linked
 * worktree → the basename of its git ADMIN dir; 3) the primary checkout (git-dir === git-common-dir)
 * → `null`. Any git error is also `null` — CI has no worktree and registers nothing.
 */
export function deriveSpawnIdentity(runGit = builtinRunGit, env = process.env) {
  let derived = null;
  try {
    const toplevel = runGit(["rev-parse", "--show-toplevel"]);
    const match = /[/\\]\.claude[/\\]worktrees[/\\]([^/\\]+)\s*$/.exec(toplevel);
    let sessionId = match?.[1] ?? "";

    if (sessionId.length === 0) {
      const gitDir = runGit(["rev-parse", "--path-format=absolute", "--git-dir"]);
      const commonDir = runGit(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
      // Rule 3: equal means the primary checkout — the shared lobby has no isolated identity.
      if (!samePath(gitDir, commonDir)) sessionId = basename(gitDir);
    }

    if (sessionId.length > 0) {
      derived = { sessionId, branch: runGit(["rev-parse", "--abbrev-ref", "HEAD"]) };
    }
  } catch {
    derived = null;
  }

  const override = env?.["STORYTREE_SESSION_ID"];
  if (typeof override === "string" && override.trim().length > 0) {
    return { sessionId: override.trim(), branch: derived?.branch ?? "" };
  }
  return derived;
}

// ---------------------------------------------------------------------------
// Register / de-register
// ---------------------------------------------------------------------------

/**
 * Register a DETACHED process — one whose pid is not this process's — and hand back the path to
 * remove when it is stopped, or `null` when nothing was recorded.
 *
 * WHY A LAUNCHER REGISTERS ON ITS CHILD'S BEHALF. Every registrar before this one recorded ITSELF
 * and de-registered in its own exit handler. A detached child cannot: `scripts/studio.mjs` spawns a
 * vite server precisely so it OUTLIVES the launcher, and the vite process knows nothing about this
 * registry. So the launcher writes the row for the child's pid, and the row is retired by whatever
 * stops the child — `studio:down`, or `storytree own stop`, which clears a record only on a
 * confirmed death. If the child dies on its own the row survives as LEAKED, which is correct: that
 * is the record of work that ended without saying so.
 *
 * `identity` is resolved by the caller when it already has one, and derived here otherwise. Passing
 * `null` explicitly registers nothing — the identity gate, stated as a value rather than left to a
 * caller's `if`.
 */
export function registerDetachedSpawn(spawn, options = {}) {
  try {
    const identity =
      options.identity === undefined ? deriveSpawnIdentity() : options.identity;
    if (identity === null || identity === undefined) return null;

    const pid = Number(spawn?.pid);
    if (!Number.isInteger(pid) || pid <= 0) return null;

    const root = options.root ?? defaultRegistryRoot();
    const filePath = spawnRecordPath(root, identity.sessionId, pid);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      formatSpawnRecord({
        sessionId: identity.sessionId,
        branch: identity.branch ?? "",
        pid,
        command: String(spawn?.command ?? "(unrecorded)"),
        cwd: String(spawn?.cwd ?? ""),
        startedAt: new Date().toISOString(),
      }),
      "utf8",
    );
    return filePath;
  } catch {
    // FAIL-SILENT: an uninventoried run is the state every run was in before this existed. Breaking
    // `studio:up` because a home directory is read-only would be a strictly worse trade.
    return null;
  }
}

/**
 * Retire one record. Idempotent and silent — a record already gone is the desired end state, not an
 * error, and this is the only action in the whole registry that can HIDE work, so it is never
 * broadened to "clean up the directory".
 */
export function removeSpawnRecord(filePath) {
  try {
    if (typeof filePath === "string" && filePath.length > 0) {
      fs.rmSync(filePath, { force: true });
    }
  } catch {
    // The next read reports the record as still present, which is true.
  }
}

/**
 * Retire the record for `pid` under the session that owns this checkout, without the caller having
 * to have kept the path. `studio:down` reaps BY PORT as well as by pid file, so it can stop a
 * process whose registration path it never saw.
 *
 * SCOPED TO ONE SESSION BY CONSTRUCTION: the path is built from THIS checkout's identity, so it can
 * only ever name a row in this session's own directory. A sibling's record is unreachable from here,
 * which is the same fence `storytree own stop` enforces — reaching across sessions is not
 * discouraged, it is unrepresentable.
 */
export function removeSpawnRecordForPid(pid, options = {}) {
  try {
    const identity =
      options.identity === undefined ? deriveSpawnIdentity() : options.identity;
    if (identity === null || identity === undefined) return false;
    const n = Number(pid);
    if (!Number.isInteger(n) || n <= 0) return false;
    const filePath = spawnRecordPath(options.root ?? defaultRegistryRoot(), identity.sessionId, n);
    if (!fs.existsSync(filePath)) return false;
    fs.rmSync(filePath, { force: true });
    return true;
  } catch {
    return false;
  }
}
