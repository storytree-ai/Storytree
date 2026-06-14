// Store-health banner: a slim strip under the topbar that only appears when
// the live (pg) store is unreachable. The studio defaults to the shared Cloud
// SQL store, which is STOPPED when idle for cost (ADR-0015) — so the common
// failure mode is "the instance is off" and the fix is one click. The banner
// polls /api/health slowly while healthy and fast while down, refines "down"
// into stopped-vs-still-booting via one /api/db/status check per outage, and
// offers a Start DB button (idempotent, ~1 minute). When the probe flips back
// to ok it calls onRecovered so the app can reload whatever the outage cost.
// It ALSO watches the health probe's schema-skew pair: a DB holding a newer
// library schemaVersion than this server's code means a stale long-running
// server (the "specs is not iterable" incident) — a distinct banner says to
// git pull and pnpm studio:down/up instead of blaming the DB. And when
// /api/health ITSELF stops answering repeatedly, the banner says the studio
// server is unreachable rather than spinning on a DB phase forever.
// Independently of all DB phases it watches the health probe's CODE STAMP
// (server-start HEAD vs the checkout's HEAD now): a moved checkout means the
// running server is serving stale code — new endpoints 404, the bundle is old
// (the /api/presence incident) — and that banner outranks everything else,
// because a stale server makes every other signal suspect.

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';

const SLOW_POLL_MS = 30_000;
const FAST_POLL_MS = 5_000;
// Consecutive /api/health failures before the banner stops blaming the DB and says the
// studio server itself is unreachable. One failure is a blip; three in a row (~15s on the
// fast poll) is the dev server gone — without this, a banner stuck on 'starting' would
// spin forever while polling a dead server (the 2026-06-12 incident's second half).
export const SERVER_LOST_AFTER = 3;

type Phase =
  | 'unknown' // no health response yet — render nothing rather than flash a warning
  | 'healthy' // pg store, probe ok
  | 'json' // offline json store — the DB is not in play
  | 'stopped' // unreachable and Cloud SQL reports STOPPED — offer Start DB
  | 'unreachable' // unreachable but RUNNABLE (or status unknown) — likely coming up
  | 'starting' // we fired /api/db/start and are waiting for the probe to flip
  | 'stale-code' // DB reachable but holds a NEWER library schemaVersion than this server's code
  | 'server-lost'; // /api/health itself has stopped answering — the dev server, not the DB

