/**
 * Capability 8 · Setup check (stories/agent-link.md). Not built yet: this stub gives the contracts'
 * tests something to fail against.
 */

/** The command a harness runs as storytree's hook: a Node and the built hook script. */
export interface HookCommand {
  readonly node: string;
  readonly script: string;
}

/** Where each harness keeps its settings: Claude Code's config folder (~/.claude) and Codex's home (~/.codex). */
export interface Homes {
  readonly claude?: string;
  readonly codex?: string;
}

export type HookRegistration = "registered" | "already registered" | "not here";

export interface HooksReport {
  readonly "claude-code": HookRegistration;
  readonly codex: HookRegistration;
}

export type StorytreeOpened = { state: "running"; url: string } | { state: "opened"; url: string } | { state: "not running"; message: string };

export interface SetupOptions {
  /** The folder the session works in. */
  readonly folder: string;
  /** The hook command to register; without one, no hooks are registered. */
  readonly hook?: HookCommand;
  /** Where the harnesses keep their settings. By default, CLAUDE_CONFIG_DIR or ~/.claude, and CODEX_HOME or ~/.codex. */
  readonly homes?: Homes;
  /** The storytree home, where the app keeps its Postgres and how to open it. By default, storytreeHome(). */
  readonly storytreeHome?: string;
  /** How long to wait for storytree to come up after opening it. */
  readonly openWaitMs?: number;
}

export interface SetupReport {
  readonly storytree: StorytreeOpened;
  readonly hooks: HooksReport | undefined;
  readonly project: { status: "set up"; name: string } | { status: "ask"; suggestion: string };
}

export async function runSetupCheck(_options: SetupOptions): Promise<SetupReport> {
  throw new Error("the setup check is not built yet");
}

export function registerHooks(_homes: Homes, _hook: HookCommand): HooksReport {
  throw new Error("the setup check is not built yet");
}

export function removeHooks(_homes: Homes): { "claude-code": "removed" | "none"; codex: "removed" | "none" } {
  throw new Error("the setup check is not built yet");
}

export async function openStorytree(_options: { home?: string; waitMs?: number } = {}): Promise<StorytreeOpened> {
  throw new Error("the setup check is not built yet");
}
