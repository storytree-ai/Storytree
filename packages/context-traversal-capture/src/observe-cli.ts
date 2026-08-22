/**
 * The terminal CLI dispatch boundary (adapter id `terminal-cli-dispatch`, ADR-0235/ADR-0241).
 *
 * A terminal invocation's argv becomes a context-traversal observation ONLY when it matches an
 * allowlisted read shape below. The default answer for any invocation is zero events: this is an
 * allowlist, not a translation of argv. Write/unknown commands, and any failed invocation
 * (`ok: false`), observe nothing.
 */
import { CoverageFeature } from "@storytree/context-traversal-telemetry";
import type { ContextTraversalCoverage, ContextTraversalEvent } from "@storytree/context-traversal-telemetry";

/** Identity and time originate at the runtime adapter, never ambiently, so this stays pure. */
export interface ObserveCliDeps {
  readonly ok: boolean;
  readonly sessionId: string;
  readonly nextVisitId: () => string;
  readonly now: () => Date;
}

/**
 * The flags a `library artifact <id>` READ may carry, and what each does to the observation
 * (`linked-session-context-arc-inc-30`, defect 2).
 *
 * THIS STAYS AN ALLOWLIST. The rule it replaces was `argv.length !== 3` — a positional fence that
 * discarded EVERY flag-carrying read, which in the 2026-08-22 corpus was 72.3% of all reads (2,054
 * `--pg`, 464 `--raw`, 96 `--pg` variants, 38 `--json`). The comment it carried said a trailing
 * token made the shape "a write or otherwise non-read shape", and that was TRUE while `--pg` was a
 * write-only flag; it stopped being true when a bare read started dialling the live store
 * (ADR-0302 D1), and the fence outlived the fact it encoded.
 *
 * What is NOT widened: `--set` (the write), and every unrecognised token — a sub-verb (`edit`,
 * `new`, `history`), a `--file`, an unknown flag. The default answer is still zero events, and a
 * token this table does not name is still a refusal rather than a guess.
 *
 * No flag VALUE is ever recorded (ADR-0235 clause 6): `--raw <field>` and `--out <path>` change
 * only the read STRENGTH and whether the shape is observed at all. The field name and the output
 * path are consumed and dropped.
 */
const ARTIFACT_READ_FLAGS = {
  /** Dials the live store. Read-only on this shape; ADR-0302 D1 made it the current-state read. */
  "--pg": { takesValue: false, strength: "full_payload_read" },
  /**
   * Ignored by the bare-id render (`--json` is this verb's WRITE input, consumed by `artifact new`
   * / `edit`), so the invocation still renders — and still reads — the whole document.
   */
  "--json": { takesValue: true, strength: "full_payload_read" },
  /**
   * ONE stored field's bytes, not the document (ADR-0361). A partial read, so it observes the
   * front-matter strength: recording it as a full payload would inflate every re-read ratio taken
   * from the trace, which is the defect this increment exists to remove, not to relocate.
   */
  "--raw": { takesValue: true, strength: "front_matter_read" },
  /**
   * `--raw`'s output channel (ADR-0361 D1 — refused without one, so it never appears alone). The
   * bytes go to a FILE rather than into the window; the vocabulary's strength axis is how much of
   * the DOCUMENT was read, not where the bytes landed, so it changes neither.
   */
  "--out": { takesValue: true, strength: undefined },
} as const satisfies Record<
  string,
  { takesValue: boolean; strength: "front_matter_read" | "full_payload_read" | undefined }
>;

/**
 * Resolve the read strength of a `library artifact <id>` invocation's trailing tokens, or `null`
 * when they are not an allowlisted read shape at all.
 *
 * Weakest strength wins: `--raw <field> --pg` is a field read that happened to dial the live store,
 * not a full payload read.
 */
function classifyArtifactReadFlags(
  rest: readonly string[],
): "front_matter_read" | "full_payload_read" | null {
  let strength: "front_matter_read" | "full_payload_read" = "full_payload_read";

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === undefined) return null;

    // `--flag=value` and `--flag value` are both accepted by the CLI's parser, so both are
    // classified here — a shape the observer refused only because of its spelling would be the same
    // silent under-count in a smaller costume.
    const equals = token.indexOf("=");
    const name = equals === -1 ? token : token.slice(0, equals);
    const inlineValue = equals === -1 ? undefined : token.slice(equals + 1);

    if (!Object.hasOwn(ARTIFACT_READ_FLAGS, name)) return null;
    const flag = ARTIFACT_READ_FLAGS[name as keyof typeof ARTIFACT_READ_FLAGS];

    if (inlineValue !== undefined && !flag.takesValue) return null;
    if (flag.takesValue && inlineValue === undefined) {
      // The value is the NEXT token, and it is consumed WITHOUT being read: a `--raw` with nothing
      // after it is a malformed command the CLI itself refuses, so it observes nothing here too.
      if (index + 1 >= rest.length) return null;
      index += 1;
    }

    if (flag.strength === "front_matter_read") strength = "front_matter_read";
  }

  return strength;
}

