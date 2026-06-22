// Idle-aware auto-stop for Cloud SQL `storytree-pg` (ADR-0015 §5).
//
// Cloud Scheduler pings this HTTP function every ~15 min. It stops the instance
// ONLY after IDLE_MINUTES with zero database connections — so it never stops an
// instance you're actively using. As long as the Cloud SQL Auth Proxy / a live
// session holds a connection, the idle timer effectively "counts from the last
// request" and the instance stays up. The blunt DAILY cron in cost-backstop.tf
// is the hard floor that catches the case where this checker is itself broken.
//
// Fail-safe stance: on ANY error, or when metric data is missing, we DO NOT stop
// (killing a live session because the checker hiccuped is the failure mode the
// owner hit). We log loudly so a broken checker is visible, and the daily floor
// still caps a genuinely-forgotten instance.
//
// The decision logic (what counts as a sample; noop vs stop) is the pure, unit-tested
// `decide.js`; this file is the GCP I/O around it (read state, read the metric, PATCH).

import { GoogleAuth } from 'google-auth-library';
import * as ff from '@google-cloud/functions-framework';

import { decideIdleAction, peakFromTimeSeries } from './decide.js';

const PROJECT = process.env.PROJECT_ID;
const INSTANCE = process.env.INSTANCE_NAME;
const IDLE_MINUTES = Math.max(1, Number(process.env.IDLE_MINUTES ?? '60'));

// The Cloud SQL management agent runs in the `cloudsqladmin` database and holds a
// CONSTANT ~2 background connections that never reflect user activity. It must be
// excluded from the idle measurement — counting it would mean the peak is never 0
// and the instance would never read as idle (the second trap behind the dead metric).
const SYSTEM_DATABASE = 'cloudsqladmin';

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

async function gapi(client, url, opts = {}) {
  const res = await client.request({ url, ...opts });
  return res.data;
}

/**
 * Peak DB connections over the last `IDLE_MINUTES`, plus whether the metric pipeline
 * delivered any samples (reduced by the pure {@link peakFromTimeSeries}).
 *
 * Metric: PostgreSQL `num_backends` — the connection count that is actually POPULATED
 * for this instance — EXCLUDING the `cloudsqladmin` management database (see above).
 *
 * Why NOT `database/network/connections` (the metric this function shipped with)? That
 * series returns NO samples for this instance, so the old query saw empty data every
 * cycle, tripped the "no data => don't stop" fail-safe, and the function never stopped
 * anything — the daily 04:30 cron was doing 100% of the stopping (ADR-0015 §5 correction,
 * 2026-06-22). `num_backends` emits continuous samples — 0 while idle — which is exactly
 * what the idle decision needs.
 *
 * We align into small 60s ALIGN_MAX buckets and reduce IN CODE rather than asking the API
 * for one giant alignment bucket: robust against any per-bucket constraint, and it keeps
 * the sample/peak logic in a unit-tested pure function.
 */
async function peakConnections(client) {
  const end = new Date();
  const start = new Date(end.getTime() - IDLE_MINUTES * 60_000);
  const filter =
    'metric.type="cloudsql.googleapis.com/database/postgresql/num_backends" ' +
    `AND resource.labels.database_id="${PROJECT}:${INSTANCE}" ` +
    `AND metric.labels.database!="${SYSTEM_DATABASE}"`;
  const params = new URLSearchParams({
    filter,
    'interval.startTime': start.toISOString(),
    'interval.endTime': end.toISOString(),
    'aggregation.alignmentPeriod': '60s',
    'aggregation.perSeriesAligner': 'ALIGN_MAX',
  });
  const data = await gapi(
    client,
    `https://monitoring.googleapis.com/v3/projects/${PROJECT}/timeSeries?${params.toString()}`,
  );
  return peakFromTimeSeries(data);
}

export async function idleStop(req, res) {
  const tag = `[idle-stop ${INSTANCE}]`;
  try {
    if (!PROJECT || !INSTANCE) {
      throw new Error('PROJECT_ID and INSTANCE_NAME env vars are required');
    }
    const client = await auth.getClient();

    // 1. Current instance state — if it's not actually up, there's nothing to do
    //    (skip the metric read, and avoid the benign "can't patch a stopped instance" 400).
    const inst = await gapi(
      client,
      `https://sqladmin.googleapis.com/sql/v1beta4/projects/${PROJECT}/instances/${INSTANCE}`,
    );
    const state = inst.state; // RUNNABLE | STOPPED | PENDING_CREATE | ...
    const policy = inst.settings?.activationPolicy; // ALWAYS | NEVER

    // 2. Activity over the idle window — only worth reading when the instance is up.
    let sawData = false;
    let peak = 0;
    if (state === 'RUNNABLE' && policy !== 'NEVER') {
      ({ sawData, max: peak } = await peakConnections(client));
    }

    // 3. The decision is pure (decide.js) — see decide.test.js for the full matrix.
    const decision = decideIdleAction({
      state,
      policy,
      sawData,
      peakConnections: peak,
      idleMinutes: IDLE_MINUTES,
    });

    if (decision.action === 'noop') {
      if (decision.reason === 'not-running') {
        console.log(`${tag} not running (state=${state}, policy=${policy}); nothing to do.`);
      } else if (decision.reason === 'no-metric-data') {
        console.warn(
          `${tag} no connection-metric samples for the last ${IDLE_MINUTES} min ` +
            '(instance may be freshly started or metrics delayed) — NOT stopping this cycle.',
        );
      } else {
        console.log(
          `${tag} ACTIVE — ${peak} peak connection(s) in the last ${IDLE_MINUTES} min; leaving instance UP.`,
        );
      }
      res.status(200).json(decision);
      return;
    }

    // 4. decision.action === 'stop' — idle for the whole window.
    console.warn(`${tag} IDLE for ${IDLE_MINUTES} min (0 connections) — STOPPING instance.`);
    await gapi(
      client,
      `https://sqladmin.googleapis.com/sql/v1beta4/projects/${PROJECT}/instances/${INSTANCE}`,
      { method: 'PATCH', data: { settings: { activationPolicy: 'NEVER' } } },
    );
    console.warn(`${tag} stop requested (activationPolicy=NEVER).`);
    res.status(200).json({ action: 'stopped', reason: 'idle', idleMinutes: IDLE_MINUTES });
  } catch (err) {
    // Fail LOUD, fail SAFE: never stop on error — the daily hard backstop is the floor.
    console.error(
      `${tag} ERROR — leaving instance untouched; daily backstop remains the cost floor:`,
      err?.stack || err,
    );
    res.status(500).json({ action: 'error', error: String(err?.message || err) });
  }
}

ff.http('idleStop', idleStop);
