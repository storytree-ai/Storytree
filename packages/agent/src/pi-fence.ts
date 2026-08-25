/**
 * The pi write-scope FENCE (`pi-harness-admission-arc` increment 1).
 *
 * pi (github.com/earendil-works/pi, MIT) ships no permission product, but its extension API
 * supplies the strictly stronger primitive: a `tool_call` event that fires before a tool executes
 * and can BLOCK by returning `{ block: true, reason }`. That is the same shape as the `PreToolUse`
 * hook {@link ClaudeAgentAuthor} already relies on (`sdk-author.ts`), written in our stack, so the
 * honesty property the prove-it gate rests on — one agent's write ownership time-sliced by phase,
 * so the author of the test is not, at that moment, the author of the code (ADR-0020) — survives
 * the change of leaf runtime.
 *
 * THIS FILE IS THE FENCE AND NOT THE LEAF. There is no `PiPhaseAuthor` yet, no `--runtime pi`, and
 * no credential hydrated anywhere for pi. That sequencing is deliberate: ADR-0177/ADR-0198 retired
 * the Cursor leaf after it produced a dependency and a half-built path but never a verdict, and
 * after a subscription-shaped path turned out to be metered. Nothing that can authenticate or bill
 * may exist before the fence is proven.
 *
 * TWO LAYERS, BECAUSE THE SHELL IS THE HOLE. `sdk-author.ts:5` records why the Claude leaf carries
 * no Bash at all: "a shell write would bypass the scope hook". A `write`/`edit` fence with pi's
 * shell left enabled fences NOTHING — the model writes through `bash` and the handler never sees a
 * path to check. So:
 *
 *   1. {@link PI_AUTHORING_TOOLS} is the tool surface an authoring slice gets, and it excludes
 *      {@link PI_SHELL_TOOLS} entirely. This is what the Claude leaf does and is the primary wall.
 *   2. {@link decidePiToolCall} is an ALLOWLIST, not a denylist: any tool not on the authoring
 *      surface is refused by the handler regardless. The tool surface is configuration and can be
 *      misconfigured; this layer is code. It also means a pi version that ADDS a write-capable
 *      tool, or an extension that registers one, is refused by default rather than silently
 *      admitted — the failure mode a denylist cannot cover.
 *
 * FAIL-CLOSED, MATCHING sdk-author. The two existing implementations disagree on one case: a
 * write-shaped call whose path cannot be read is a pass-through in `write-scoped-executor.ts`
 * (merely noted on `noPathCalls`) and a REFUSAL in `sdk-author.ts`. This matches sdk-author.
 *
 * NO IMPORT CYCLE, AND NO RE-DERIVED PREDICATE. The scope decision is the orchestrator's
 * `WriteScope` (`packages/orchestrator/src/phase-machine.ts`), plugged in structurally as
 * `isWriteAllowed` — exactly how `sdk-author.ts` consumes it. `PathWriteScope.isWriteAllowed`
 * satisfies that signature unchanged; `pi-fence-scope.test.ts` in the orchestrator proves it.
 *
 * SINGLE IMPORT SITE, TYPE-ONLY. This is the only file in the repo that names pi (ADR-0004's
 * single-import-site rule, as `sdk-author.ts` applies it to the Agent SDK), and it imports pi
 * TYPES ONLY — no runtime import, so nothing here can reach a provider. The types are re-exported
 * below so the offline tests pin pi's contract through this file: a pi release that renames the
 * `tool_call` event, changes the block-return shape, renames a built-in tool, or renames the write
 * tools' path field turns into a RED `pnpm -r typecheck` rather than a quietly-opened write wall.
 *
 * The fence deliberately does NOT set `terminate` on a block. pi's `terminate: true` stops the
 * agent after the batch; the Claude leaf's hook denies with a reason and lets the model correct
 * itself inside the phase, and a leaf that dies on its first mis-aimed write burns the slice for
 * nothing. A refusal is final for that path, not for the slice.
 */

import * as path from "node:path";

import type {
  BashToolCallEvent,
  EditToolCallEvent,
  ExtensionAPI,
  ExtensionFactory,
  FindToolCallEvent,
  GrepToolCallEvent,
  LsToolCallEvent,
  PowerShellToolCallEvent,
  ReadToolCallEvent,
  ToolCallEvent,
  ToolCallEventResult,
  WriteToolCallEvent,
} from "@earendil-works/pi-coding-agent";

