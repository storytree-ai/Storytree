/**
 * Ambient presence automation surface (ADR-0033 Decision 3: advisory-by-construction).
 *
 * Every exported function is fail-silent: presence failures never surface through
 * fn's result or errors, never throw, never reject, never write output.
 *
 * This module is self-contained — no Envelope, no commands.ts wiring.
 * It imports only types from ./noticeboard.js (never the pg store).
 */
import type { PresenceDeclarationDoc } from "@storytree/core";

import type { PresenceStoreLike, SessionIdentity } from "./noticeboard.js";

// ---------------------------------------------------------------------------
// Exported interfaces
// ---------------------------------------------------------------------------

export interface AmbientDeps {
  store: PresenceStoreLike | null;
  identity: SessionIdentity | null;
  now: () => Date;
}

export interface BuildPresenceInfo {
  nodeId: string;
  runId: string;
  mode: string;
}

export interface HeartbeatState {
  readLastBump: () => string | null;
  writeLastBump: (iso: string) => void;
}

// ---------------------------------------------------------------------------
// withPresence
// ---------------------------------------------------------------------------

/**
 * Spine-side build wrapper. Declares presence before `fn`, marks done in a finally.
 * EVERY presence failure is swallowed silently; `fn`'s result (or thrown error)
 * passes through unchanged. The wrapper never adds output of its own.
 */
export async function withPresence<T>(
  deps: AmbientDeps,
  info: BuildPresenceInfo,
  fn: () => Promise<T>,
): Promise<T> {
  const { store, identity } = deps;

  // Null deps → just run fn directly
  if (store === null || identity === null) {
    return fn();
  }

  const nowIso = deps.now().toISOString();
  const doc: PresenceDeclarationDoc = {
    sessionId: identity.sessionId,
    branch: identity.branch,
    workingOn: `${info.mode} run ${info.runId}`,
    nodes: [info.nodeId],
    status: "active",
    startedAt: nowIso,
    lastSeenAt: nowIso,
  };

  // Declare before fn — fail-silent
  try {
    await store.declare(doc);
  } catch {
    // swallow
  }

  try {
    return await fn();
  } finally {
    // Mark done — fail-silent
    try {
      await store.done(identity.sessionId, deps.now().toISOString());
    } catch {
      // swallow
    }
  }
}

// ---------------------------------------------------------------------------
// sessionHook
// ---------------------------------------------------------------------------

/**
 * Fire-and-forget hook handler.
 * `start` declares (empty nodes), `end` marks done.
 * Races the store call against `opts.timeoutMs`.
 * ALWAYS resolves `""` — never throws, never rejects, no output on any path.
 */
export async function sessionHook(
  kind: "start" | "end",
  deps: AmbientDeps,
  opts: { workingOn: string; timeoutMs: number },
): Promise<string> {
  const { store, identity } = deps;

  if (store !== null && identity !== null) {
    const nowIso = deps.now().toISOString();

    try {
      let storeCall: Promise<unknown>;

      if (kind === "start") {
        storeCall = store.declare({
          sessionId: identity.sessionId,
          branch: identity.branch,
          workingOn: opts.workingOn,
          nodes: [],
          status: "active",
          startedAt: nowIso,
          lastSeenAt: nowIso,
        });
      } else {
        storeCall = store.done(identity.sessionId, nowIso);
      }

      // Suppress any rejection so the race itself never throws
      const safeCall = storeCall.catch(() => undefined);
      const timeout = new Promise<void>((resolve) =>
        setTimeout(resolve, opts.timeoutMs),
      );
      await Promise.race([safeCall, timeout]);
    } catch {
      // swallow — belt-and-suspenders
    }
  }

  return "";
}

// ---------------------------------------------------------------------------
// statuslineGlance
// ---------------------------------------------------------------------------

/**
 * Glance + heartbeat. Returns a single status line (count, own nodes, overlap
 * warning) on success; `""` on any failure. The heartbeat re-declares this
 * session's current doc with `lastSeenAt = now()` when the debounce window
 * has expired, and writes the bump timestamp via `state.writeLastBump`.
 */
