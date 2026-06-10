// Store-health banner: a slim strip under the topbar that only appears when
// the live (pg) store is unreachable. The studio defaults to the shared Cloud
// SQL store, which is STOPPED when idle for cost (ADR-0015) — so the common
// failure mode is "the instance is off" and the fix is one click. The banner
// polls /api/health slowly while healthy and fast while down, refines "down"
// into stopped-vs-still-booting via one /api/db/status check per outage, and
// offers a Start DB button (idempotent, ~1 minute). When the probe flips back
// to ok it calls onRecovered so the app can reload whatever the outage cost.

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';

const SLOW_POLL_MS = 30_000;
const FAST_POLL_MS = 5_000;

type Phase =
  | 'unknown' // no health response yet — render nothing rather than flash a warning
  | 'healthy' // pg store, probe ok
  | 'json' // offline json store — the DB is not in play
  | 'stopped' // unreachable and Cloud SQL reports STOPPED — offer Start DB
  | 'unreachable' // unreachable but RUNNABLE (or status unknown) — likely coming up
  | 'starting'; // we fired /api/db/start and are waiting for the probe to flip

export function StoreBanner({
  onRecovered,
}: {
  onRecovered: () => void;
}): React.JSX.Element | null {
  const [phase, setPhase] = useState<Phase>('unknown');
  const [startError, setStartError] = useState('');

  // Refs so the interval-driven probe sees current state without re-binding,
  // and so two probes never overlap.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const inFlight = useRef(false);
  const statusChecked = useRef(false); // one /api/db/status refinement per outage

  const probe = useCallback(async (): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const health = await api.health();
      if (health.store === 'json') {
        setPhase('json');
        return;
      }
      if (health.db === 'ok') {
        const prev = phaseRef.current;
        statusChecked.current = false;
        setPhase('healthy');
        if (prev === 'stopped' || prev === 'unreachable' || prev === 'starting') {
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
      // /api/health itself failed (dev server gone?) — nothing actionable to
      // show beyond the app's own error state; keep the current phase.
    } finally {
      inFlight.current = false;
    }
  }, [onRecovered]);

  // Poll: once immediately, then slow while healthy, fast while down/starting.
  const fast = phase === 'stopped' || phase === 'unreachable' || phase === 'starting';
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