import type { AuthoringPhase } from "./phase-author.js";

/**
 * Re-surface the pi extension types the OFFLINE fence tests pin against, so this file stays the
 * single pi import site. Part of the guarantee, not convenience: `pi-fence.test.ts` types the
 * fence's contract through here and never imports pi's extension API itself.
 */
export type {
  ExtensionAPI,
  ExtensionFactory,
  ToolCallEvent,
  ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";

/**
 * pi's built-in tool names, reconstructed from pi's OWN per-tool event literals rather than
 * retyped. `ToolCallEvent` itself is useless for this — its `CustomToolCallEvent` member widens
 * `toolName` to `string` — so the union is assembled member by member. A pi release that renames
 * a built-in tool fails the literal below at compile time.
 */
type PiBuiltinToolName =
  | BashToolCallEvent["toolName"]
  | EditToolCallEvent["toolName"]
  | FindToolCallEvent["toolName"]
  | GrepToolCallEvent["toolName"]
  | LsToolCallEvent["toolName"]
  | PowerShellToolCallEvent["toolName"]
  | ReadToolCallEvent["toolName"]
  | WriteToolCallEvent["toolName"];

/** Typed at pi's union so a typo cannot silently produce a fence that refuses everything. */
const AUTHORING_TOOLS: readonly PiBuiltinToolName[] = ["read", "grep", "find", "ls", "write", "edit"];
const SHELL_TOOLS: readonly PiBuiltinToolName[] = ["bash", "powershell"];
const WRITE_TOOLS: readonly PiBuiltinToolName[] = ["write", "edit"];

/**
 * The pi tool surface an authoring slice gets: read/search plus scoped writes. NO shell — see the
 * module doc. This is the list a future `PiPhaseAuthor` passes as `createAgentSession({ tools })`.
 */
export const PI_AUTHORING_TOOLS: readonly string[] = AUTHORING_TOOLS;

/**
 * pi's shell tools. Never on the authoring surface, and refused by {@link decidePiToolCall}
 * regardless of what the surface was configured with.
 */
export const PI_SHELL_TOOLS: readonly string[] = SHELL_TOOLS;

/** The authoring tools that carry a write target and are therefore scope-checked. */
export const PI_WRITE_TOOLS: readonly string[] = WRITE_TOOLS;

/**
 * The write target's field name on pi's `write` and `edit` inputs, pinned at COMPILE time to the
 * intersection of both tools' input keys — which is `"path"` today and `never` the moment pi
 * renames either. Without this the extraction would degrade silently to "no path found, refuse
 * everything": a fence that refuses every write looks exactly like a working fence from the
 * outside, and would only surface as a leaf that can never author anything.
 */
const PI_WRITE_PATH_KEY: keyof WriteToolCallEvent["input"] & keyof EditToolCallEvent["input"] = "path";

/**
 * Why one refusal fired — a LABEL on a decision this file already makes, never a new branch.
 *
 * The first three mirror {@link SdkRefusalKind} member for member and mean the same things, so the
 * three fence mechanisms stay countable against ONE denominator (ADR-0446): a refusal stamped here
 * is comparable with one stamped by the Claude hook or the owned loop's executor. `no-path` is
 * again the case the owned loop PASSES THROUGH and both hooks fail closed on — the disagreement is
 * only findable if the two are counted apart, which is why the kind is stamped AT the refusal
 * rather than sniffed downstream out of the refusal text.
 *
 * `tool-surface` is pi's own fourth, and it has no analogue in the other two because they have no
 * analogous hole: it is the SHELL wall — a call refused for the tool it is, before any path is
 * looked at, because that tool is not on {@link PI_AUTHORING_TOOLS}. It carries no path at all, so
 * a reader must not fold it in with the path-shaped kinds. proof-protocol's `ScopeRefusalKind`
 * has no member for it today; which of its two shapes it takes at the sink — a new enum member, or
 * separate carriage the way `noPathCalls` is kept out of `refusals` — is the pi LEAF's call, when
 * there is a slice to record. Not decided here, and deliberately not pre-empted.
 *
 * A LOCAL union, deliberately, for the same reason `SdkRefusalKind` is one: `@storytree/agent`
 * depends on no other storytree package, so it does not reach for proof-protocol's enum. The drive
 * maps one onto the other at the sink.
 */
export type PiRefusalKind = "scope" | "outside-workspace" | "no-path" | "tool-surface";

/** A fail-closed refusal the fence recorded (mirrors the SDK leaf's SdkWriteViolation). */
export interface PiFenceViolation {
  phase: AuthoringPhase;
  tool: string;
  path: string;
  reason: string;
  /** Which wall it hit. Stamped at the refusal; see {@link PiRefusalKind}. */
  kind: PiRefusalKind;
}

/** The pure fence decision: allow the call through, or refuse it with a reason. */
export type PiToolCallDecision =
  | { allow: true; relPath: string }
  | { allow: false; relPath: string; reason: string; kind: PiRefusalKind };

/**
 * The pure decision the `tool_call` handler applies (exported for offline tests). Fail-closed, in
 * this order:
 *
 *  - a tool that is not on {@link PI_AUTHORING_TOOLS} is refused (covers the shell, and any tool
 *    pi or an extension adds later);
 *  - a read-shaped authoring tool is allowed;
 *  - a write-shaped call with no readable path, a path resolving outside `cwd`, or a path the
 *    phase scope denies is refused.
 */
export function decidePiToolCall(args: {
  phase: AuthoringPhase;
  cwd: string;
  toolName: string;
  toolInput: unknown;
  isWriteAllowed: (phase: AuthoringPhase, relPath: string) => boolean;
}): PiToolCallDecision {
  if (!PI_AUTHORING_TOOLS.includes(args.toolName)) {
    const shellNote = PI_SHELL_TOOLS.includes(args.toolName)
      ? " (a shell write would bypass the scope check entirely)"
      : "";
    return {
      allow: false,
      relPath: "(no path)",
      reason: `refused: '${args.toolName}' is not on the authoring tool surface${shellNote}`,
      kind: "tool-surface",
    };
  }

  if (!PI_WRITE_TOOLS.includes(args.toolName)) {
    return { allow: true, relPath: "(read-only)" };
  }

  const filePath = extractPiWritePath(args.toolInput);
  if (filePath === null) {
    return {
      allow: false,
      relPath: "(no path)",
      reason: `write refused: '${args.toolName}' call carries no readable path (fail-closed)`,
      kind: "no-path",
    };
  }

  const rel = path.relative(args.cwd, path.resolve(args.cwd, filePath)).replace(/\\/g, "/");
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return {
      allow: false,
      relPath: rel,
      reason: `write refused: '${filePath}' resolves outside the workspace`,
      kind: "outside-workspace",
    };
  }

  if (!args.isWriteAllowed(args.phase, rel)) {
    return {
      allow: false,
      relPath: rel,
      reason: `write refused by phase scope: '${args.toolName}' may not write ${rel} in phase ${args.phase}`,
      kind: "scope",
    };
  }

  return { allow: true, relPath: rel };
}

