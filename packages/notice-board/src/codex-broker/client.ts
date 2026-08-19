/**
 * The client a SANDBOXED caller dials — the only half of the broker that runs inside the fence.
 *
 * It holds no credential and opens no database connection. It reads a handshake file (whose ACL is
 * the permission to knock at all), POSTs an exact-grammar request to a loopback port, and maps the
 * answer back onto the `ClaimResult` shape the existing ceremony and
 * `promoteBootstrapClaimsToWork` already speak — so wiring the bootstrap is a SUBSTITUTION at the
 * ledger seam rather than a rewrite (`codex-worktree-create-entry.ts`).
 *
 * ## Fail-closed mapping, and why the two refusal shapes differ
 *
 * A broker refusal that names a HOLDER is contention: it becomes `{acquired: false, heldBy}`, which
 * the ceremony already knows how to report. A refusal that names no holder is NOT contention — a
 * malformed request, a store the broker could not reach, a worktree whose topology would not resolve
 * — and it THROWS, because those must never read as "the unit is busy". `promoteBootstrapClaimsToWork`
 * catches throws and refuses the whole bootstrap, which is the correct end for every one of them.
 */

import { readFileSync } from "node:fs";
import { connect } from "node:net";

import type { ClaimDocT, ClaimResult } from "../claim.js";

import {
  BROKER_REQUEST_PATH,
  BROKER_TOKEN_HEADER,
  type BrokerHandshake,
} from "./door.js";
import { CODEX_CLAIM_BROKER_PROTOCOL_VERSION, type BrokerResponse } from "./broker.js";

export { BROKER_HANDSHAKE_ENV, brokerHandshakePath } from "./door.js";

export function readBrokerHandshake(handshakePath: string): BrokerHandshake {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(handshakePath, "utf8"));
  } catch (error) {
    throw new Error(
      `broker handshake unreadable at ${handshakePath} — is the operator's broker running? ` +
        `(${error instanceof Error ? error.message : String(error)})`,
    );
  }
  if (typeof parsed !== "object" || parsed === null) throw new Error("broker handshake is not an object");
  const source = parsed as Record<string, unknown>;
  const port = source["port"];
  const token = source["token"];
  if (source["protocolVersion"] !== CODEX_CLAIM_BROKER_PROTOCOL_VERSION) {
    throw new Error(
      `broker speaks protocol ${String(source["protocolVersion"])}, this client speaks ` +
        `${CODEX_CLAIM_BROKER_PROTOCOL_VERSION} — refusing rather than negotiating down`,
    );
  }
  if (typeof port !== "number" || !Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("broker handshake carries no usable port");
  }
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("broker handshake carries no token");
  }
  // Stamped so a later failure can NAME the file it trusted. Without it the only diagnosable fact
  // about a dead broker — where the port came from — is the one the message cannot state.
  return { protocolVersion: CODEX_CLAIM_BROKER_PROTOCOL_VERSION, port, token, sourcePath: handshakePath };
}

/** How long to wait on the broker before failing closed. A local call that is slow is a broken call. */
const REQUEST_TIMEOUT_MS = 15_000;

/** How long a bare liveness connect may take. Loopback answers in single-digit ms or not at all. */
const LIVENESS_PROBE_TIMEOUT_MS = 2_000;

function brokerAddress(handshake: BrokerHandshake): string {
  return `127.0.0.1:${handshake.port}`;
}

/**
 * Why a readable handshake can name a port nothing answers on — carried by every dead-broker
 * message, because without it the reader's next move is to check that the file exists, and that is
 * precisely the check that recorded a false "criterion met" in two artifacts.
 */
const STALE_HANDSHAKE_NOTE =
  "the handshake is published at startup and removed only on GRACEFUL shutdown, so it outlives a " +
  "crash and keeps naming a dead port";

function handshakeClause(handshake: BrokerHandshake): string {
  return handshake.sourcePath === undefined ? "" : ` Handshake read from ${handshake.sourcePath}.`;
}

/**
 * Pull every errno out of a rejected `fetch`. undici throws a bare `TypeError: fetch failed` and
 * hangs the real reason off `cause` — which may itself be an `AggregateError`, because the
 * IPv4/IPv6 fan-out tries both and collects. A single `.cause.code` read misses that case.
 */
function transportCodes(error: unknown, seen = new Set<unknown>()): string[] {
  if (error === null || typeof error !== "object" || seen.has(error)) return [];
  seen.add(error);
  const codes: string[] = [];
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string") codes.push(code);
  const errors = (error as { errors?: unknown }).errors;
  if (Array.isArray(errors)) for (const inner of errors) codes.push(...transportCodes(inner, seen));
  codes.push(...transportCodes((error as { cause?: unknown }).cause, seen));
  return codes;
}

