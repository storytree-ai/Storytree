// The hosted studio server (ADR-0042 d.1, studio-cloud `serve-mode`): a plain
// node:http server — the built SPA from dist/ plus the SAME /api/* route table
// the dev plugin uses (apiRouter.ts), behind the guarded posture (guestPolicy):
// every API request needs a verified identity (IAP header / local override),
// guests read + comment, admins edit assets, nobody gets db control. No Vite at
// runtime; repo paths resolve from this module's location so the container's
// preserved workspace layout works regardless of CWD.
//
// Run: `pnpm --filter studio serve` (after `pnpm --filter studio build`).
// Env: PORT (Cloud Run's contract, default 8080) · STORYTREE_STUDIO_STORE
// (pg default) · STORYTREE_STUDIO_ADMINS (comma-separated admin emails) ·
// STORYTREE_STUDIO_DEV_IDENTITY (local guarded-mode trial only).

import { createServer, type Server } from 'node:http';
import type { ServerResponse } from 'node:http';
import { promises as fs, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBackend, selectedStore, type LibraryBackend } from './libraryBackend';
import { handleApiRequest, resolveStudioPaths, type Paths } from './apiRouter';
import { createInviteMailer, disabledInviteMailer, type InviteMailer } from './inviteMailer';
import { createMetadataDbWaker, type DbWaker } from './dbWake';
import {
  createMembersPolicy,
  createDegradedPolicy,
  resolveMembersAccess,
  parseSeedAdmins,
  ADMINS_ENV,
} from './guestPolicy';
import { identityFromRequest } from './identity';
import type { CodeStamp } from './codeStamp';