/** Pull the write target out of a pi write/edit tool input. `null` when unreadable. */
function extractPiWritePath(input: unknown): string | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }
  const value = (input as { path?: unknown })[PI_WRITE_PATH_KEY];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Build the pi extension that enforces {@link decidePiToolCall} on every tool call in one
 * authoring phase.
 *
 * The result is an `ExtensionFactory` a caller hands to pi IN PROCESS — as
 * `new DefaultResourceLoader({ extensionFactories: [...] })` — never a file dropped in
 * `~/.pi/agent/extensions/` or `.pi/extensions/`. That is a fence property, not a packaging
 * detail: an auto-discovered extension can be disabled by deleting a file or by declining project
 * trust, and a write wall that a missing file silently opens is not a wall.
 */
export function createPiScopeFence(args: {
  phase: AuthoringPhase;
  cwd: string;
  isWriteAllowed: (phase: AuthoringPhase, relPath: string) => boolean;
  onViolation?: (violation: PiFenceViolation) => void;
}): ExtensionFactory {
  return (pi: ExtensionAPI) => {
    pi.on("tool_call", (event: ToolCallEvent): ToolCallEventResult | undefined => {
      const decision = decidePiToolCall({
        phase: args.phase,
        cwd: args.cwd,
        toolName: event.toolName,
        toolInput: event.input,
        isWriteAllowed: args.isWriteAllowed,
      });
      if (decision.allow) {
        return undefined;
      }
      args.onViolation?.({
        phase: args.phase,
        tool: event.toolName,
        path: decision.relPath,
        reason: decision.reason,
        kind: decision.kind,
      });
      return { block: true, reason: decision.reason };
    });
  };
}