/**
 * Translate a transport failure into something a human or an agent can ACT on.
 *
 * The case that actually happens is a dead broker behind a live handshake: measured 2026-08-19, the
 * desktop sidecar died minutes after publishing, and the live smoke's bootstrap reported the whole
 * condition as `fetch failed` — undici's opaque TypeError for a refused connection, naming no port,
 * no path and no conclusion. The refusal itself was CORRECT and stays unchanged; only the words do.
 *
 * The three cases are kept apart because they call for different actions: nothing listening means
 * relaunch the host, a timeout means it is hosting but wedged (relaunching on that evidence would
 * be guesswork), and anything else is reported with its errno rather than guessed at.
 */
function describeTransportFailure(handshake: BrokerHandshake, error: unknown): string {
  const address = brokerAddress(handshake);
  const where = handshakeClause(handshake);
  if (error instanceof Error && error.name === "TimeoutError") {
    return (
      `the claim broker at ${address} accepted the connection but did not answer within ` +
      `${REQUEST_TIMEOUT_MS} ms — it is hosting but wedged, which is NOT the same as absent, so do ` +
      `not relaunch on this evidence alone.${where}`
    );
  }
  const codes = transportCodes(error);
  if (codes.includes("ECONNREFUSED")) {
    return (
      `the claim broker is NOT LISTENING on ${address} (ECONNREFUSED) — ${STALE_HANDSHAKE_NOTE}. ` +
      `The desktop app that hosts the resident authority (ADR-0375) is not running, or its sidecar ` +
      `died after publishing; relaunch it and re-run.${where}`
    );
  }
  const code = codes[0];
  const detail = error instanceof Error ? error.message : String(error);
  return (
    `the claim broker at ${address} was unreachable${code === undefined ? "" : ` (${code})`} — ` +
    `${STALE_HANDSHAKE_NOTE}, so a readable handshake is not evidence that anything is listening. ` +
    `Underlying failure: ${detail}.${where}`
  );
}

/** What a liveness probe answers: the verdict, and the sentence a caller can print verbatim. */
export interface BrokerLivenessVerdict {
  readonly live: boolean;
  readonly detail: string;
}

/**
 * Is the authority UP? Answered from the SOCKET, never from the handshake's existence.
 *
 * That distinction is the whole function. A published handshake proves only that a broker once
 * started; it survives a crash, so "the file is there" is not liveness — yet it was used as the
 * liveness precondition in the Codex handoff prompt AND as the evidence recording a reinstall
 * criterion met, and both were wrong. A TCP connect to the port the handshake names is the minimum
 * honest form of the question, and it belongs wherever the question is asked.
 */
export function probeBrokerLiveness(
  handshake: BrokerHandshake,
  opts: { readonly timeoutMs?: number } = {},
): Promise<BrokerLivenessVerdict> {
  const timeoutMs = opts.timeoutMs ?? LIVENESS_PROBE_TIMEOUT_MS;
  const address = brokerAddress(handshake);
  const where = handshakeClause(handshake);
  return new Promise<BrokerLivenessVerdict>((resolve) => {
    const socket = connect({ host: "127.0.0.1", port: handshake.port });
    let settled = false;
    const settle = (verdict: BrokerLivenessVerdict): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(verdict);
    };
    socket.setTimeout(timeoutMs, () =>
      settle({
        live: false,
        detail: `the claim broker at ${address} did not complete a TCP connect within ${timeoutMs} ms.${where}`,
      }),
    );
    socket.on("connect", () =>
      settle({ live: true, detail: `the claim broker is listening on ${address}.${where}` }),
    );
    // `on`, never `once`: a socket can emit a SECOND error (the `destroy()` in `settle`, a reset
    // racing the refusal), and an unhandled 'error' on a net.Socket is a process-level throw. A
    // liveness probe that can take the process down is worse than the unobservability it fixes.
    socket.on("error", (error: NodeJS.ErrnoException) =>
      settle({
        live: false,
        detail:
          `the claim broker is NOT LISTENING on ${address} (${error.code ?? error.message}) — ` +
          `${STALE_HANDSHAKE_NOTE}.${where}`,
      }),
    );
  });
}

export async function postBrokerRequest(
  handshake: BrokerHandshake,
  body: Record<string, unknown>,
): Promise<BrokerResponse> {
  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${handshake.port}${BROKER_REQUEST_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [BROKER_TOKEN_HEADER]: handshake.token,
      },
      body: JSON.stringify({ protocolVersion: CODEX_CLAIM_BROKER_PROTOCOL_VERSION, ...body }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    // Fails closed exactly as before — every caller already treats a throw from here as "refuse the
    // whole bootstrap", which stays the right end for a dead broker. Only the WORDS change.
    throw new Error(describeTransportFailure(handshake, error), { cause: error });
  }
  const payload: unknown = await response.json();
  if (typeof payload !== "object" || payload === null || typeof (payload as { ok?: unknown }).ok !== "boolean") {
    throw new Error(`broker returned an unreadable answer (HTTP ${response.status})`);
  }
  return payload as BrokerResponse;
}