export function StoreBanner({
  onRecovered,
  canWake = false,
}: {
  onRecovered: () => void;
  /**
   * Hosted-mode admins (ADR-0049): show a "Wake the database" button that calls the keyless
   * Cloud SQL Admin REST endpoint, instead of the local gcloud Start DB. False (the default, and
   * the local dev posture) keeps the existing gcloud flow untouched.
   */
  canWake?: boolean;
}): React.JSX.Element | null {
  const [phase, setPhase] = useState<Phase>('unknown');
  const [startError, setStartError] = useState('');
  // The skew pair when phase === 'stale-code' (DB schemaVersion ahead of this server's code).
  const [skew, setSkew] = useState<{ code: number; db: number } | null>(null);
  // The code stamp when the checkout has MOVED under the running server (health.code.stale).
  // Deliberately NOT a phase: it is independent of the DB state machine (a server can be
  // stale while the DB is stopped, starting, or fine) and it outranks every phase render.
  const [moved, setMoved] = useState<{ startedAt: string; head: string } | null>(null);

  // Refs so the interval-driven probe sees current state without re-binding,
  // and so two probes never overlap.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const inFlight = useRef(false);
  const statusChecked = useRef(false); // one /api/db/status refinement per outage
  const healthFailures = useRef(0); // consecutive /api/health failures (→ 'server-lost')

  const probe = useCallback(async (): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const health = await api.health();
      healthFailures.current = 0; // the studio server answered — whatever the DB says
      // Code stamp first, before any phase branch returns: a moved checkout must surface
      // for the json store and during DB outages alike — and clear when a restarted server
      // answers with a fresh stamp.
      setMoved(
        health.code?.stale ? { startedAt: health.code.startedAt, head: health.code.head } : null,
      );
      if (health.store === 'json') {
        setPhase('json');
        return;
      }
      if (health.db === 'ok') {
        const prev = phaseRef.current;
        statusChecked.current = false;
        // DB ahead of the code = this long-running server is running stale code: the data
        // still loads (renders degrade), but tell the operator to pull + restart rather
        // than letting them chase a DB/API failure (the "specs is not iterable" incident).
        const staleSkew =
          health.schema && health.schema.db > health.schema.code ? health.schema : null;
        setSkew(staleSkew);
        setPhase(staleSkew ? 'stale-code' : 'healthy');
        if (prev === 'stopped' || prev === 'unreachable' || prev === 'starting' || prev === 'server-lost') {
          onRecovered();
        }
        return;
      }
      // db unreachable. Keep the "starting" copy while a start is pending
      // (recovery is what ends it); otherwise refine the outage once.
      if (phaseRef.current === 'starting') return;
      if (!statusChecked.current) {
        statusChecked.current = true;
        try {
          const status = await api.dbStatus();
          setPhase(status.state === 'STOPPED' ? 'stopped' : 'unreachable');
        } catch {
          setPhase('unreachable');
        }
      } else if (phaseRef.current !== 'stopped') {
        setPhase('unreachable');
      }
    } catch {
      // /api/health itself failed — likely the dev server, not the DB. One failure is a
      // blip (keep the current phase, e.g. a pending 'starting'); SERVER_LOST_AFTER in a
      // row means the studio server is gone, and honest copy beats an eternal spinner.
      healthFailures.current += 1;
      if (healthFailures.current >= SERVER_LOST_AFTER) setPhase('server-lost');
    } finally {
      inFlight.current = false;
    }
  }, [onRecovered]);

  // Poll: once immediately, then slow while healthy, fast while down/starting.
  const fast =
    phase === 'stopped' || phase === 'unreachable' || phase === 'starting' || phase === 'server-lost';
  useEffect(() => {
    void probe();
    const id = window.setInterval(() => void probe(), fast ? FAST_POLL_MS : SLOW_POLL_MS);
    return () => window.clearInterval(id);
  }, [probe, fast]);

  const startDb = useCallback(async (): Promise<void> => {
    setStartError('');
    setPhase('starting');
    try {
      await api.dbStart();
    } catch (e) {
      setStartError(e instanceof Error ? e.message : String(e));
      setPhase('stopped');
    }
  }, []);

  // Hosted wake (ADR-0049): the keyless Cloud SQL Admin REST path. Same recovery loop as startDb —
  // set 'starting', fire, let the health poll flip to recovery. A non-seed admin during an outage
  // is refused server-side (403); surface that message instead of silently failing.
  const wakeDb = useCallback(async (): Promise<void> => {
    setStartError('');
    setPhase('starting');
    try {
      await api.dbWake();
    } catch (e) {
      setStartError(e instanceof Error ? e.message : String(e));
      setPhase('unreachable');
    }
  }, []);

  // A moved checkout outranks every phase: until the server restarts, its other answers
  // (including the DB phases below) come from old code and can't be trusted.
  if (moved) {
    return (
      <div className="store-banner" role="status">
        <span>
          This studio server started on commit <code>{moved.startedAt.slice(0, 7)}</code> but the
          checkout has moved to <code>{moved.head.slice(0, 7)}</code> — it is serving stale code
          (new endpoints 404, the UI is old). Restart it: <code>pnpm studio:down</code> ·{' '}
          <code>pnpm studio:up</code>; this page reloads itself when the server returns.
        </span>
      </div>
    );
  }

  if (phase === 'unknown' || phase === 'healthy') return null;

  if (phase === 'json') {
    return <div className="store-badge">offline store (json)</div>;
  }

  return (
    <div className="store-banner" role="status">
      {phase === 'starting' ? (
        <>
          <span className="spinner" aria-hidden="true" />
          <span>Starting the live store — usually about a minute…</span>
          <button className="btn small" disabled>
            Starting…
          </button>
        </>
      ) : phase === 'stale-code' ? (
        <span>
          This studio server is running stale code — the live library holds schemaVersion{' '}
          {skew?.db} but this build knows {skew?.code}. Pull the latest (<code>git pull</code>),
          then restart it: <code>pnpm studio:down</code> · <code>pnpm studio:up</code>.
        </span>
      ) : phase === 'server-lost' ? (
        <span>
          The studio server itself is unreachable — <code>/api/health</code> has stopped
          answering, so this page can no longer see the store at all. Check the dev server
          (<code>pnpm studio:status</code>), restart it (<code>pnpm studio:up</code>), then
          reload this page.
        </span>
      ) : canWake ? (
        // Hosted admin (ADR-0049): the keyless wake button. Takes precedence over the local
        // stopped/unreachable split — on Cloud Run /api/db/status 403s, so the phase is
        // 'unreachable', but the instance is idle-stopped and an admin can bring it back.
        <>
          <span>The live store (Cloud SQL) isn’t responding — it may be idle-stopped.</span>
          <button className="btn small" onClick={() => void wakeDb()}>
            Wake the database
          </button>
        </>
      ) : phase === 'stopped' ? (
        <>
          <span>The live store (Cloud SQL) is stopped.</span>
          <button className="btn small" onClick={() => void startDb()}>
            Start DB
          </button>
        </>
      ) : (
        <span>The live store is unreachable — it may still be coming up.</span>
      )}
      {startError !== '' && <span className="error-text">{startError}</span>}
    </div>
  );
}
