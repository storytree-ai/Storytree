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

import type { ClaimDocT, ClaimResult } from "@storytree/notice-board";

import {
  BROKER_REQUEST_PATH,
  BROKER_TOKEN_HEADER,
  type BrokerHandshake,
} from "./codex-claim-broker-door.js";
import { CODEX_CLAIM_BROKER_PROTOCOL_VERSION, type BrokerResponse } from "./codex-claim-broker.js";

export { BROKER_HANDSHAKE_ENV, brokerHandshakePath } from "./codex-claim-broker-door.js";

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
  return { protocolVersion: CODEX_CLAIM_BROKER_PROTOCOL_VERSION, port, token };
}

/** How long to wait on the broker before failing closed. A local call that is slow is a broken call. */
const REQUEST_TIMEOUT_MS = 15_000;

export async function postBrokerRequest(
  handshake: BrokerHandshake,
  body: Record<string, unknown>,
): Promise<BrokerResponse> {
  const response = await fetch(`http://127.0.0.1:${handshake.port}${BROKER_REQUEST_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [BROKER_TOKEN_HEADER]: handshake.token,
    },
    body: JSON.stringify({ protocolVersion: CODEX_CLAIM_BROKER_PROTOCOL_VERSION, ...body }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const payload: unknown = await response.json();
  if (typeof payload !== "object" || payload === null || typeof (payload as { ok?: unknown }).ok !== "boolean") {
    throw new Error(`broker returned an unreadable answer (HTTP ${response.status})`);
  }
  return payload as BrokerResponse;
}

function toClaimResult(response: BrokerResponse, what: string): ClaimResult {
  if (response.ok) {
    if (response.verb === "release") throw new Error(`${what}: broker answered the wrong verb`);
    return { acquired: true, claim: response.claim, reclaimed: false };
  }
  if (response.heldBy !== undefined) return { acquired: false, heldBy: response.heldBy };
  throw new Error(`${what}: ${response.reason}`);
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
