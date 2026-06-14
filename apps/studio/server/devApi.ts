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
import { handleApiRequest, resolveStudioPaths, type Paths } from './apiRouter';
import { createInviteMailer, type InviteMailer } from './inviteMailer';

// Re-exported for the existing integration tests (the route table's real home).
export { handleHealth, handlePresence, handleActivity, type HealthDeps } from './apiRouter';

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