function toClaimResult(response: BrokerResponse, what: string): ClaimResult {
  if (response.ok) {
    if (response.verb !== "take" && response.verb !== "promote") {
      throw new Error(`${what}: broker answered the wrong verb`);
    }
    return { acquired: true, claim: response.claim, reclaimed: false };
  }
  if (response.heldBy !== undefined) return { acquired: false, heldBy: response.heldBy };
  throw new Error(`${what}: ${response.reason}`);
}

/**
 * The live claims one session holds, read through the resident authority (ADR-0375).
 *
 * **It THROWS on every failure and returns `[]` only when the ledger genuinely holds nothing for that
 * session.** That is the whole contract, and it is the inverse of the mistake ADR-0368 D4 guarded
 * against: there, an empty answer would have overstated safety to an operator; here, an empty answer
 * means "no live work claim", which the hook reads as DENY — so the danger is not an empty answer, it
 * is an ERROR WEARING ONE. Any caller that wraps this in a `catch` returning `[]` has removed the only
 * fence ADR-0364 leaves standing, and nothing downstream will notice: the write is simply admitted.
 *
 * The managed hook re-implements this inline (it is a standalone emitted script and imports nothing);
 * `MANAGED_CODEX_HOOK_SCRIPT`'s `readLiveClaims` is the copy that matters, and it is held to the same
 * property by test.
 */
export async function claimsForSession(
  handshake: BrokerHandshake,
  sessionId: string,
): Promise<ClaimDocT[]> {
  const response = await postBrokerRequest(handshake, { verb: "claims", sessionId });
  if (!response.ok) {
    throw new Error(`live claim read REFUSED — ${response.reason}`);
  }
  if (response.verb !== "claims") throw new Error("live claim read: broker answered the wrong verb");
  return [...response.claims];
}

/**
 * The ledger the sandboxed bootstrap drives, satisfying both `WorktreeCreateLedgerLike` (take /
 * release / claimsFor) and `BootstrapClaimLedger` (upgrade) over the broker.
 */
export class BrokerClaimLedger {
  readonly #handshake: BrokerHandshake;
  readonly #worktree: () => string | undefined;

  /**
   * @param worktree resolves the minted worktree once it exists. `promote` sends the PATH and the
   * broker derives session and branch from Git itself, so the client cannot assert an identity it
   * does not stand in — which is the whole point, and the reason this is a thunk rather than a
   * constructor value: at construction time (claim-taking) the worktree does not exist yet.
   */
  constructor(handshake: BrokerHandshake, worktree: () => string | undefined) {
    this.#handshake = handshake;
    this.#worktree = worktree;
  }

  async take(req: {
    unitId: string;
    sessionId: string;
    branch: string;
    intent?: string;
  }): Promise<ClaimResult> {
    const response = await postBrokerRequest(this.#handshake, {
      verb: "take",
      unitId: req.unitId,
      sessionId: req.sessionId,
      branch: req.branch,
      intent: req.intent ?? "",
    });
    return toClaimResult(response, `take on "${req.unitId}" failed`);
  }

  async upgrade(
    unitId: string,
    _sessionId: string,
    opts: { branch: string; intent: string },
  ): Promise<ClaimResult> {
    const worktree = this.#worktree();
    if (worktree === undefined || worktree.length === 0) {
      throw new Error(
        `promote on "${unitId}" failed: no minted worktree to derive identity from`,
      );
    }
    // `_sessionId` and `opts.branch` are deliberately NOT sent. The broker re-derives both from the
    // worktree's own Git topology; the caller's assertion is not evidence about itself. The caller's
    // cross-check survives regardless — `promoteBootstrapClaimsToWork` compares the returned claim
    // against the identity it asked for and refuses on any disagreement.
    const response = await postBrokerRequest(this.#handshake, {
      verb: "promote",
      unitId,
      worktree,
      intent: opts.intent,
    });
    return toClaimResult(response, `promote on "${unitId}" failed`);
  }

  async release(unitId: string, sessionId: string): Promise<boolean> {
    const response = await postBrokerRequest(this.#handshake, {
      verb: "release",
      unitId,
      sessionId,
    });
    if (!response.ok) throw new Error(`release on "${unitId}" failed: ${response.reason}`);
    if (response.verb !== "release") throw new Error(`release on "${unitId}": wrong verb answered`);
    return response.released;
  }

  /**
   * The ceremony's board digest is a COURTESY read it already wraps in try/catch, and the broker
   * deliberately exposes no ledger query — a read verb would widen the surface to buy a cosmetic
   * line. Throwing (rather than answering `[]`) is the honest shape: an empty answer would render
   * "no other sessions" to the operator, which is a claim this client cannot make.
   */
  async claimsFor(_unitId: string): Promise<ClaimDocT[]> {
    throw new Error("the claim broker exposes no board read — the digest is omitted, not empty");
  }
}
