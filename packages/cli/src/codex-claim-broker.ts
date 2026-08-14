/**
 * The out-of-sandbox claim broker — PURE half (protocol + engine).
 *
 * ## Why this exists
 *
 * ADR-0355's lobby bootstrap authenticates as the identity its own boundary just denied. The
 * actuator is well-built — hash-pinned, exact-grammar, exact-arity, topology-verified — and it still
 * fails, because Codex INVOKES it, so it runs under `CodexSandboxUsers` and
 * `Protect-SandboxCredentials` has already denied it gcloud ADC, `~/.storytree/secrets.json` and
 * `~/.codex/auth.json`. Authentication is not something a program DOES; it is something a program HAS
 * by virtue of who started it. No amount of argument validation fixes an inherited token.
 *
 * So the broker is a process **already running as the operator** that the sandboxed writer sends a
 * message to. Codex starts nothing. That single property is the whole design, and it is easy to
 * rebuild the defect by accident — a broker Codex launches is just the actuator again.
 *
 * ## What crosses the wall
 *
 * Results, never credentials. The broker performs the ledger write itself and answers `ok` or a
 * refusal naming the holder. Nothing secret crosses, so there is nothing for a prompt-injected or
 * confused writer to exfiltrate — which is why this is strictly better than a token-vending broker
 * that needs every piece this one needs and THEN hands a credential across.
 *
 * ## Where identity comes from, and the one place it cannot
 *
 * The capability a bare claim-writer token can never have at any expiry: Postgres grants are
 * table-shaped and cannot express "only rows for your own session", so a token alone would let any
 * Codex session promote or release any other session's claims. The broker closes that by deriving
 * identity ITSELF rather than trusting the caller's assertion — but WHERE it can do so differs by
 * verb, and the difference is structural, not an oversight:
 *
 * - **`promote` derives from Git.** By promotion time the worktree exists, so
 *   {@link BrokerTopologyProbe} re-reads session id and branch from the worktree's own Git topology
 *   and the caller's assertion is ignored. A caller cannot promote a session it is not standing in.
 * - **`take` cannot** — `storytree worktree create` takes its exploring claims BEFORE
 *   `git worktree add` runs (worktree-create.ts: "take the exploring claim(s) → fetch + git worktree
 *   add"), so at take time there is no topology to read. The narrowing there is structural instead:
 *   the grade is forced to `exploring`, the branch must be exactly `claude/<sessionId>`, and a unit
 *   another live session holds is refused by the ledger itself. A take can therefore only ever create
 *   this session's own row, and can never elevate a grade.
 * - **`release` is narrowed by memory.** It is the verb that could drop someone else's claim, so it
 *   refuses any session this broker instance did not itself mint via `take`
 *   ({@link BrokerSessionRegistry}). See the ADR for why the verb exists at all despite the
 *   increment's "exactly two operations".
 *
 * ## Discipline carried forward from the actuator
 *
 * Exact grammar, fixed argument shapes, no string interpolation into a command, no shelling out on a
 * caller's behalf. **The broker is the new attack surface**; a loose grammar turns a wall into a
 * ladder. Everything below is total over `unknown` and refuses by default.
 *
 * This module is PURE — no `node:net`, no `pg`, no `node:child_process`. The resident server, the
 * loopback door and the real ledger live in `codex-claim-broker-entry.ts`; the client the bootstrap
 * dials lives in `codex-claim-broker-client.ts`. Keeping the grammar and the decisions here is what
 * makes the refusals provable without a socket or a database.
 */

import type { ClaimDocT, ClaimResult } from "@storytree/notice-board";
import { claimGrade } from "@storytree/notice-board";

/** Wire-format version. A mismatch is refused outright — never negotiated down. */
export const CODEX_CLAIM_BROKER_PROTOCOL_VERSION = 1;

/**
 * The branch prefix `storytree worktree create` mints (`claude/` + basename, worktree-create.ts).
 * The harness prefix is load-bearing — CI and `scripts/merged-branch-guard.sh` recognise `claude/*` —
 * so a take naming any other shape is refused rather than normalised.
 */
