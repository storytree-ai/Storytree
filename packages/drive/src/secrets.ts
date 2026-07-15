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
 * Hydrate `env` (default `process.env`) with the known keys from the secrets file. Returns the
 * keys that were filled (for logging/tests). Env always wins; absence and parse errors are silent.
 */
export function loadLocalSecrets(env: NodeJS.ProcessEnv = process.env): string[] {
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
  for (const key of SECRET_KEYS) {
    const value = doc[key];
    if (env[key] === undefined && typeof value === "string" && value.trim().length > 0) {
      env[key] = value;
      filled.push(key);
    }
  }
  return filled;
}
