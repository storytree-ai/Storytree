// The spike harness's vite config (dev-only, never shipped — the package exports
// only src/; this page exists so eyes can witness the stack drawing a real World).
import { createReadStream } from 'node:fs';
import { dirname, extname, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * SERVE THE COMMITTED RESEARCH RENDERS AT `/reference/<file>`.
 *
 * ⚠ WHY A ROUTE AND NOT A RELATIVE PATH. Vite's root here is `harness/`, so a page cannot reach
 * `docs/research/` with an ordinary `src` — it is outside the served tree, and the escape hatches
 * (`/@fs/<absolute>`, a widened `server.fs.allow`) both bake THIS MACHINE'S checkout path into a
 * committed page. This route is resolved from the config's own location, so it is the same on any
 * checkout and in CI.
 *
 * ⚠ IT EXISTS BECAUSE THE REFERENCE ARM IS LOAD-BEARING ON THIS ARC, not for convenience. Every
 * crossing is judged against the picture the owner approved rather than against its own best arm
 * (his instruction, twice), so a comparison page that cannot display that picture is missing the
 * only arm the verdict is actually taken against.
 *
 * ⚠ IT IS READ-ONLY AND PATH-FENCED. Everything after `/reference/` is normalised and required to
 * resolve back inside the research directory, so a `..` in the URL cannot walk out of it — a dev
 * server that served the whole disk to any page on localhost would be a worse thing than the
 * problem it solved.
 */
function researchRenders(): Plugin {
  const ROOT = resolve(HERE, '..', '..', '..', 'docs', 'research');
  const TYPES = new Map([
    ['.png', 'image/png'],
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.webp', 'image/webp'],
    // The spacing ladder's exported scene graphs (ADR-0521): the REAL 2D layout per rung, written by
    // `apps/studio/scripts/export-spacing-scenes.mjs` beside its evidence and read by
    // `shipped-spacing-scene.ts` through this same fenced route — the layout is evidence too.
    ['.json', 'application/json'],
  ]);
  return {
    name: 'storytree-research-renders',
    configureServer(server) {
      server.middlewares.use('/reference', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/').replace(/^\/+/, '');
        const file = resolve(ROOT, normalize(rel));
        const type = TYPES.get(extname(file).toLowerCase());
        if (!file.startsWith(ROOT + sep) || type === undefined) {
          next();
          return;
        }
        res.setHeader('Content-Type', type);
        createReadStream(file)
          .on('error', () => next())
          .pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), researchRenders()],
  server: { port: 5184, strictPort: true },
});