const MINTED_BRANCH_PREFIX = "claude/";

/**
 * The minted session-id grammar. `worktree create` builds the basename from slugged node ids joined
 * by `-`, caps it at 40 characters and trims stray hyphens, so this is deliberately a little wider
 * than the mint and a great deal narrower than "any string".
 */
const SESSION_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;

/** Unit ids are library/tree ids — the same conservative slug shape, allowing the `kind:` forms. */
const UNIT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

/** One line of free prose. Newlines are refused so a request can never forge a second field. */
const INTENT_MAX = 500;

export interface BrokerTakeRequest {
  readonly verb: "take";
  readonly unitId: string;
  readonly sessionId: string;
  readonly branch: string;
  readonly intent: string;
}

export interface BrokerPromoteRequest {
  readonly verb: "promote";
  readonly unitId: string;
  /** The minted worktree. Identity is re-derived FROM it; nothing the caller says about itself is used. */
  readonly worktree: string;
  readonly intent: string;
}

export interface BrokerReleaseRequest {
  readonly verb: "release";
  readonly unitId: string;
  readonly sessionId: string;
}

export type BrokerRequest = BrokerTakeRequest | BrokerPromoteRequest | BrokerReleaseRequest;

export type BrokerResponse =
  | { readonly ok: true; readonly verb: "take" | "promote"; readonly claim: ClaimDocT }
  | { readonly ok: true; readonly verb: "release"; readonly released: boolean }
  | {
      readonly ok: false;
      readonly reason: string;
      /**
       * The live holder, when the refusal is CONTENTION rather than a fault. Present so a client can
       * rebuild a faithful `ClaimResult` — a refusal that named no holder would force the client to
       * invent one, and an invented holder is how "held by someone" becomes "held by nobody" at the
       * call site. Its absence is meaningful: it says the refusal was NOT contention (a malformed
       * request, an unreachable store, a topology that would not resolve), and a client must surface
       * that as a failure rather than as a busy unit.
       *
       * The notice board is shared information by design — the dock renders every holder — so
       * returning it discloses nothing the caller could not already read.
       */
      readonly heldBy?: ClaimDocT;
    };

/**
 * The ledger slice the broker drives — structurally `PgClaimStore`, kept as an interface so every
 * refusal below is provable without a database (the {@link BrokerTopologyProbe} pattern, and the
 * `BootstrapClaimLedger` precedent in `codex-session-containment.ts`).
 */
export interface BrokerLedger {
  take(req: {
    unitId: string;
    sessionId: string;
    branch: string;
    intent?: string;
    grade?: "exploring" | "waiting" | "work";
  }): Promise<ClaimResult>;
  upgrade(
    unitId: string,
    sessionId: string,
    opts: { branch: string; intent: string },
  ): Promise<ClaimResult>;
  release(unitId: string, sessionId: string): Promise<boolean>;
}

/** What the broker derives for itself from a path, rather than believing about a caller. */
export interface BrokerDerivedIdentity {
  readonly sessionId: string;
  readonly branch: string;
}

/**
 * Re-derives a worktree's session identity from Git. Implemented in the entry point over the real
 * `resolveCodexSessionTopology`; a fake here is what makes the promote refusals testable.
 *
 * Returns a refusal rather than throwing for the ordinary "that is not a registered worktree of this
 * repository" case, so the broker answers a caller instead of dying.
 */
export interface BrokerTopologyProbe {
  derive(worktree: string): Promise<{ ok: true; identity: BrokerDerivedIdentity } | { ok: false; reason: string }>;
}

/**
 * The sessions this broker instance minted. `release` is refused for anything absent, which is what
 * keeps the one destructive verb from reaching a claim the caller does not own.
 *
 * Deliberately in-memory and deliberately NOT persisted: a restarted broker forgetting its mints
 * fails CLOSED (a release is refused and the claim ages out to reclaimable), whereas a persisted
 * registry that survived a crash could authorise a release for a session that no longer exists.
 */
