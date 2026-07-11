// Electron-main repo selection module — the SELECTION LIFECYCLE AS A WHOLE, over injected ports.
//
// RepoSelection validates a candidate directory via an injected DirProbe (exists / is a
// directory / is a git repo), persists a valid one via an injected SelectionStore (and refuses
// to persist an invalid one), reads the persisted selection back, and resolves the terminal's
// cwd (the selected dir when still valid, else a caller-supplied fallback). Fails closed on
// every bad, absent, or now-invalid path: a typed reason / the fallback, NEVER a throw.
//
// No `electron` import, no `node:fs` import — the filesystem is reached ONLY through the
// injected DirProbe/SelectionStore ports, whose real adapters live as glue in the Electron main.

/** The narrow read-only filesystem seam the validator reaches the OS through. */
export interface DirProbe {
  exists(path: string): boolean;
  isDirectory(path: string): boolean;
  isGitRepo(path: string): boolean;
}

/** The narrow persistence seam for the selected repo path. */
export interface SelectionStore {
  /** The persisted selected path, or null if nothing has ever been persisted. */
  read(): string | null;
  /** Persist the selected path. */
  write(path: string): void;
}

/** The result of a selection attempt: ok with the accepted path, or a typed rejection reason. */
export type SelectResult = { ok: true; path: string } | { ok: false; reason: string };

/**
 * The deep module over the injected DirProbe/SelectionStore ports: validates, persists, reads
 * back, and resolves cwd for the Electron-main repo selection lifecycle.
 */
export class RepoSelection {
  readonly #probe: DirProbe;
  readonly #store: SelectionStore;

  constructor(probe: DirProbe, store: SelectionStore) {
    this.#probe = probe;
    this.#store = store;
  }

  /**
   * Validate `path` via the injected DirProbe (exists && isDirectory && isGitRepo). On success,
   * persist it via the injected SelectionStore and return ok. On failure, return a typed reason
   * and never write. Never throws.
   */
  select(path: string): SelectResult {
    try {
      if (!this.#probe.exists(path)) {
        return { ok: false, reason: `path does not exist: ${path}` };
      }
      if (!this.#probe.isDirectory(path)) {
        return { ok: false, reason: `path is not a directory: ${path}` };
      }
      if (!this.#probe.isGitRepo(path)) {
        return { ok: false, reason: `path is not a git repository: ${path}` };
      }
      this.#store.write(path);
      return { ok: true, path };
    } catch {
      return { ok: false, reason: `failed to validate path: ${path}` };
    }
  }

  /** The persisted selection, or null if nothing has ever been persisted. Never throws. */
  current(): string | null {
    try {
      return this.#store.read();
    } catch {
      return null;
    }
  }

  /**
   * The selected directory when the persisted selection is still valid (exists && isDirectory
   * && isGitRepo), else `fallback`. Fails closed — never throws.
   */
  resolveCwd(fallback: string): string {
    try {
      const selected = this.#store.read();
      if (
        selected !== null &&
        this.#probe.exists(selected) &&
        this.#probe.isDirectory(selected) &&
        this.#probe.isGitRepo(selected)
      ) {
        return selected;
      }
      return fallback;
    } catch {
      return fallback;
    }
  }
}
