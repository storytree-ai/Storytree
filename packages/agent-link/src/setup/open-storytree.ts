/**
 * Opening storytree when it is closed. The storytree app records how it was started, in
 * `<storytree home>/app.json` (`{ "command": ..., "args": [...] }`), each time it starts; opening
 * storytree is starting that again, and waiting until its Postgres is listening (as project routing
 * sees it: a live owner record beside the app's data directory).
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { locateStorytree, storytreeHome } from "../routing/index.js";

export type StorytreeOpened = { state: "running"; url: string } | { state: "opened"; url: string } | { state: "not running"; message: string };

export interface OpenOptions {
  /** The storytree home. By default, storytreeHome(). */
  readonly home?: string;
  /** How long to wait for storytree to come up once opened. By default, 60 s: a first start makes its database. */
  readonly waitMs?: number;
}

/** Open storytree if it is closed, and say where it listens, or why it isn't running. */
export async function openStorytree(options: OpenOptions = {}): Promise<StorytreeOpened> {
  const home = options.home ?? storytreeHome();
  const dataDir = path.join(home, "pgdata");
  const now = locateStorytree({ dataDir });
  if (now.running) return { state: "running", url: now.url };

  const app = appRecord(home);
  if (app === undefined) {
    return { state: "not running", message: "storytree isn't running, and this machine has no record of how to open it: open the storytree app once" };
  }
  let failed: string | undefined;
  try {
    // Started from its own program's folder: a process working in the storytree home would keep
    // Windows from ever removing it.
    const child = spawn(app.command, app.args, { cwd: path.dirname(app.command), detached: true, stdio: "ignore" });
    child.on("error", (error) => (failed = error.message));
    child.unref();
  } catch (error) {
    failed = error instanceof Error ? error.message : String(error);
  }
  const deadline = Date.now() + (options.waitMs ?? 60_000);
  while (failed === undefined && Date.now() < deadline) {
    await sleep(250);
    const at = locateStorytree({ dataDir });
    if (at.running) return { state: "opened", url: at.url };
  }
  return {
    state: "not running",
    message: failed === undefined ? "storytree was opened but did not start in time: open the storytree app" : `storytree could not be opened (${failed}): open the storytree app`,
  };
}

/** How the app was last started, as it recorded it; undefined when it never recorded it. */
function appRecord(home: string): { command: string; args: string[] } | undefined {
  try {
    const { command, args } = JSON.parse(readFileSync(path.join(home, "app.json"), "utf8")) as { command?: unknown; args?: unknown };
    if (typeof command !== "string" || command === "") return undefined;
    return { command, args: Array.isArray(args) ? args.filter((arg): arg is string => typeof arg === "string") : [] };
  } catch {
    return undefined;
  }
}
