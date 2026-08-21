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
import { loadFixtureSeedUnits } from './deriveOfflineCorpus';
import { createCodeStampProbe, type CodeStamp } from './codeStamp';
import { handleApiRequest, resolveStudioPaths, type Paths } from './apiRouter';
import { createInviteMailer, type InviteMailer } from './inviteMailer';
import { installDevServerResilience } from './devServerResilience';
import { primeTraversalIndex } from './traversalApi';

// Re-exported for the existing integration tests (the route table's real home).
export { handleHealth, handleActivity, handleClaims, type HealthDeps } from './apiRouter';

/** Options for {@link storytreeDataApi}. */
export interface StorytreeDataApiOptions {
  /**
   * The EXPLICIT repo root this dev API serves `docs/` and `stories/` from (ADR-0246,
   * `foreign-project-forest-arc` inc 2) — highest precedence in `resolveStudioPaths`, ahead of
   * `STORYTREE_REPO_ROOT` and the Vite-root derivation.
   *
   * Omitted (storytree's own `vite.config.ts`), resolution is exactly as before. It exists so an
   * embedder mounting this API for a project that is NOT storytree can name the root in config
   * instead of exporting a process-global env var — `/api/tree` reads `paths.storiesDir`, so this is
   * what decides whose tree comes back.
   */
  repoRoot?: string;
}

export function storytreeDataApi(options: StorytreeDataApiOptions = {}): Plugin {
  let paths: Paths;
  let backend: LibraryBackend;
  let codeProbe: () => Promise<CodeStamp | null>;
  // Disabled unless the SMTP env is set locally; the open dev posture otherwise just writes the row.
  const invites: InviteMailer = createInviteMailer(process.env);
  return {
    name: 'storytree-data-api',
    configResolved(config) {
      paths = resolveStudioPaths(config.root, options.repoRoot);
      // The pg pool (if store='pg') is built lazily on first use; this just picks the impl.
      backend = createBackend({
        assetsFile: paths.assetsFile,
        loadSeedUnits: loadFixtureSeedUnits,
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

      // Pull the traversal replay's lazy imports and build the picker's trace index NOW, while the
      // operator is still opening the browser. Measured cold, that first request costs 6.3 s (almost
      // all of it the lazy `@storytree/context-traversal-capture` import) and the client guards it
      // with a 10 s abort — so unprimed, the panel's very first read races its own timeout on the
      // page load that matters most. Fire-and-forget: `primeTraversalIndex` swallows its own faults,
      // and the route works exactly as before if this never completes.
      void primeTraversalIndex();

      // The SAME move one layer down (ADR-0354). The pg pool is built lazily on first use, and that
      // build is a ~11 s Cloud SQL connector handshake — paid, unprimed, inside the first page
      // load's requests, several of which race hard 4 s advisory timeouts. The visible cost was not
      // slowness but ABSENCE: `/api/activity` answered `claims: null`, so the map drew no claim
      // wisps and the context-traversal picker rendered nothing at all, against a database that was
      // answering `SELECT 1` in ~250 ms. Fire-and-forget, and a no-op for the JSON backend.
      void backend.primePool?.();

      // Capture the startup HEAD here, not in configResolved: configureServer is dev-only
      // (no stray git spawn during `vite build`) and runs at server start, before any pull
      // could move the checkout under us.
      codeProbe = createCodeStampProbe(paths.repoRoot);

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
        });
      });
    },
  };
}
