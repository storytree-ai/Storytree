/**
 * Read-only orientation tool surface (ADR-0108 Phase 1).
 *
 * Wraps the three storytree read commands (tree, library, noticeboard) as injectable
 * tools for the orchestrator agent. Write is structurally impossible: no write tool is
 * exposed, and `deps.writable` is always `false` — so even if a write verb were somehow
 * routed, the CLI's `notWritable` guard (packages/cli/src/commands.ts) refuses it.
 *
 * NOTE: this module intentionally has NO import from `@storytree/cli`. That package
 * depends on `@storytree/agent`, so the reverse would introduce a cycle. The runner
 * (the real `run(argv, deps)`) is injected by the caller, making the surface offline-
 * testable through a stub.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal envelope shape the runner must return (structurally matches @storytree/cli's Envelope). */
export interface OrientationEnvelope {
  readonly ok: boolean;
  readonly body: string;
  readonly doctrine?: readonly string[];
  readonly next?: readonly string[];
}

/**
 * Injectable runner seam: the real `run(argv, deps)` from @storytree/cli or an offline stub.
 * `deps` is typed `unknown` so any concrete deps type is safely assignable (the runner is
 * contravariant in its parameter types; accepting `unknown` is wider than any concrete type).
 */
export type OrientationRunner = (
  argv: readonly string[],
  deps: unknown,
) => Promise<OrientationEnvelope>;

/** The outer deps the caller provides to wire the store into orientation commands. */
export interface OrientationOpts {
  /** The store for the orientation surface (null for offline/in-memory runs). */
  store: unknown;
}

/** One read-only orientation tool exposed to the model. */
export interface OrientationTool {
  readonly name: string;
  /** Dispatch the orientation command and return the formatted envelope body. Never throws. */
  call(): Promise<string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Render an envelope to the text the model reads.
 * Mirrors `formatEnvelope` in packages/drive/src/envelope.ts — duplicated here to avoid the
 * drive→agent→drive import cycle.
 */
function formatEnvelope(e: OrientationEnvelope): string {
  const parts: string[] = [e.body.replace(/\s+$/, "")];
  if (e.doctrine !== undefined && e.doctrine.length > 0) {
    parts.push("doctrine:\n" + e.doctrine.map((d) => `  - ${d}`).join("\n"));
  }
  if (e.next !== undefined && e.next.length > 0) {
    parts.push("next:\n" + e.next.map((n) => `  - ${n}`).join("\n"));
  }
  return parts.join("\n\n") + "\n";
}

// ---------------------------------------------------------------------------
// Surface builder
// ---------------------------------------------------------------------------

/**
 * Build the read-only orientation tool surface.
 *
 * Each returned tool calls the runner with its fixed argv and a deps object that has
 * `writable: false` (belt-and-braces guard). The result envelope is formatted and returned
 * as a string — never thrown, even when `ok` is false.
 *
 * @param runner - The CLI `run(argv, deps)` function (or offline stub).
 * @param opts   - The outer deps; `store` is forwarded into the runner's deps.
 * @returns      Exactly three tools: `tree`, `library`, `noticeboard`.
 */
export function buildOrientationTools(
  runner: OrientationRunner,
  opts: OrientationOpts,
): OrientationTool[] {
  // writable: false is the structural barrier — writes refused by the CLI's notWritable guard.
  const deps = { store: opts.store, writable: false as const };

  function makeTool(name: string, argv: readonly string[]): OrientationTool {
    return {
      name,
      async call(): Promise<string> {
        const envelope = await runner(argv, deps);
        return formatEnvelope(envelope);
      },
    };
  }

  return [
    makeTool("tree", ["tree"]),
    makeTool("library", ["library"]),
    makeTool("noticeboard", ["noticeboard"]),
  ];
}
