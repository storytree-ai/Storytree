// Pure decision core for the idle-aware Cloud SQL auto-stop (ADR-0015 §5).
//
// These two functions hold ALL the logic worth getting right; the rest of the
// function (index.js) is GCP I/O (read instance state, read the metric, PATCH to
// stop). They take plain values and return plain objects — no network, no clock —
// so they have real red->green coverage offline (decide.test.js), mirroring the
// injected-deps pattern in packages/drive/src/db-control.ts.

/**
 * Reduce a Cloud Monitoring `timeSeries.list` response to `{ sawData, max }`:
 *   - `sawData` — did the metric pipeline deliver ANY point at all? `false` means
 *     "unknown", NOT "idle": a freshly-started instance has no samples yet, so the
 *     caller must not stop on it. (This is only meaningful because the connection
 *     metric we now query emits continuous 0-valued samples while idle — verified
 *     against live data — so an idle window reads as sawData=true, max=0, not as
 *     absent data. The previous metric returned NO series at all, which tripped
 *     this branch every cycle and is exactly why the function never stopped.)
 *   - `max` — peak connection count across every series and every point.
 *
 * Pure: takes the already-parsed JSON, does no I/O. The query asks for small
 * (60s) ALIGN_MAX buckets and we reduce here, rather than relying on one giant
 * alignment bucket — so the aligner can never be the single point of failure.
 *
 * @param {{ timeSeries?: Array<{ points?: Array<{ value?: { int64Value?: string|number, doubleValue?: number } }> }> }} data
 * @returns {{ sawData: boolean, max: number }}
 */
export function peakFromTimeSeries(data) {
  let sawData = false;
  let max = 0;
  for (const series of data?.timeSeries ?? []) {
    for (const pt of series.points ?? []) {
      sawData = true;
      const v = Number(pt.value?.int64Value ?? pt.value?.doubleValue ?? 0);
      if (v > max) max = v;
    }
  }
  return { sawData, max };
}

/**
 * The idle-stop decision — pure over its inputs (no I/O, no clock):
 *   - instance not RUNNABLE, or activation policy NEVER  -> noop("not-running")
 *   - no metric samples at all                           -> noop("no-metric-data")
 *     (freshly started / metrics delayed — fail SAFE, do not stop)
 *   - any connection seen in the window                  -> noop("active")
 *   - zero connections across the whole window           -> stop
 *
 * @param {{ state?: string, policy?: string, sawData: boolean, peakConnections: number, idleMinutes: number }} input
 * @returns {{ action: 'noop'|'stop', reason: string, [k: string]: unknown }}
 */
export function decideIdleAction({ state, policy, sawData, peakConnections, idleMinutes }) {
  if (state !== "RUNNABLE" || policy === "NEVER") {
    return { action: "noop", reason: "not-running", state, policy };
  }
  if (!sawData) {
    return { action: "noop", reason: "no-metric-data", idleMinutes };
  }
  if (peakConnections > 0) {
    return { action: "noop", reason: "active", peakConnections, idleMinutes };
  }
  return { action: "stop", reason: "idle", idleMinutes };
}
