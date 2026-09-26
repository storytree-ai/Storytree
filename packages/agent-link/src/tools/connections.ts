/**
 * The tool server's connections to storytree: one to the library's server and one to the agent
 * activity log, both at the address project routing gives, and each project's library once opened.
 * They are made on first use and kept, and dropped when storytree moves (a new address) or goes
 * away, so the next call starts afresh.
 */
import { connect, type Library, type Storytree } from "@storytree/library";

import { openActivityLog, thisMachine, type ActivityLog } from "../activity/index.js";

/** How long reaching storytree may take before a call gives up and says it isn't running. */
const CONNECT_TIMEOUT_MS = 3_000;

export interface Reached {
  readonly library: Library;
  readonly log: ActivityLog;
}

export class Connections {
  #url: string | undefined;
  #storytree: Promise<Storytree> | undefined;
  #log: Promise<ActivityLog> | undefined;
  readonly #libraries = new Map<string, Promise<Library>>();

  /** The connection to the storytree at `url`: the library's server, where projects are opened. */
  async server(url: string): Promise<Storytree> {
    if (this.#url !== url) {
      await this.close();
      this.#url = url;
    }
    return (this.#storytree ??= forgetOnFailure(connect({ url }), () => (this.#storytree = undefined)));
  }

  /** The library of `project` and the activity log, on the storytree at `url`. */
  async reach(url: string, project: string): Promise<Reached> {
    const storytree = await this.server(url);
    const machine = thisMachine();
    const opened = () => openActivityLog(url, { connectTimeoutMs: CONNECT_TIMEOUT_MS, ...(machine === undefined ? {} : { machine }) });
    const log = (this.#log ??= forgetOnFailure(opened(), () => (this.#log = undefined)));
    let library = this.#libraries.get(project);
    if (library === undefined) {
      library = forgetOnFailure(storytree.openProject(project), () => this.#libraries.delete(project));
      this.#libraries.set(project, library);
    }
    return { library: await library, log: await log };
  }

  /** Drop every connection. The next call reaches storytree afresh. */
  async close(): Promise<void> {
    const storytree = this.#storytree;
    const log = this.#log;
    this.#storytree = undefined;
    this.#log = undefined;
    this.#libraries.clear();
    this.#url = undefined;
    await Promise.allSettled([storytree?.then((server) => server.close()), log?.then((opened) => opened.close())]);
  }
}

/** `promise`, calling `forget` if it fails, so a failed connection is not kept. */
function forgetOnFailure<T>(promise: Promise<T>, forget: () => void): Promise<T> {
  promise.catch(forget);
  return promise;
}