export class BrokerSessionRegistry {
  readonly #minted = new Set<string>();

  remember(sessionId: string): void {
    this.#minted.add(sessionId);
  }

  minted(sessionId: string): boolean {
    return this.#minted.has(sessionId);
  }

  get size(): number {
    return this.#minted.size;
  }
}

export interface BrokerDeps {
  readonly ledger: BrokerLedger;
  readonly topology: BrokerTopologyProbe;
  readonly registry: BrokerSessionRegistry;
}

function refuse(reason: string, heldBy?: ClaimDocT): BrokerResponse {
  return heldBy === undefined ? { ok: false, reason } : { ok: false, reason, heldBy };
}

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== "string") throw new Error(`${key} must be a string`);
  if (value !== value.trim() || value.length === 0) {
    throw new Error(`${key} must be one non-blank value without surrounding whitespace`);
  }
  if (/[\r\n ]/u.test(value)) throw new Error(`${key} must be a single line`);
  return value;
}

function assertExactKeys(source: Record<string, unknown>, allowed: readonly string[]): void {
  const extra = Object.keys(source).filter((key) => !allowed.includes(key));
  if (extra.length > 0) {
    // Refusing unknown keys is not pedantry: the Codex app-server's habit of silently ACCEPTING
    // unknown params is exactly what made a vestigial field indistinguishable from a live one during
    // the rebinding probe. A grammar that ignores what it does not understand cannot be audited.
    throw new Error(`unexpected field(s): ${extra.sort().join(", ")}`);
  }
}

/**
 * Parse the one deliberately narrow request grammar — total over `unknown`, throwing on anything it
 * does not recognise. Each verb declares its EXACT field set; unknown fields, missing fields, wrong
 * types, multi-line values and protocol drift are all refusals.
 */
export function parseBrokerRequest(raw: unknown): BrokerRequest {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("request must be a JSON object");
  }
  const source = raw as Record<string, unknown>;
  if (source["protocolVersion"] !== CODEX_CLAIM_BROKER_PROTOCOL_VERSION) {
    throw new Error(
      `unsupported protocolVersion — this broker speaks ${CODEX_CLAIM_BROKER_PROTOCOL_VERSION} only`,
    );
  }

  const verb = source["verb"];
  if (verb === "take") {
    assertExactKeys(source, ["protocolVersion", "verb", "unitId", "sessionId", "branch", "intent"]);
    const unitId = readString(source, "unitId");
    const sessionId = readString(source, "sessionId");
    const branch = readString(source, "branch");
    const intent = readString(source, "intent");
    if (!UNIT_ID.test(unitId)) throw new Error("unitId is not a well-formed unit id");
    if (!SESSION_ID.test(sessionId)) throw new Error("sessionId is not a well-formed minted session id");
    if (branch !== MINTED_BRANCH_PREFIX + sessionId) {
      throw new Error(`branch must be exactly "${MINTED_BRANCH_PREFIX}<sessionId>"`);
    }
    if (intent.length > INTENT_MAX) throw new Error(`intent exceeds ${INTENT_MAX} characters`);
    return { verb: "take", unitId, sessionId, branch, intent };
  }

  if (verb === "promote") {
    assertExactKeys(source, ["protocolVersion", "verb", "unitId", "worktree", "intent"]);
    const unitId = readString(source, "unitId");
    const worktree = readString(source, "worktree");
    const intent = readString(source, "intent");
    if (!UNIT_ID.test(unitId)) throw new Error("unitId is not a well-formed unit id");
    if (intent.length > INTENT_MAX) throw new Error(`intent exceeds ${INTENT_MAX} characters`);
    return { verb: "promote", unitId, worktree, intent };
  }

  if (verb === "release") {
    assertExactKeys(source, ["protocolVersion", "verb", "unitId", "sessionId"]);
    const unitId = readString(source, "unitId");
    const sessionId = readString(source, "sessionId");
    if (!UNIT_ID.test(unitId)) throw new Error("unitId is not a well-formed unit id");
    if (!SESSION_ID.test(sessionId)) throw new Error("sessionId is not a well-formed minted session id");
    return { verb: "release", unitId, sessionId };
  }

  throw new Error('verb must be one of "take", "promote" or "release"');
}

