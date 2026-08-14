// Type declarations for the plain-ESM spawn-record module, so TypeScript callers (and `tsc
// --noEmit`) get the full surface without `allowJs` — the same arrangement as
// `scripts/resolve-bash.d.mts` and `scripts/studio.d.mts`. The implementation stays runnable by bare
// node, because `scripts/studio.mjs` imports it by relative path with no workspace install present.

/** Who owns a spawned process: the ADR-0033 D1 worktree identity, and the branch it is on. */
export interface SpawnIdentity {
  readonly sessionId: string;
  readonly branch: string;
}

/** What a caller knows about the process it is registering. */
export interface DetachedSpawn {
  /** The OS process id — the DETACHED child's, not the launcher's. */
  readonly pid: number | undefined;
  /** A human label for what this process IS — an argv rendering, not a shell-safe command. */
  readonly command: string;
  /** Where it was launched from. */
  readonly cwd: string;
}

export interface RegisterOptions {
  /** Registry root. Defaults to `~/.storytree/spawns`; injected by tests. */
  readonly root?: string;
  /**
   * The owning session. Omitted means "derive it here"; an explicit `null` is the identity GATE
   * stated as a value — it registers nothing, which is what the primary checkout and CI want.
   */
  readonly identity?: SpawnIdentity | null;
}

/** Default registry root: `~/.storytree/spawns`. */
export function defaultRegistryRoot(): string;

/** A session id reduced to something safe as a single path component. */
export function sanitizeSessionId(sessionId: string): string;

/** Where one process's record lives: `<root>/<sessionId>/<pid>.json`. */
export function spawnRecordPath(root: string, sessionId: string, pid: number): string;

/** Serialize a record — one line, so a truncated write is visibly truncated. */
export function formatSpawnRecord(record: {
  readonly sessionId: string;
  readonly branch: string;
  readonly pid: number;
  readonly command: string;
  readonly cwd: string;
  readonly startedAt: string;
}): string;

/**
 * The ADR-0033 D1 worktree identity, with `STORYTREE_SESSION_ID` winning when set and non-blank.
 * `null` for the primary checkout and for any git error (CI). Held byte-for-byte equal to the notice
 * board's `deriveIdentity` by `spawn-record.test.ts` — see that suite before changing either.
 */
export function deriveSpawnIdentity(
  runGit?: (args: string[]) => string,
  env?: Record<string, string | undefined>,
): SpawnIdentity | null;

/**
 * Register a DETACHED process on its behalf and return the record path, or `null` when nothing was
 * written (no identity, no usable pid, or an unwritable registry — all fail-silent).
 */
export function registerDetachedSpawn(
  spawn: DetachedSpawn,
  options?: RegisterOptions,
): string | null;

/** Retire one record by path. Idempotent and silent. */
export function removeSpawnRecord(filePath: string | null | undefined): void;

/**
 * Retire the record for `pid` under THIS checkout's session, for a caller that never held the path.
 * Returns whether a record was actually removed. Cannot reach another session's directory.
 */
export function removeSpawnRecordForPid(
  pid: number | undefined,
  options?: RegisterOptions,
): boolean;