/**
 * `library artifact <verb>` sub-verbs, refused BY NAME before the flag scan reaches them.
 *
 * Positional refusal is not enough on its own: `library artifact new --json <doc>` carries nothing
 * but allowlisted flags, so a scan that only judged the trailing tokens would observe a WRITE as a
 * full-payload read of an artifact called "new". Naming them is the fail-closed half of the
 * allowlist — an unknown third token is an id, and every known verb is not.
 *
 * `list` is absent deliberately: it is a genuine READ (a search), handled by its own branch above
 * this fence rather than refused here.
 */
const ARTIFACT_SUB_VERBS = new Set(["new", "edit", "retire", "comment", "history"]);

const TREE_SURFACE = "tree";
const LIBRARY_ARTIFACT_SURFACE = "library-artifact";
const LIBRARY_DASHBOARD_SURFACE = "library-dashboard";
const AGENTS_SURFACE = "agents";

const TERMINAL_CLI_DISPATCH_SUPPORTED = [
  "surface:direct_cli",
  "event:front_matter_read",
  "event:full_payload_read",
  "event:search",
  "field:surface_id",
] satisfies ContextTraversalCoverage["supported"];

export const TERMINAL_CLI_DISPATCH_COVERAGE: ContextTraversalCoverage = {
  adapterId: "terminal-cli-dispatch",
  supported: TERMINAL_CLI_DISPATCH_SUPPORTED,
  omitted: CoverageFeature.options.filter(
    (feature) => !(TERMINAL_CLI_DISPATCH_SUPPORTED as readonly string[]).includes(feature),
  ),
};

function visitEvent(
  kind: "front_matter_read" | "full_payload_read",
  nodeId: string,
  surfaceId: string,
  deps: ObserveCliDeps,
): ContextTraversalEvent {
  const visitId = deps.nextVisitId();
  return {
    kind,
    eventId: `event:${visitId}`,
    sessionId: deps.sessionId,
    visitId,
    nodeId,
    surfaceId,
    at: deps.now().toISOString(),
  };
}

function searchEvent(deps: ObserveCliDeps): ContextTraversalEvent {
  const searchId = deps.nextVisitId();
  return {
    kind: "search",
    eventId: `event:${searchId}`,
    sessionId: deps.sessionId,
    searchId: `search:${searchId}`,
    surfaceId: LIBRARY_ARTIFACT_SURFACE,
    operation: "library_artifact_list",
    resultNodeIds: [],
    at: deps.now().toISOString(),
  };
}

/**
 * Observe one terminal CLI invocation. Pure: no clock, no id generation, no filesystem — identity
 * and time are injected via `deps`. Observation is success-only: `ok: false` emits zero events.
 */
export function observeCliInvocation(argv: readonly string[], deps: ObserveCliDeps): ContextTraversalEvent[] {
  if (!deps.ok) return [];

  const [area, sub, third] = argv;

  if (area === "tree") {
    if (sub === "spec") {
      if (third === undefined) return [];
      return [visitEvent("full_payload_read", third, TREE_SURFACE, deps)];
    }
    if (sub === undefined) return [];
    return [visitEvent("front_matter_read", sub, TREE_SURFACE, deps)];
  }

  if (area === "library") {
    if (sub === undefined) {
      return [visitEvent("front_matter_read", "library", LIBRARY_DASHBOARD_SURFACE, deps)];
    }
    if (sub === "artifact") {
      if (third === undefined) return [];
      if (third === "list") return [searchEvent(deps)];
      if (ARTIFACT_SUB_VERBS.has(third)) return [];
      // Trailing tokens are classified against the read allowlist above rather than counted: the
      // flag-carrying READ shapes observe at their own strength, and everything else — a write
      // flag, a sub-verb, an unknown token — still observes nothing.
      const strength = classifyArtifactReadFlags(argv.slice(3));
      if (strength === null) return [];
      return [visitEvent(strength, third, LIBRARY_ARTIFACT_SURFACE, deps)];
    }
    return [];
  }

  if (area === "agents") {
    if (sub === undefined) return [];
    return [visitEvent("full_payload_read", sub, AGENTS_SURFACE, deps)];
  }

  return [];
}
