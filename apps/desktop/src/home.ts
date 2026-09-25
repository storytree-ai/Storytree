/**
 * The storytree 0.3 desktop app's home. Everything the app keeps lives in ~/.storytree/0.3/: its
 * Postgres cluster in pgdata/ (with the server's logs and owner record beside it), and Electron's
 * own files in electron/. Nothing else in ~/.storytree/ is ever read or written: storytree 0.2
 * keeps its files there (secrets.json among them), and 0.3 leaves them alone.
 *
 * The seed script (scripts/seed-library-story.mjs) imports this too, so the two agree on where
 * the library is.
 */
import { homedir } from "node:os";
import path from "node:path";

export interface AppHome {
  /** ~/.storytree/0.3 */
  readonly dir: string;
  /** The Postgres cluster: ~/.storytree/0.3/pgdata */
  readonly pgdata: string;
  /** Electron's own files, its cache and settings: ~/.storytree/0.3/electron */
  readonly electron: string;
}

/** The app's home under `home` (by default, the user's home directory). */
export function appHome(home: string = homedir()): AppHome {
  const dir = path.join(home, ".storytree", "0.3");
  return { dir, pgdata: path.join(dir, "pgdata"), electron: path.join(dir, "electron") };
}

/** How the app names itself as the owner of its Postgres data, so a start refused by it can say so. */
export const APP_OWNER = "the storytree 0.3 desktop app";