export async function statuslineGlance(
  deps: AmbientDeps,
  state: HeartbeatState,
  debounceMs: number,
): Promise<string> {
  const { store, identity } = deps;

  if (store === null || identity === null) {
    return "";
  }

  let active: PresenceDeclarationDoc[];
  try {
    active = await store.listActive();
  } catch {
    return "";
  }

  const now = deps.now();

  // Find own doc
  const ownDoc = active.find((d) => d.sessionId === identity.sessionId);

  // Heartbeat: re-declare when debounce window has expired
  const lastBump = state.readLastBump();
  const shouldBump =
    lastBump === null ||
    now.getTime() - new Date(lastBump).getTime() >= debounceMs;

  if (shouldBump && ownDoc !== undefined) {
    try {
      const updated: PresenceDeclarationDoc = {
        ...ownDoc,
        lastSeenAt: now.toISOString(),
      };
      await store.declare(updated);
      state.writeLastBump(now.toISOString());
    } catch {
      // fail-silent
    }
  }

  // Build the status line
  const count = active.length;
  const ownNodes = ownDoc !== undefined ? ownDoc.nodes : [];

  // Overlap: another session that shares at least one of our declared nodes
  const ownNodeSet = new Set(ownNodes);
  const otherSessions = active.filter((d) => d.sessionId !== identity.sessionId);
  const hasOverlap = otherSessions.some((d) =>
    d.nodes.some((n) => ownNodeSet.has(n)),
  );

  const parts: string[] = [
    `${count} active session${count !== 1 ? "s" : ""}`,
  ];

  if (ownNodes.length > 0) {
    parts.push(`nodes: ${ownNodes.join(", ")}`);
  }

  if (hasOverlap) {
    parts.push("overlap: another session also declares one of your nodes");
  }

  return parts.join(" | ");
}

// ---------------------------------------------------------------------------
// auditHookConfig
// ---------------------------------------------------------------------------

/** Hook events that must never host noticeboard / ambient-presence commands. */
const BLOCKING_EVENTS = ["Stop", "PreToolUse", "UserPromptSubmit"] as const;

/** Keywords that identify a presence-related hook command. */
const PRESENCE_KEYWORDS = ["noticeboard", "ambient-presence"] as const;

/**
 * Audit `.claude/settings.json` text for never-blocking-hooks violations.
 * Returns one violation string per hook entry registered under `Stop`,
 * `PreToolUse`, or `UserPromptSubmit` whose command mentions `noticeboard`
 * or `ambient-presence`. Returns `[]` when clean.
 *
 * Hooks on those events that are NOT presence-shaped are NOT violations.
 */
export function auditHookConfig(settingsJsonText: string): string[] {
  let settings: unknown;
  try {
    settings = JSON.parse(settingsJsonText);
  } catch {
    return [];
  }

  if (typeof settings !== "object" || settings === null) return [];

  const hooksMap = (settings as Record<string, unknown>)["hooks"];
  if (typeof hooksMap !== "object" || hooksMap === null) return [];

  const violations: string[] = [];

  for (const eventName of BLOCKING_EVENTS) {
    const entries = (hooksMap as Record<string, unknown>)[eventName];
    if (!Array.isArray(entries)) continue;

    for (const entry of entries) {
      if (typeof entry !== "object" || entry === null) continue;
      const hookList = (entry as Record<string, unknown>)["hooks"];
      if (!Array.isArray(hookList)) continue;

      for (const hook of hookList) {
        if (typeof hook !== "object" || hook === null) continue;
        const command = (hook as Record<string, unknown>)["command"];
        if (typeof command !== "string") continue;

        const isPresenceHook = PRESENCE_KEYWORDS.some((kw) =>
          command.includes(kw),
        );
        if (isPresenceHook) {
          violations.push(
            `Violation: ${eventName} hook "${command}" — noticeboard/ambient-presence hooks must not be registered on blocking events (Stop, PreToolUse, UserPromptSubmit)`,
          );
        }
      }
    }
  }

  return violations;
}
