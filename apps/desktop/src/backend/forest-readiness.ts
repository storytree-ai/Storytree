// Forest-readiness probe — confirms the local backend can reach the hosted studio's write-broker
// as an authorized builder before the agent loop runs. Fails closed with member-actionable guidance
// when the broker is unreachable (studio down / URL wrong) or the caller is not yet an authorized
// builder (builder role not yet granted via the Members panel). ADR-0117 d.5.
//
// The write is brokered, NOT a direct Cloud SQL connection (ADR-0117 d.1/d.5). This module never
// opens a DB socket; it POSTs to the hosted studio's broker endpoint via the injected BrokerPostFn
// seam. The probe is offline-testable: inject an in-memory double, no real network required.

/**
 * The injected broker-POST seam. Production wires this to a real `fetch` POST to the configured
 * studio broker URL; tests inject in-memory doubles with controlled status codes and throws.
 */
export type BrokerPostFn = (
  path: string,
  body: unknown,
) => Promise<{ status: number; body: unknown }>;

/**
 * The discriminated-union result returned by {@link probeForestReadiness}.
 *
 * - `{ ready: true }` — the broker accepted the probe; the backend can reach the shared forest as
 *   an authorized builder.
 * - `{ ready: false, guidance }` — the broker refused or was unreachable; fail-closed with
 *   member-actionable text describing the corrective action.
 */
export type ForestReadinessResult =
  | { ready: true }
  | { ready: false; guidance: string };

/**
 * Options for {@link probeForestReadiness}.
 *
 * @property timeoutMs — If supplied, the probe fails closed within this many milliseconds when the
 *   broker does not respond (e.g. the studio is hung or the network is slow). Without this option
 *   the probe waits as long as the broker takes — which can hang indefinitely.
 */
export interface ProbeForestReadinessOptions {
  timeoutMs?: number;
}

/**
 * Probe whether the local backend can reach the hosted studio's write-broker as an authorized
 * builder.
 *
 * POSTs a probe request to the broker via the injected `brokerPost` seam. The broker response
 * determines the result:
 * - 2xx status → `{ ready: true }` (caller has the `builder` role and the broker is reachable)
 * - 403/401 status → `{ ready: false, guidance }` mentioning the builder role and how to get it
 *   via the Members panel (ADR-0117 d.2 — in-app grant, not a gcloud IAM binding)
 * - Network error (broker throws) → `{ ready: false, guidance }` directing the member to check
 *   whether the studio is up and the broker URL is configured correctly
 * - Hangs past `options.timeoutMs` (if supplied) → `{ ready: false, guidance }` — self-bounding,
 *   never hangs indefinitely; guidance directs the member to check studio reachability
 *
 * The probe NEVER reports ready when it cannot actually reach the broker as an authorized builder.
 */
export async function probeForestReadiness(
  brokerPost: BrokerPostFn,
  options?: ProbeForestReadinessOptions,
): Promise<ForestReadinessResult> {
  const timeoutMs = options?.timeoutMs;
  let isTimeout = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    const postPromise = brokerPost("/api/broker/probe", {});

    const awaitable: Promise<{ status: number; body: unknown }> =
      timeoutMs !== undefined
        ? Promise.race([
            postPromise,
            new Promise<never>((_, reject) => {
              timeoutHandle = setTimeout(() => {
                isTimeout = true;
                reject(new Error(`Broker probe timed out after ${timeoutMs}ms`));
              }, timeoutMs);
            }),
          ])
        : postPromise;

    const response = await awaitable;
    clearTimeout(timeoutHandle);

    if (response.status >= 200 && response.status < 300) {
      return { ready: true };
    }

    if (response.status === 403 || response.status === 401) {
      return {
        ready: false,
        guidance:
          "You are not yet an authorized builder. " +
          "Ask the owner to grant you the builder role via the Members panel in the hosted studio. " +
          "Once the builder role is granted, re-run the probe.",
      };
    }

    // Other non-2xx responses — broker is reachable but returning an unexpected status.
    return {
      ready: false,
      guidance:
        `The studio broker returned an unexpected status (${response.status}). ` +
        "Check that the studio is running correctly and the broker URL is configured.",
    };
  } catch {
    clearTimeout(timeoutHandle);

    if (isTimeout) {
      return {
        ready: false,
        guidance:
          `The broker probe timed out after ${timeoutMs ?? "unknown"}ms — ` +
          "the studio may be unreachable or the broker may be slow to respond. " +
          "Check that the hosted studio is up and the broker URL is correctly configured.",
      };
    }

    // Network error — the broker threw (ECONNREFUSED, DNS failure, etc.).
    return {
      ready: false,
      guidance:
        "Cannot reach the studio broker. " +
        "Check that the hosted studio is running and the broker URL is correctly configured. " +
        "If the studio is not up, start it and try again.",
    };
  }
}
