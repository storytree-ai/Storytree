// Forest-readiness probe + write client — the local backend's BROKERED forest-write seam.
//
// READINESS PROBE: confirms the local backend can reach the hosted studio's write-broker as an
// authorized builder BEFORE the agent loop runs. Fails closed with member-actionable guidance when
// the broker is unreachable (studio down / URL wrong) or the caller is not yet an authorized builder
// (builder role not yet granted via the Members panel). ADR-0117 d.5.
//
// WRITE CLIENT: POSTs a locally-signed Verdict to the broker's write endpoint
// (ADR-0117 d.2–d.4). The SERVER persists it under its one service-account identity; the client holds
// no key and opens no DB connection — it forwards the already-signed bytes and reports an honest
// persisted / not-persisted result the local backend can act on (never a forged "persisted").
//
// Both are brokered, NOT a direct Cloud SQL connection (ADR-0117 d.1/d.5). This module never opens a
// DB socket and never imports apps/studio/server (the surface boundary, ADR-0100): it POSTs to the
// hosted studio's broker endpoints via the injected BrokerPostFn seam. Offline-testable: inject an
// in-memory double, no real network required. The cross-story desktop → studio-cloud edge is a runtime
// HTTP edge only — the Verdict SHAPE comes from the proof-protocol package, imported as an erased
// type (no runtime coupling to the server). Brokered PRESENCE writes retired with self-reported
// presence (ADR-0200 D7) — the claim ledger is the one coordination surface; verdict is the only
// write type left.

import type { Verdict } from "@storytree/proof-protocol";

/**
 * The injected broker-POST seam. Production wires this to a real `fetch` POST to the configured
 * studio broker URL (see `createFetchBrokerPost` in local-backend.ts); tests inject in-memory
 * doubles with controlled status codes and throws.
 */
export type BrokerPostFn = (
  path: string,
  body: unknown,
) => Promise<{ status: number; body: unknown }>;

/** The studio broker's write endpoint (ADR-0117 d.2). Mirrors the studio apiRouter mount exactly. */
export const WRITE_BROKER_PATH = "/api/write-broker";

/** The studio broker's readiness-probe endpoint. */
export const BROKER_PROBE_PATH = "/api/broker/probe";

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
 * Options for {@link probeForestReadiness} and {@link writeToForestBroker}.
 *
 * @property timeoutMs — If supplied, the call fails closed within this many milliseconds when the
 *   broker does not respond (e.g. the studio is hung or the network is slow). Without this option
 *   the call waits as long as the broker takes — which can hang indefinitely.
 */
export interface BrokerCallOptions {
  timeoutMs?: number;
}

/** @deprecated alias kept for readability at the probe call site. */
export type ProbeForestReadinessOptions = BrokerCallOptions;

// ---------------------------------------------------------------------------
// Shared bounded-POST helper — one deadline implementation for the probe AND the write client,
// so neither can hang the backend and the two never drift. Returns a discriminated outcome the
// callers map to their own result shapes.
// ---------------------------------------------------------------------------

type BrokerOutcome =
  | { kind: "resolved"; response: { status: number; body: unknown } }
  | { kind: "timeout" }
  | { kind: "error" };

/**
 * POST to the broker via the injected seam, optionally bounded by `timeoutMs`.
 *
 * - The seam resolves first → `{ kind: "resolved", response }`.
 * - The deadline fires first → `{ kind: "timeout" }` (self-bounding; never hangs).
 * - The seam throws (network error) → `{ kind: "error" }`.
 *
 * Always clears the timer, so there is no dangling OS handle on any path.
 */