const STUDIO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------- static serving (dist/, hash-routed SPA) ----------

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * Serve a file from dist/ with a traversal guard; anything that doesn't resolve
 * to a real file inside dist falls back to index.html — the app is hash-routed
 * (#/tree), so every navigable URL is `/` plus a fragment and the fallback is
 * the whole SPA story. An escape attempt (encoded dot-segments) is a hard 404.
 */
async function serveStatic(res: ServerResponse, distDir: string, rawPathname: string): Promise<void> {
  let pathname: string;
  try {
    pathname = decodeURIComponent(rawPathname);
  } catch {
    res.statusCode = 404;
    res.end('not found');
    return;
  }
  const resolved = path.resolve(distDir, '.' + (pathname.startsWith('/') ? pathname : `/${pathname}`));
  const rel = path.relative(distDir, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    res.statusCode = 404;
    res.end('not found');
    return;
  }
  const isFile = existsSync(resolved) && statSync(resolved).isFile();
  const file = isFile ? resolved : path.join(distDir, 'index.html');
  if (!existsSync(file)) {
    res.statusCode = 404;
    res.end('dist/ missing — run `pnpm --filter studio build` first');
    return;
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
  res.end(await fs.readFile(file));
}

// ---------- the server ----------

export interface StudioServerOptions {
  distDir: string;
  paths: Paths;
  backend: LibraryBackend;
  /** Bootstrap-admin seed (ADR-0043 d.4) — not the authorization list; the users projection is. */
  admins: ReadonlySet<string>;
  /** Local guarded-mode trial identity; the real IAP header always wins. */
  devIdentity?: string | undefined;
  /** Injectable for tests; the hosted default has no git and answers null. */
  codeStamp?: (() => Promise<CodeStamp | null>) | undefined;
  /** Invite-email sender; absent → a disabled mailer (invites still write their row, no email). */
  invites?: InviteMailer | undefined;
  /**
   * Hosted DB waker (studio-cloud `hosted-db-wake`, ADR-0049). The entrypoint injects the real
   * metadata-token waker; tests inject a stub. Absent → /api/db/wake answers 404.
   */
  dbWake?: DbWaker | undefined;
  /** Membership-resolution deadline; absent → MEMBERS_RESOLVE_TIMEOUT_MS. Tests shorten it. */
  membersResolveTimeoutMs?: number | undefined;
}

/**
 * Membership resolution reads the live store. If the DB is idle-stopped, the Cloud SQL connector
 * handshake can HANG for minutes rather than fail fast — so without a deadline `GET /api/me` never
 * answers and the SPA sits on "Resolving access…" indefinitely (it never reaches the storeUnreachable
 * banner the fast-fail path produces). This bounds the wait; on expiry it rejects with a
 * connection-shaped error (message carries "timeout", which `isConnectionError` matches) so the caller
 * degrades exactly like a refused connection. Kept under the client's /api/me abort (api.ts, 10s) so
 * the server answers with the wake banner before the browser gives up.
 */
const MEMBERS_RESOLVE_TIMEOUT_MS = 5_000;

/** Reject with a timeout error if `p` hasn't settled within `ms`; never leaves a dangling rejection. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    timer.unref?.(); // a hung DB attempt must not keep the process alive
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/**
 * The hosted studio as a Server (exported for the integration test, the
 * dbControl.ts pattern): /api/* through the shared route table under the guest
 * policy — identity-gated, db control structurally off — everything else
 * static from dist/.
 */
export function createStudioServer(opts: StudioServerOptions): Server {
  const codeStamp = opts.codeStamp ?? (async (): Promise<CodeStamp | null> => null);
  const invites = opts.invites ?? disabledInviteMailer();
  const membersResolveTimeoutMs = opts.membersResolveTimeoutMs ?? MEMBERS_RESOLVE_TIMEOUT_MS;
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void (async () => {
      if (url.pathname.startsWith('/api/')) {
        const identity = identityFromRequest(req, opts.devIdentity);
        // Resolve membership from the app's own users projection (ADR-0043). A store outage
        // during resolution degrades to health/me-only rather than 500-ing the diagnostics.
        let policy;
        if (!identity) {
          policy = createMembersPolicy(null, null);
        } else {
          try {
            const access = await withTimeout(
              resolveMembersAccess(opts.backend, identity, opts.admins),
              membersResolveTimeoutMs,
              'membership resolution',
            );
            policy = createMembersPolicy(identity, access);
          } catch (err) {
            // ANY failure to resolve membership against the live store degrades to the health/me-only
            // policy (with the seed-admin wake affordance) — never a 500. Every real failure mode that
            // reaches here means the same thing, "can't resolve membership right now": a refused /
            // terminated connection, the 5s wedge timeout, AND — the mode that caused the idle-stop
            // incident — a FAST stopped-instance error (~1s) whose message no regex anticipates (the
            // Cloud SQL connector learns the instance isn't running and throws before the deadline
            // fires). That last one used to miss the old `isConnectionError` gate and hit `throw err` →
            // the outer catch's bare, bodyless 500 → the SPA's /api/me errored and never reached the
            // storeUnreachable wake path, so it sat dead with no button. Degrade on every error — and
            // LOG the cause: the outer catch swallowed it silently before (no server trace of the
            // outage at all), while /api/health stays an independent probe that still tells an asleep
            // DB from an up DB hitting some other fault.
            console.error(
              '[studio] /api/me membership resolution failed — serving degraded store-unreachable policy:',
              err,
            );
            policy = createDegradedPolicy(identity, opts.admins);
          }
        }
        await handleApiRequest(req, res, url, {
          paths: opts.paths,
          backend: opts.backend,
          store: selectedStore(),
          codeStamp,
          allowDbControl: false, // gcloud-on-the-operator's-machine never holds hosted
          dbWake: opts.dbWake, // keyless Cloud SQL Admin REST — works in the container (ADR-0049)
          policy,
          invites,
        });
      } else {
        await serveStatic(res, opts.distDir, url.pathname);
      }
    })().catch(() => {
      // handleApiRequest never throws; this guards the static path's fs edges.
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    });
  });
}

// ---------- entrypoint ----------

function isMain(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && path.resolve(entry) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  const paths = resolveStudioPaths(STUDIO_ROOT);
  const backend = createBackend({
    assetsFile: paths.assetsFile,
    knowledgeFile: paths.knowledgeFile,
    commentsFile: paths.commentsFile,
    usersFile: paths.usersFile,
    attestationsFile: paths.attestationsFile,
  });
  const server = createStudioServer({
    distDir: path.join(STUDIO_ROOT, 'dist'),
    paths,
    backend,
    admins: parseSeedAdmins(process.env[ADMINS_ENV]),
    devIdentity: process.env.STORYTREE_STUDIO_DEV_IDENTITY,
    invites: createInviteMailer(process.env),
    // Hosted DB wake (ADR-0049): the runtime SA's metadata token + Cloud SQL Admin REST. Only
    // meaningful on Cloud Run; a local serve trial has no metadata server, so wake() would reject.
    dbWake: createMetadataDbWaker(),
  });
  const port = Number(process.env.PORT) || 8080;
  server.listen(port, () => {
    console.log(
      `storytree studio (hosted, ${selectedStore()} store) → http://localhost:${port} — guarded mode, db control off`,
    );
  });
  const shutdown = (): void => {
    server.close(() => {
      void backend.close().finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', shutdown); // Cloud Run's stop signal
  process.on('SIGINT', shutdown);
}
