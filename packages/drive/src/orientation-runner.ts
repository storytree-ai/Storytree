/**
 * The composed READ-ONLY orientation runner (ADR-0108 / the desktop orientation gap).
 *
 * The headless session-orchestrator's orientation tools dispatch through an injected
 * `OrientationRunner` — `(argv, deps) => Promise<Envelope>`. The terminal CLI closes that seam over
 * its own `run()` dispatch (`packages/cli/src/commands.ts`, the `orchestrate` area); a non-CLI
 * surface (the desktop sidecar, ADR-0119) may not import `@storytree/cli` (ADR-0112: the dependency
 * runs cli → drive, never back). This factory is the drive-resident composition both kinds of
 * consumer can reach: it dispatches the SAME read commands the CLI serves — the three dashboards
 * (`tree`, `library`, `noticeboard`) plus the parameterized drill-downs (`tree <story>` /
 * `tree spec <node-id>` / `library artifact <id>` / `library artifact list <category>` /
 * `agents [<name>]`) — over injected stores, so the chat agent orients on the live three surfaces,
 * follows the ADR-0023 `next:` pointers into specific specs/artifacts, and onboards itself
 * (`agents session-orchestrator`) with no forked rendering.
 *
 * READ-ONLY BY CONSTRUCTION (the Phase-2 wall, ADR-0091): only read commands are
 * dispatchable — there is no write verb to route, and anything else returns an `ok: false`
 * envelope. The runner ignores the per-call deps the orientation tools pass (`{ store,
 * writable: false }`) exactly as the CLI's closure does — it is closed over its own injected deps.
 */

import { lookupNodeBuildConfig } from "@storytree/orchestrator";
import type { Store } from "@storytree/storage-protocol";

import type { Envelope } from "./envelope.js";
import { dashboard } from "./library-dashboard.js";
import { specView, artifactView, artifactList, agentsView } from "./orientation-reads.js";
import { noticeboardCommand } from "./noticeboard.js";
import type { PresenceStoreLike } from "./noticeboard.js";
import { treeCommand } from "./tree.js";
import type { VerdictReaderLike } from "./tree-verdicts.js";
import type { AttestationReaderLike } from "./tree-attestations.js";

/** Everything the three read commands compose over — inject live stores or offline fakes. */
export interface OrientationRunnerDeps {
  /** The knowledge store the `library` dashboard reads (live pg store or the seed corpus). */
  store: Store;
  /** The stories/ directory the `tree` view discovers story specs from. */
  storiesDir: string;
  /**
   * The registry seam for the tree view's buildable glyph. Defaults to the orchestrator's
   * `lookupNodeBuildConfig` (the same registry the CLI wires).
   */
  lookupConfig?: (id: string) => { real?: unknown } | null;
  /** The notice-board presence store — null/absent renders the board offline-silently. */
  presence?: PresenceStoreLike | null;
  /** The signed-verdict event log — null/absent drops the proof glyphs, never an error. */
  verdicts?: VerdictReaderLike | null;
  /** The ADR-0044 attestation log — null/absent drops the vouch marks, never an error. */
  attestations?: AttestationReaderLike | null;
  now?: () => Date;
}

/**
 * The runner signature the orientation tools expect (structurally matches `@storytree/agent`'s
 * `OrientationRunner`; declared locally so consumers that cannot resolve `@storytree/agent`
 * — the desktop sidecar — still get the full type from this package).
 */
export type ComposedOrientationRunner = (
  argv: readonly string[],
  deps: unknown,
) => Promise<Envelope>;

/**
 * Compose the read-only orientation runner over injected stores.
 *
 * Dispatch table (the argvs `buildOrientationTools` issues — the dashboards plus the
 * parameterized drill-downs the ADR-0023 `next:` pointers name):
 *   ["tree"]                              → the bare story tree
 *   ["tree", <story-id>]                  → one story's focused view
 *   ["tree", "spec", <node-id>]           → the full spec markdown for one story/capability
 *   ["library"]                           → the library dashboard
 *   ["library", "artifact", <id>]         → one artifact's rendered body
 *   ["library", "artifact", "list", <c>]  → the ids in one category
 *   ["agents"] / ["agents", <name>]       → the agent-guidance renderer (self-onboarding);
 *                                           ["agents", <name>, "--step", <s>] → one step's JIT refs
 *   ["noticeboard"]                       → the notice board (active sessions)
 *   anything else                         → ok:false refusal envelope (never a throw)
 */
export function createOrientationRunner(deps: OrientationRunnerDeps): ComposedOrientationRunner {
  const now = deps.now ?? ((): Date => new Date());

  return async (argv: readonly string[]): Promise<Envelope> => {
    const [area, sub, third, fourth] = argv;

    if (area === "tree") {
      // The spec drill-down: the full markdown for one node — the "what does this capability
      // actually do" read the fixed dashboards couldn't serve.
      if (sub === "spec") return specView(deps.storiesDir, third);
      return treeCommand(sub, {
        storiesDir: deps.storiesDir,
        lookupConfig: deps.lookupConfig ?? lookupNodeBuildConfig,
        presence: deps.presence ?? null,
        verdicts: deps.verdicts ?? null,
        attestations: deps.attestations ?? null,
        now,
      });
    }

    if (area === "library") {
      if (sub === undefined) return dashboard(deps.store);
      if (sub === "artifact") {
        if (third === "list") return artifactList(deps.store, fourth);
        return artifactView(deps.store, third);
      }
      // Any other library sub (edit/new/retire/sync-*/graduate/…) is not a read this runner serves.
    }

    if (area === "agents") {
      // `--step <s>` may ride anywhere after the name; writes don't exist on this surface.
      const stepIdx = argv.indexOf("--step");
      const step = stepIdx >= 0 ? argv[stepIdx + 1] : undefined;
      return agentsView(deps.store, sub === "--step" ? undefined : sub, step);
    }

    if (area === "noticeboard" && sub === undefined) {
      // The board view only — declare/done are writes and are not reachable from this runner.
      return noticeboardCommand(undefined, { nodes: [] }, {
        store: deps.presence ?? null,
        identity: null,
        now,
      });
    }

    return {
      ok: false,
      body:
        `orientation runner: unsupported command [${argv.join(" ")}] — this runner serves the ` +
        "READ orientation surfaces only (tree [<story>] / tree spec <node-id> / library / " +
        "library artifact <id> / library artifact list <category> / agents [<name>] / " +
        "noticeboard; read/propose, ADR-0091).",
      next: ["tree", "library", "noticeboard", "agents"],
    };
  };
}