async function postToBroker(
  brokerPost: BrokerPostFn,
  path: string,
  body: unknown,
  timeoutMs: number | undefined,
): Promise<BrokerOutcome> {
  if (timeoutMs === undefined) {
    try {
      return { kind: "resolved", response: await brokerPost(path, body) };
    } catch {
      return { kind: "error" };
    }
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let isTimeout = false;
  try {
    const response = await Promise.race([
      brokerPost(path, body),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          isTimeout = true;
          reject(new Error(`broker request timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
    clearTimeout(timeoutHandle);
    return { kind: "resolved", response };
  } catch {
    clearTimeout(timeoutHandle);
    return isTimeout ? { kind: "timeout" } : { kind: "error" };
  }
}

// ---------------------------------------------------------------------------
// Readiness probe
// ---------------------------------------------------------------------------

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
  options?: BrokerCallOptions,
): Promise<ForestReadinessResult> {
  const outcome = await postToBroker(brokerPost, BROKER_PROBE_PATH, {}, options?.timeoutMs);

  if (outcome.kind === "timeout") {
    return {
      ready: false,
      guidance:
        `The broker probe timed out after ${options?.timeoutMs ?? "unknown"}ms — ` +
        "the studio may be unreachable or the broker may be slow to respond. " +
        "Check that the hosted studio is up and the broker URL is correctly configured.",
    };
  }

  if (outcome.kind === "error") {
    return {
      ready: false,
      guidance:
        "Cannot reach the studio broker. " +
        "Check that the hosted studio is running and the broker URL is correctly configured. " +
        "If the studio is not up, start it and try again.",
    };
  }

  const { response } = outcome;

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
}

// ---------------------------------------------------------------------------
// Write client
// ---------------------------------------------------------------------------

/**
 * A locally-signed forest write to broker, discriminated by `type` — exactly the
 * `{ type, payload }` envelope the studio write-broker dispatches on (ADR-0117 d.3).
 *
 * The `payload` is a fully-formed, locally-signed shape from the protocol packages: the spine ran
 * the gate and signed on the member's machine (ADR-0091); the client only forwards the bytes.
 * Verdict-only since ADR-0200 D7 (the presence branch retired with self-reported presence).
 */
export type ForestWrite = { type: "verdict"; payload: Verdict };

/**
 * The result of a brokered forest write — what the local backend acts on.
 *
 * - `{ persisted: true, status, body }` — the broker accepted (2xx) and persisted the write under
 *   its service-account identity; `body` is the broker's response envelope.
 * - `{ persisted: false, status, guidance }` — the broker refused (4xx — not a builder / signer
 *   mismatch / bad shape), returned an unexpected status, was unreachable (`status: null`), or
 *   timed out (`status: null`). NEVER a silent success and NEVER a forged "persisted".
 */
export type ForestWriteResult =
  | { persisted: true; status: number; body: unknown }
  | { persisted: false; status: number | null; guidance: string };

/**
 * POST a locally-signed `Verdict` to the hosted studio's members-gated
 * write-broker (ADR-0117 d.2–d.4) via the injected `brokerPost` seam.
 *
 * The client opens NO DB connection and holds NO signing key: it forwards the already-signed bytes
 * as `{ type, payload }` to {@link WRITE_BROKER_PATH} and maps the broker's response to an honest
 * persisted / not-persisted result:
 * - 2xx → `{ persisted: true, ... }` (the broker validated shape + attribution and persisted it)
 * - 401 → `{ persisted: false, ... }` (the broker is members-gated; authenticate and retry)
 * - 403 → `{ persisted: false, ... }` (not an authorized builder, or signer ≠ caller — ask the
 *   owner for the builder role via the Members panel; ADR-0117 d.2, an in-app grant, not IAM)
 * - other non-2xx → `{ persisted: false, ... }` (broker reachable but an unexpected status)
 * - network error → `{ persisted: false, status: null, ... }` (broker unreachable — is the studio up?)
 * - timeout (if `options.timeoutMs` supplied) → `{ persisted: false, status: null, ... }` (bounded)
 *
 * It NEVER reports persisted unless the broker actually accepted the write.
 */
export async function writeToForestBroker(
  brokerPost: BrokerPostFn,
  write: ForestWrite,
  options?: BrokerCallOptions,
): Promise<ForestWriteResult> {
  const outcome = await postToBroker(
    brokerPost,
    WRITE_BROKER_PATH,
    { type: write.type, payload: write.payload },
    options?.timeoutMs,
  );

  if (outcome.kind === "timeout") {
    return {
      persisted: false,
      status: null,
      guidance:
        `The brokered write timed out after ${options?.timeoutMs ?? "unknown"}ms — ` +
        "the studio may be unreachable or the broker may be slow to respond. " +
        "The write was NOT persisted; check that the hosted studio is up and the broker URL is configured.",
    };
  }

  if (outcome.kind === "error") {
    return {
      persisted: false,
      status: null,
      guidance:
        "Cannot reach the studio broker to persist the write. " +
        "The write was NOT persisted; check that the hosted studio is running and the broker URL is correctly configured.",
    };
  }

  const { response } = outcome;

  if (response.status >= 200 && response.status < 300) {
    return { persisted: true, status: response.status, body: response.body };
  }

  if (response.status === 401) {
    return {
      persisted: false,
      status: 401,
      guidance:
        "The studio broker rejected the write: authentication required. " +
        "The broker is members-gated; sign in to the hosted studio and try again. " +
        "The write was NOT persisted.",
    };
  }

  if (response.status === 403) {
    return {
      persisted: false,
      status: 403,
      guidance:
        "The studio broker refused the write (403): you are not an authorized builder, " +
        "or the signer of this write does not match your identity. " +
        "Ask the owner to grant you the builder role via the Members panel in the hosted studio. " +
        "The write was NOT persisted.",
    };
  }

  // Other non-2xx — the broker is reachable but rejected the write (e.g. 400 bad shape) or errored.
  return {
    persisted: false,
    status: response.status,
    guidance:
      `The studio broker returned an unexpected status (${response.status}) and did NOT persist the write. ` +
      "Check that the studio is running correctly and the broker URL is configured.",
  };
}
