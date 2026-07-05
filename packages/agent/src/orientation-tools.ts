/**
 * Read-only orientation tool surface (ADR-0108 Phase 1; parameterized drill-downs added for the
 * in-app orchestrator's self-onboarding — the "answer these sorts of questions" gap).
 *
 * Wraps the storytree read surfaces (tree, library, noticeboard, agents) as injectable tools for
 * the orchestrator agent. Each tool takes OPTIONAL subcommand args, so the agent can follow the
 * ADR-0023 `next:` pointers the envelopes hand it (`tree spec <node-id>`, `library artifact <id>`,
 * `agents session-orchestrator`, …) instead of being stuck on the fixed dashboards.
 *
 * Write is structurally impossible, belt-and-braces-and-wall:
 *   1. No write tool is exposed (no Write/Edit/Bash — the tool set is read surfaces only).
 *   2. A WRITE VERB routed as an arg (`declare`, `edit`, `new`, `build`, …) is refused AT THE
 *      SURFACE — the runner is never called (fail-closed, {@link WRITE_VERBS}).
 *   3. `deps.writable` is always `false`, so even a write verb that slipped past the surface is
 *      refused by the CLI's `notWritable` guard (packages/cli/src/commands.ts); the drive-composed
 *      runner (packages/drive/src/orientation-runner.ts) dispatches no write verb at all.
 *
 * NOTE: this module intentionally has NO import from `@storytree/cli`. That package
 * depends on `@storytree/agent`, so the reverse would introduce a cycle. The runner
 * (the real `run(argv, deps)` or drive's `createOrientationRunner`) is injected by the caller,
 * making the surface offline-testable through a stub.
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
 * Injectable runner seam: the real `run(argv, deps)` from @storytree/cli, drive's composed
 * orientation runner, or an offline stub. `deps` is typed `unknown` so any concrete deps type is
 * safely assignable (the runner is contravariant in its parameter types; accepting `unknown` is
 * wider than any concrete type).
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
  /** What the tool reads and which drill-down args it takes — shown to the model. */
  readonly description: string;
  /**
   * Dispatch the orientation command (base verb + optional drill-down args) and return the
   * formatted envelope body. Never throws; a write verb in the args is refused at the surface.
   */
  call(args?: readonly string[]): Promise<string>;
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

/**
 * The write/act verbs no orientation argv may carry (fail-closed, exact-token match). The runner
 * behind the surface refuses these anyway (`writable: false` / no dispatch), but the surface
 * refuses them FIRST so no write verb ever reaches a runner — the Phase-1 wall is the surface's
 * own invariant, not a downstream courtesy.
 */
const WRITE_VERBS = new Set([
  "declare", "done", // noticeboard writes
  "new", "edit", "retire", // library artifact writes
  "sync-agents", "sync-corpus", "export-corpus", "graduate", // seed/store reconciliation writes
  "attest", "vouch", // witness writes
  "build", "adopt", "orchestrate", // build/spend verbs
]);

/**
 * Normalize the model-supplied args into the drill-down tail of the argv:
 * strip a pasted `storytree`/`pnpm` prefix and a duplicated leading tool name (the model often
 * pastes a whole `next:` pointer), and drop `--pg` (the store is injected — the flag is inert
 * noise here). Everything else passes through verbatim.
 */
function normalizeArgs(name: string, args: readonly string[]): string[] {
  const out = args.filter((a) => a !== "--pg");
  while (out.length > 0 && (out[0] === "storytree" || out[0] === "pnpm")) out.shift();
  if (out[0] === name) out.shift();
  return out;
}

// ---------------------------------------------------------------------------
// Surface builder
// ---------------------------------------------------------------------------

/** The read surfaces exposed, with the model-facing description of each drill-down. */
const READ_SURFACES: readonly { name: string; description: string }[] = [
  {
    name: "tree",
    description:
      "Read-only work-hierarchy view (stories > capabilities > contracts). No args: every story " +
      "with status. args ['<story-id>']: one story's capabilities, statuses, build surface, and " +
      "dependency edges. args ['spec', '<node-id>']: the FULL spec markdown for one story or " +
      "capability — use this to answer what a capability actually does. Follow the envelope's " +
      "next: pointers (drop the leading 'storytree').",
  },
  {
    name: "library",
    description:
      "Read-only knowledge library (ADR-0023 choose-your-own-adventure). No args: the dashboard. " +
      "args ['artifact', '<id>']: one artifact's full body (definitions, principles, ceremonies, " +
      "process docs). args ['artifact', 'list', '<category>']: the ids in a category. Follow the " +
      "envelope's next: pointers just-in-time; never guess what a term means when you can pull it.",
  },
  {
    name: "noticeboard",
    description:
      "Read-only notice board: the active sessions, what each is working on, and which story " +
      "nodes they hold. No args.",
  },
  {
    name: "agents",
    description:
      "Read-only agent-guidance renderer. No args: the available agent names. args ['<name>']: " +
      "that agent's assembled operating guidance — call with ['session-orchestrator'] to onboard " +
      "yourself (your own charter, ceremonies, and rules). args ['<name>', '--step', '<step>']: " +
      "one workflow step's just-in-time refs.",
  },
];

/**
 * Build the read-only orientation tool surface.
 *
 * Each returned tool calls the runner with its base verb plus the normalized drill-down args and
 * a deps object that has `writable: false` (belt-and-braces guard). The result envelope is
 * formatted and returned as a string — never thrown, even when `ok` is false. A write verb in the
 * args is refused at the surface: the runner is never called.
 *
 * @param runner - The CLI `run(argv, deps)` function, drive's composed runner, or an offline stub.
 * @param opts   - The outer deps; `store` is forwarded into the runner's deps.
 * @returns      Exactly four tools: `tree`, `library`, `noticeboard`, `agents`.
 */
export function buildOrientationTools(
  runner: OrientationRunner,
  opts: OrientationOpts,
): OrientationTool[] {
  // writable: false is the structural barrier — writes refused by the CLI's notWritable guard.
  const deps = { store: opts.store, writable: false as const };

  function makeTool(name: string, description: string): OrientationTool {
    return {
      name,
      description,
      async call(args: readonly string[] = []): Promise<string> {
        const tail = normalizeArgs(name, args);
        const writeVerb = tail.find((a) => WRITE_VERBS.has(a));
        if (writeVerb !== undefined) {
          return (
            `read-only orientation surface: "${writeVerb}" is a write/act verb and is refused ` +
            `here — this session reads and proposes only (ADR-0091). Writes happen inside ` +
            `spawned sessions under their own fences.\n`
          );
        }
        const envelope = await runner([name, ...tail], deps);
        return formatEnvelope(envelope);
      },
    };
  }

  return READ_SURFACES.map((s) => makeTool(s.name, s.description));
}
