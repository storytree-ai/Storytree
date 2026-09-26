/**
 * Capability 3 · Hooks (stories/agent-link.md). Not built yet: this stub gives the contracts'
 * tests something to fail against.
 */
import type { NewLine } from "../activity/index.js";

/** What a hook is run with: the command's arguments (the harness first) and its stdin. */
export interface HookInput {
  readonly argv: readonly string[];
  readonly input: string;
}

/** The lines one hook's input makes, and the folder the session was working in. */
export interface HookLines {
  readonly folder: string;
  readonly lines: NewLine[];
}

export function hookLines(_harness: string, _input: unknown): HookLines | undefined {
  throw new Error("the hooks are not built yet");
}

export async function runHook(_hook: HookInput): Promise<void> {
  throw new Error("the hooks are not built yet");
}
