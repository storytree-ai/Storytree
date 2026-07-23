declare module "*.mjs" {
  export interface CodexHookPolicy {
    phase: "AUTHOR_TEST" | "IMPLEMENT";
    cwd: string;
    writeGlobs: { AUTHOR_TEST: string[]; IMPLEMENT: string[] };
  }

  export interface CodexHookEvent {
    hook_event_name?: unknown;
    tool_name?: unknown;
    tool_input?: unknown;
  }

  export type CodexHookDecision =
    | { allow: true; tool: string; paths: string[] }
    | { allow: false; tool: string; paths: string[]; reason: string };

  export function decideCodexToolUse(
    args: CodexHookPolicy & { event: CodexHookEvent | unknown },
  ): CodexHookDecision;
}
