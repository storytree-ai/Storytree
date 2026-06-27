// Forest-readiness probe — confirms the local backend can reach the shared Cloud SQL before the
// agent loop runs. Fails closed with member-actionable guidance when the connector refuses
// (IAM grant missing / DB idle-stopped), so no write ever silently lands in an unreachable forest.

/**
 * A closeable connection stub: the minimum surface the probe needs after verifying reachability.
 */
export interface ForestConnection {
  end: () => Promise<void | undefined>;
}

/**
 * The injected connector seam. Production wires the real @storytree/store keyless Cloud SQL
 * connector; tests inject in-memory doubles.
 */
export type ForestConnectorFn = () => Promise<ForestConnection>;

/**
 * The discriminated-union result returned by {@link probeForestReadiness}.
 *
 * - `{ ready: true }` — the connector resolved; the backend can reach the shared Cloud SQL.
 * - `{ ready: false, guidance }` — the connector refused; fail-closed with member-actionable text.
 */
export type ForestReadinessResult =
  | { ready: true }
  | { ready: false; guidance: string };

/**
 * Options for {@link probeForestReadiness}.
 *
 * @property timeoutMs — If supplied, the probe fails closed within this many milliseconds when
 *   the connector stalls (e.g. a Cloud SQL handshake that never completes). Without this option
 *   the probe waits as long as the connector takes.
 */
export interface ProbeForestReadinessOptions {
  timeoutMs?: number;
}

/**
 * Probe whether the local backend can reach the shared Cloud SQL forest.
 *
 * Calls the injected `connector`, then immediately closes the acquired connection (a readiness
 * check — no writes). If the connector rejects (ECONNREFUSED, auth error, idle-stopped DB), the
 * error is converted to a fail-closed `{ ready: false, guidance }` result rather than propagating
 * the throw — the probe NEVER reports ready when it cannot actually connect.
 *
 * When `options.timeoutMs` is supplied the probe self-bounds: if the connector has not resolved
 * within that deadline, the probe returns `{ ready: false, guidance }` with timeout-specific
 * member-actionable text rather than hanging indefinitely.
 */
export async function probeForestReadiness(
  connector: ForestConnectorFn,
  options?: ProbeForestReadinessOptions,
): Promise<ForestReadinessResult> {
  const timeoutMs = options?.timeoutMs;
  let isTimeout = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    const connectorPromise = connector();

    const awaitable: Promise<ForestConnection> =
      timeoutMs !== undefined
        ? Promise.race([
            connectorPromise,
            new Promise<never>((_, reject) => {
              timeoutHandle = setTimeout(() => {
                isTimeout = true;
                reject(new Error(`Connection timed out after ${timeoutMs}ms`));
              }, timeoutMs);
            }),
          ])
        : connectorPromise;

    const conn = await awaitable;
    clearTimeout(timeoutHandle);
    await conn.end();
    return { ready: true };
  } catch {
    clearTimeout(timeoutHandle);
    if (isTimeout) {
      return {
        ready: false,
        guidance:
          `Connection to the shared Cloud SQL forest timed out after ${timeoutMs ?? "unknown"}ms ` +
          "(the handshake stalled or the DB is idle-stopped). " +
          "Run `pnpm db:up` to wake the DB and check you have the Cloud SQL IAM grant.",
      };
    }
    return {
      ready: false,
      guidance:
        "Cannot reach the shared Cloud SQL forest. " +
        "Ensure you have the Cloud SQL IAM grant (ask the owner to run: " +
        "gcloud projects add-iam-policy-binding … --role roles/cloudsql.client) " +
        "and that the DB is running (run: pnpm db:up). " +
        "If the DB is idle-stopped, it may take a few minutes to wake.",
    };
  }
}
