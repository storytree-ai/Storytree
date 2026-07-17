// storytreeDataApi — the Vite dev-server front of the studio API (the OPEN
// localhost posture). The whole route table — handlers, dispatch, central error
// mapping — lives in apiRouter.ts (studio-cloud `serve-mode`: ONE route table
// for this plugin and the hosted server); this file only wires the Vite
// lifecycle into it: paths from config.root, the backend seam, the dev-only
// code-stamp probe, and db control enabled (gcloud on the operator's own
// machine — see dbControl.ts for why that is dev-only).
//
// No policy is injected here: local dev keeps the pre-ADR-0042 behaviour —
// client-supplied comment author, unguarded asset writes, db buttons live.

import path from 'node:path';
import type { Plugin } from 'vite';
import { createBackend, selectedStore, type LibraryBackend } from './libraryBackend';
import { createCodeStampProbe, type CodeStamp } from './codeStamp';
import { handleApiRequest, resolveStudioPaths, type Paths, type BuildContext, type AdoptContext } from './apiRouter';
import { createInviteMailer, type InviteMailer } from './inviteMailer';
// The build worker machinery is relocated into @storytree/drive (ADR-0133 d.3 — a package both the studio
// server and the desktop local backend may import; ADR-0100 forbids importing apps/studio/server).
import { BuildRegistry, routedBuildRunner, adoptRunnerFromAdoptStory } from '@storytree/drive/build-worker';
import { installDevServerResilience } from './devServerResilience';

// Re-exported for the existing integration tests (the route table's real home).
export { handleHealth, handleActivity, handleClaims, type HealthDeps } from './apiRouter';

