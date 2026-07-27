// Repo-root resolution (ADR-0246, `foreign-project-forest-arc` increment 1) — the repo root is a
// PARAMETER, not a derivation from the reading module's own location.
//
// WHY: every root in the system was computed from `import.meta.url` (or, in one case, `process.cwd()`)
// walking up a fixed number of directories — `resolveStudioPaths`, the CLI's `repoRoot()`,
// `check-boundaries`, `load-corpus`'s `dataPath`, and the three `build-*` renderers. That derivation
// hard-codes the answer "the repo you are reading this code out of", which is exactly the assumption a
// forest for a project that is NOT storytree has to break (ADR-0246 D2: this arc owns the tree inside
// the deployment). ADR-0244 D3 forces the same seam from the other side — a user build has no
// `stories/**` and no `docs/decisions/**` of ours to walk up to.
//
// This module is PURE (no `node:` imports, no `process`, no fs) so it lives in the browser-safe root
// barrel and every consumer — the CLI, the library's own node-only store subpath, and the studio
// server (which cannot statically import `@storytree/library/store` without breaking `vite build`) —
// reaches the SAME decision logic. Callers supply the three candidate sources; this decides between
// them. The module-location derivation survives as the last resort, so storytree's own loop is
// unchanged when nothing is configured.

/** The environment variable that points storytree at the repo its forest describes. */
export const REPO_ROOT_ENV = "STORYTREE_REPO_ROOT";

/** Which of the three sources supplied the resolved root — for logging and for tests. */
export type RepoRootSource = "explicit" | "env" | "derived";

/**
 * The three candidate sources, in precedence order. `explicit` and `env` are optional because a
 * caller that has neither still resolves — to `derived`, today's behaviour.
 */
export interface RepoRootSources {
  /**
   * A root the caller was handed directly (a CLI flag, a config field, a function argument). Wins
   * over everything: an explicit argument is the most specific statement of intent available.
   */
  explicit?: string | null | undefined;
  /**
   * The {@link REPO_ROOT_ENV} value, read by the caller (`process.env[REPO_ROOT_ENV]`) so this core
   * stays pure. Second in precedence: it configures a whole process, but a per-call argument is more
   * specific still.
   */
  env?: string | null | undefined;
  /**
   * The module-location derivation the site used before this seam existed — the last resort, and
   * therefore REQUIRED. Keeping it mandatory is deliberate: there is no "unresolved" outcome, so no
   * call site can fail closed on a machine where nothing is configured, and storytree's own
   * self-hosted loop keeps working with zero configuration.
   */
  derived: string;
}

/** The resolved root plus the source that won, so a caller can log or assert which one applied. */
export interface ResolvedRepoRoot {
  root: string;
  source: RepoRootSource;
}

/** A candidate counts as supplied only when it is a non-blank string; `"   "` is not a path. */
function usable(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolve the repo root from the three sources, `explicit` > `env` > `derived`.
 *
 * Blank and whitespace-only values are treated as UNSET rather than as a root: an exported-but-empty
 * `STORYTREE_REPO_ROOT=` is how a shell says "not configured", and reading it as the empty path would
 * silently resolve every `path.join` against the filesystem root.
 *
 * Total — always returns a root, never throws. Validation that the resolved root actually contains
 * what the caller wants (a `docs/`, a `stories/`) belongs to the caller, which knows what it needs.
 */
export function resolveRepoRoot(sources: RepoRootSources): ResolvedRepoRoot {
  const explicit = usable(sources.explicit);
  if (explicit) return { root: explicit, source: "explicit" };
  const env = usable(sources.env);
  if (env) return { root: env, source: "env" };
  return { root: sources.derived, source: "derived" };
}
