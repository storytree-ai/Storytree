import * as fs from "node:fs";
import * as os from "node:os";
import path from "node:path";

/**
 * User-level secrets hydration (owner call, 2026-06-11): the CLI auto-fetches the credentials its
 * live paths need from `~/.storytree/secrets.json` so they survive across sessions and git
 * worktrees (an in-repo secrets folder would not — untracked files don't follow worktrees).
 *
 * Precedence is fail-safe and explicit: a variable already set in the environment ALWAYS wins;
 * the file only fills gaps. A missing or malformed file is silently ignored — offline commands
 * never need it, and the live paths fail with their own actionable refusals when a credential is
 * genuinely absent. Only the known keys are hydrated; the file cannot inject arbitrary env.
 *
 * A BLANK VALUE IS A GAP, NOT A CREDENTIAL — see {@link presentEnv}. `VAR=` is how a shell says "not
 * configured", and a shell-mangled command substitution produces exactly that. Reading it as a
 * credential sent it to the Cloud SQL connector, which failed with a message about the DATABASE:
 * measured 2026-08-02 (branch `claude/musing-hertz-44d3ee`), `/api/health` answered
 * `{"store":"pg","db":"unreachable"}` and `/api/tree` 503'd for ~25 minutes while a direct connector
 * `SELECT 1` answered `{"ok":1}` the whole time. That is worse than a wasted probe: it manufactures
 * exactly the evidence `asset:probe-dont-assume-db-reachability` tells a session to trust, and sends
 * the next one down the `db:up` / `db:status` / ADR-0250 remote-session tree — a whole diagnostic
 * branch rooted at the wrong substrate.
 *
 * `STORYTREE_SECRETS_FILE` overrides the location (tests point it at a fixture).
 */

/** The env keys the secrets file may fill. Nothing else is read from it. */
export const SECRET_KEYS = [
  "CLAUDE_CODE_OAUTH_TOKEN",
  "STORYTREE_DB_USER",
] as const;

/** Default file location: `~/.storytree/secrets.json`. */
export function defaultSecretsFile(): string {
  return path.join(os.homedir(), ".storytree", "secrets.json");
}

/**
 * An env var's value only if it is actually PRESENT — trimmed, or `undefined` when unset, empty, or
 * whitespace-only.
 *
 * The house rule, applied to credentials. `resolveRepoRoot` already settled the identical question
 * for paths with its `usable()` predicate, on the stated reasoning that `VAR=` is how a shell says
 * "not configured" and reading it as a value would silently resolve every join against the filesystem
 * root. A blank credential fails the same way one level further out: it reads as PRESENT, travels to
 * the connector, and surfaces as a database that is perfectly healthy being reported unreachable.
 *
 * Use this at every credential READ SITE instead of `=== undefined`, so a mangled export is refused at
 * the boundary that can still name the variable.
 */
export function presentEnv(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Hydrate `env` (default `process.env`) with the known keys from the secrets file. Returns the
 * keys that were filled (for logging/tests). Env always wins; absence and parse errors are silent.
 *
 * "Env always wins" means a REAL value wins. A key that is absent OR blank is a gap the file fills,
 * so a shell-mangled `STORYTREE_DB_USER=` SELF-HEALS from `~/.storytree/secrets.json` instead of
 * suppressing the very hydration that would have fixed it — which is what the old `=== undefined`
 * test did. Precedence for every non-blank value is unchanged.
 */
export function loadLocalSecrets(
  env: NodeJS.ProcessEnv = process.env,
  keys: readonly (typeof SECRET_KEYS)[number][] = SECRET_KEYS,
): string[] {
  const file = env["STORYTREE_SECRETS_FILE"] ?? defaultSecretsFile();
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
  if (typeof parsed !== "object" || parsed === null) return [];
  const doc = parsed as Record<string, unknown>;
  const filled: string[] = [];
  for (const key of keys) {
    const value = doc[key];
    if (presentEnv(key, env) === undefined && typeof value === "string" && value.trim().length > 0) {
      env[key] = value;
      filled.push(key);
    }
  }
  return filled;
}