export function storytreeDataApi(): Plugin {
  let paths: Paths;
  let backend: LibraryBackend;
  let codeProbe: () => Promise<CodeStamp | null>;
  // Disabled unless the SMTP env is set locally; the open dev posture otherwise just writes the row.
  const invites: InviteMailer = createInviteMailer(process.env);
  return {
    name: 'storytree-data-api',
    configResolved(config) {
      paths = resolveStudioPaths(config.root);
      // The pg pool (if store='pg') is built lazily on first use; this just picks the impl.
      backend = createBackend({
        assetsFile: paths.assetsFile,
        commentsFile: paths.commentsFile,
        usersFile: paths.usersFile,
        attestationsFile: paths.attestationsFile,
      });
    },
    configureServer(server) {
      // FIRST: guard the process so a fire-and-forget worker job's async fault (a stray rejection, an
      // emitter 'error' from a test subprocess / pg socket) LOGS and the dev server survives, instead of
      // crashing the whole Vite process mid-run (the "Adopt kills localhost" bug). Dev-only, install-once
      // across restarts — see devServerResilience.ts. Wired before the worker so it covers it from start.
      installDevServerResilience(server.config.logger);

      // Capture the startup HEAD here, not in configResolved: configureServer is dev-only
      // (no stray git spawn during `vite build`) and runs at server start, before any pull
      // could move the checkout under us.
      codeProbe = createCodeStampProbe(paths.repoRoot);

      // UI-driven build (ADR-0090 "the local loop"): the server-process worker boundary. One
      // in-memory run registry per dev server; the runner ROUTES by unit tier — a story id drives
      // the EXISTING `story build --real` chain, a node id the EXISTING `node build --real` path
      // (ADR-0144: the real proof, persisted verdict, parked branch — no longer the --live smoke) —
      // and the discovery validates ids the SAME way the CLI prechecks (`resolveBuildConfig` /
      // `isStoryBuildable`). cli + orchestrator are imported LAZILY (inside the closures) so this
      // Vite plugin never pulls them at config-load time (the raw-TS `.js` re-export trap; the same
      // reason loadOrchestrator/PgBackend are lazy).
      const buildRegistry = new BuildRegistry();
      // Discover a unit by tier: a STORY routes to the whole-story chain (and needs its cap specs
      // for the real-buildable predicate), anything else to a single NODE. Lazily imports the
      // orchestrator (the raw-TS `.js` re-export trap — never at config-load time).
      const loadUnit = async (
        unitId: string,
      ): Promise<
        | { kind: 'node'; spec: import('@storytree/orchestrator').NodeSpec }
        | {
            kind: 'story';
            spec: import('@storytree/orchestrator').NodeSpec;
            caps: import('@storytree/orchestrator').NodeSpec[];
          }
        | null
      > => {
        const { findNodeSpecFile, loadNodeSpec } = await import('@storytree/orchestrator');
        const file = findNodeSpecFile(paths.storiesDir, unitId);
        if (file === null) return null;
        let spec: import('@storytree/orchestrator').NodeSpec;
        try {
          spec = loadNodeSpec(file);
        } catch {
          return null; // a malformed spec is not buildable, never a crash
        }
        if (spec.tier !== 'story') return { kind: 'node', spec };
        const caps = spec.capabilities
          .map((id) => {
            const f = findNodeSpecFile(paths.storiesDir, id);
            if (f === null) return null;
            try {
              return loadNodeSpec(f);
            } catch {
              return null;
            }
          })
          .filter((s): s is import('@storytree/orchestrator').NodeSpec => s !== null);
        return { kind: 'story', spec, caps };
      };
      // Hydrate CLAUDE_CODE_OAUTH_TOKEN + STORYTREE_DB_USER (pg verdict store) from
      // ~/.storytree/secrets.json when unset — the same one rotation point the CLI uses (env wins).
      // CURSOR_API_KEY hydration retired with the Cursor leaf (ADR-0198).
      const build: BuildContext = {
        registry: buildRegistry,
        // The worker routes by tier (ADR-0090/0144): a story id → `story build --real` (the honest
        // whole-story chain — authors each capability for real, opens the auto-merging PR); a node
        // id → `node build --real` (the node's REAL proof, verdict persisted; a PASS parks a
        // claude/real/<unit>-<run> branch the human lands — ADR-0031/0136). drive + orchestrator are
        // imported LAZILY inside the closures.
        runner: routedBuildRunner({
          classify: async (unitId) =>
            (await loadUnit(unitId))?.kind === 'story' ? 'story' : 'node',
          nodeBuild: async (unitId, opts) => {
            const [{ nodeBuild }, { loadLocalSecrets }] = await Promise.all([
              import('@storytree/drive/build'),
              import('@storytree/drive/secrets'),
            ]);
            loadLocalSecrets();
            return nodeBuild(unitId, { dryRun: false, real: false, ...opts });
          },
          storyBuild: async (unitId, opts) => {
            const [{ storyBuild }, { loadLocalSecrets }] = await Promise.all([
              import('@storytree/drive/build'),
              import('@storytree/drive/secrets'),
            ]);
            loadLocalSecrets();
            return storyBuild(unitId, opts);
          },
        }),
        isBuildable: async (unitId) => {
          const unit = await loadUnit(unitId);
          if (unit === null) return false;
          const { resolveBuildConfig, isStoryBuildable } = await import('@storytree/orchestrator');
          // A story is buildable when `story build <id> --real` has real work to drive; a node when
          // it carries a proof config (the SAME discovery `node build`/`story build` precheck with).
          return unit.kind === 'story'
            ? isStoryBuildable(unit.spec, unit.caps, 'real')
            : resolveBuildConfig(unit.spec) != null;
        },
      };
      // UI-driven ADOPT (ADR-0097): enter the brownfield proving process. SHARES the build registry
      // (one in-flight run; the client polls GET /api/build?runId), and drives the EXISTING `adoptStory`
      // drive entry — observe-and-sign the story's `observe` reliability gates + flip mapped → proposed —
      // lazily imported inside the closure (the raw-TS `.js` re-export trap). isAdoptable reuses the
      // SAME `storyGoGreen === 'adopt'` predicate the studio's go-green affordance is computed from, so
      // the worker never adopts a story the panel would not offer.
      const adopt: AdoptContext = {
        registry: buildRegistry,
        runner: adoptRunnerFromAdoptStory(async (storyId, opts) => {
          const [{ adoptStory }, { loadLocalSecrets }] = await Promise.all([
            import('@storytree/drive/build'),
            import('@storytree/drive/secrets'),
          ]);
          loadLocalSecrets();
          return adoptStory(storyId, opts);
        }),
        isAdoptable: async (storyId) => {
          const unit = await loadUnit(storyId);
          if (unit === null || unit.kind !== 'story') {
            return { ok: false, reason: `no story "${storyId}" (or its spec did not load)` };
          }
          const { storyGoGreen, rollupStoryGreen } = await import('@storytree/orchestrator');
          // ADR-0040 / ADR-0094 d.1: a story already PROVEN green has nothing to adopt, so refuse it
          // here just as the /api/tree panel hides the Adopt button. The SAME predicate gates both, fed
          // the SAME `rollupStoryGreen` crown the panel uses — reconstructed from the live verdict events
          // (own-proof obligations + reliability gates, the cap clause vacuous for a capless port), the
          // mirror of apiRouter's crown roll-up — so the worker can never adopt a story the panel hides.
          // Offline (no verdict events) ⇒ proven=false: the status-only reading, matching the panel.
          const events = (await backend.verdictEvents?.()) ?? null;
          const proven =
            events !== null &&
            rollupStoryGreen(
              unit.spec.capabilities,
              [...unit.spec.uatTests.filter((t) => !t.wouldBe), ...unit.spec.reliabilityGates].map(
                (o) => ({ id: o.id }),
              ),
              events,
              unit.spec.reliabilityGates.map((g) => ({ id: g.id, covers: g.covers })),
            ) === 'healthy';
          if (storyGoGreen(unit.spec, unit.caps, proven) !== 'adopt') {
            return {
              ok: false,
              reason: proven
                ? `story "${storyId}" is already proven green — its reliability gates carry a signed pass, so there is nothing to adopt (ADR-0040 / ADR-0094 d.1).`
                : `story "${storyId}" is not adoptable — Adopt is the mapped→proposed entry for a brownfield story with \`## Reliability Gates\` (ADR-0097).`,
            };
          }
          return { ok: true };
        },
      };
      const store = selectedStore();
      const target =
        store === 'pg'
          ? 'Cloud SQL Postgres (STORYTREE_STUDIO_STORE=pg)'
          : 'apps/studio/data/';
      server.config.logger.info(
        `  storytree data api: docs ← ${path.relative(paths.repoRoot, paths.docsDir)}/  ·  library/comments → ${target}`,
      );
      // Tear the pg pool down with the dev server (no-op for the JSON backend).
      server.httpServer?.on('close', () => {
        void backend.close();
      });
      // Registered directly (not in a returned post-hook) so /api/* is handled
      // BEFORE Vite's SPA fallback would rewrite it to index.html.
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (!url.pathname.startsWith('/api/')) return next();
        void handleApiRequest(req, res, url, {
          paths,
          backend,
          store: selectedStore(),
          codeStamp: codeProbe,
          allowDbControl: true,
          invites,
          build,
          adopt,
        });
      });
    },
  };
}