/**
 * Perform one parsed request. Fail-closed throughout: a ledger throw, a refusal, a queued arm, or a
 * grade that did not land where it was asked to all answer `ok: false`. The store being unreachable
 * is therefore indistinguishable from a refusal to the caller, which is the correct direction — a
 * bootstrap that read an outage as success would mint a worktree whose writer the hook must then
 * refuse on every single write.
 */
export async function handleBrokerRequest(
  request: BrokerRequest,
  deps: BrokerDeps,
): Promise<BrokerResponse> {
  try {
    if (request.verb === "take") {
      const result = await deps.ledger.take({
        unitId: request.unitId,
        sessionId: request.sessionId,
        branch: request.branch,
        intent: request.intent,
        // Forced, never caller-supplied: `take` is the verb with no topology to check against, so it
        // must not be able to mint work authority. Elevation is `promote`'s job and is Git-gated.
        grade: "exploring",
      });
      if (!result.acquired) {
        return refuse(
          `take on "${request.unitId}" REFUSED — held by ${result.heldBy.sessionId} ` +
            `(branch ${result.heldBy.branch}, intent "${result.heldBy.intent}")`,
          result.heldBy,
        );
      }
      if (result.claim.sessionId !== request.sessionId || result.claim.branch !== request.branch) {
        return refuse(
          `take on "${request.unitId}" landed on ${result.claim.sessionId}/${result.claim.branch}, ` +
            `not the requested ${request.sessionId}/${request.branch}`,
        );
      }
      deps.registry.remember(request.sessionId);
      return { ok: true, verb: "take", claim: result.claim };
    }

    if (request.verb === "promote") {
      // The caller names a PATH; the broker decides WHO that is. Anything the request says about its
      // own identity is discarded here — this is the check a scoped Postgres grant cannot express.
      const derived = await deps.topology.derive(request.worktree);
      if (!derived.ok) return refuse(`promote REFUSED — ${derived.reason}`);
      const { sessionId, branch } = derived.identity;

      const result = await deps.ledger.upgrade(request.unitId, sessionId, {
        branch,
        intent: request.intent,
      });
      if (!result.acquired) {
        return refuse(
          `promote on "${request.unitId}" REFUSED — held by ${result.heldBy.sessionId} ` +
            `(branch ${result.heldBy.branch}, intent "${result.heldBy.intent}")`,
          result.heldBy,
        );
      }
      if (claimGrade(result.claim) !== "work") {
        return refuse(
          `promote on "${request.unitId}" returned grade ${claimGrade(result.claim)}, not work`,
        );
      }
      if (result.claim.sessionId !== sessionId || result.claim.branch !== branch) {
        return refuse(
          `promote on "${request.unitId}" landed on ${result.claim.sessionId}/${result.claim.branch}, ` +
            `not the Git-derived ${sessionId}/${branch}`,
        );
      }
      return { ok: true, verb: "promote", claim: result.claim };
    }

    if (!deps.registry.minted(request.sessionId)) {
      return refuse(
        `release on "${request.unitId}" REFUSED — this broker did not mint session ` +
          `"${request.sessionId}"; a broker never releases a claim it did not take`,
      );
    }
    const released = await deps.ledger.release(request.unitId, request.sessionId);
    return { ok: true, verb: "release", released };
  } catch (error) {
    return refuse(
      `broker failed closed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Parse-then-handle, the shape a transport actually wants: one `unknown` in, one response out, never
 * a throw. A malformed request is a refusal like any other — the door does not get to crash.
 */
export async function serveBrokerRequest(raw: unknown, deps: BrokerDeps): Promise<BrokerResponse> {
  let request: BrokerRequest;
  try {
    request = parseBrokerRequest(raw);
  } catch (error) {
    return refuse(
      `malformed request: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return handleBrokerRequest(request, deps);
}
