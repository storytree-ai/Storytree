/**
 * The broker's DOOR — the local channel and the ACL that decides who may knock.
 *
 * Split from `codex-claim-broker.ts` (the grammar and decisions) and from
 * `codex-claim-broker-entry.ts` (the resident process that owns a real database) so the transport's
 * own refusals are provable over a real socket without a Cloud SQL connection.
 *
 * ## Why loopback and a handshake file, rather than a named pipe
 *
 * The requirement is that the channel carry its OWN access control — "outside the sandbox" means
 * little if any local process can knock. A Windows named pipe carries a real DACL, but Node cannot
 * set one: libuv binds the pipe with a default security descriptor and exposes no handle to adjust
 * it, so a pipe would have to be created and owned by a second, non-TypeScript process.
 *
 * Loopback + a handshake file reaches the same place with machinery the repository already proves:
 * the desktop sidecar's `loopback-guard.ts` (Origin/Host/per-launch-secret) and the actuator's own
 * `icacls` credential work. The port is ephemeral and the secret is per-launch, so the reachable
 * surface is not a well-known address; the ACL that matters is applied to the HANDSHAKE FILE, which
 * is the only way to learn either. Read access to that file IS the permission to knock, and it is
 * granted to exactly one account.
 *
 * The broker runs as the operator and OWNS the handshake file, so it can set that DACL itself — an
 * owner may always rewrite its own DACL, no elevation required.
 *
 * ## What the guard is and is not
 *
 * It answers "may this process talk to me at all", never "who is this session". Session identity is
 * decided by Git in `handleBrokerRequest`, deliberately, because a channel secret readable by the
 * sandbox account is readable by EVERY process running as that account — which is every Codex
 * session on the host. The guard is a wall around the broker; it is not, and must never be mistaken
 * for, a wall between sessions.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import os from "node:os";
import path from "node:path";

/** Overrides the whole handshake path; `STORYTREE_CODEX_BROKER_DIR` overrides only its directory. */
export const BROKER_HANDSHAKE_ENV = "STORYTREE_CODEX_BROKER_HANDSHAKE";

/**
 * Where the broker publishes, and where the client looks — ONE function, so the two halves cannot
 * drift into looking in different places (a drift that presents as "the broker is not running").
 *
 * **Deliberately NOT under `~/.storytree`.** That directory is a denied root in the generated
 * profile — the single home storytree-owned secrets live in precisely so the sandbox cannot read it.
 * A handshake placed there is unreadable by the one account that must read it, and the failure would
 * surface only at live-smoke time as an unexplained bootstrap refusal. The handshake is not a secret
 * to keep from the sandbox; it is the sandbox's own door key.
 */
export function brokerHandshakePath(env: Readonly<Record<string, string | undefined>>): string {
  const explicit = env[BROKER_HANDSHAKE_ENV];
  if (typeof explicit === "string" && explicit.length > 0) return explicit;
  const base =
    env["STORYTREE_CODEX_BROKER_DIR"] ??
    path.join(env["LOCALAPPDATA"] ?? path.join(os.homedir(), ".cache"), "Storytree", "codex-broker");
  return path.join(base, "handshake.json");
}

/** The single path the broker answers on. Anything else is 404 — no discovery surface. */
export const BROKER_REQUEST_PATH = "/claim";

/** The header carrying the per-launch shared secret. */
export const BROKER_TOKEN_HEADER = "x-storytree-codex-broker-token";

/** Refuse absurd bodies before parsing — a claim request is a few hundred bytes. */
export const BROKER_MAX_BODY_BYTES = 8 * 1024;

/** The handshake a client reads to learn where the broker is and how to prove it may knock. */
export interface BrokerHandshake {
  readonly protocolVersion: number;
  readonly port: number;
  readonly token: string;
  /**
   * Where this handshake was READ from, when it was read from a file. Diagnostic only — never sent,
   * never trusted — but it is the one fact a dead-broker message otherwise cannot state, and the
   * override envs mean a client cannot re-derive it. Absent when the broker minted it in-process.
   */
  readonly sourcePath?: string;
}

/** A fresh per-launch secret. 32 bytes of CSPRNG — never derived from anything guessable. */
export function mintBrokerToken(): string {
  return randomBytes(32).toString("hex");
}

/** Constant-time secret comparison — a length-safe wrapper, since `timingSafeEqual` throws on a mismatch. */
export function tokenMatches(expected: string, presented: string | undefined): boolean {
  if (typeof presented !== "string") return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(presented, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Is this Host header a loopback authority? Defeats DNS rebinding, which is the one way a browser
 * on this host could otherwise be steered into POSTing at an ephemeral local port.
 */
export function isLoopbackHost(host: string | undefined): boolean {
  if (typeof host !== "string" || host.length === 0) return false;
  // Strip a port; keep IPv6 brackets intact.
  const authority = host.startsWith("[")
    ? host.slice(0, host.indexOf("]") + 1)
    : (host.split(":")[0] ?? "");
  return authority === "127.0.0.1" || authority === "localhost" || authority === "[::1]";
}

export interface GuardableRequest {
  readonly method: string | undefined;
  readonly url: string | undefined;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
}

export type GuardVerdict = { readonly ok: true } | { readonly ok: false; readonly status: number; readonly reason: string };

function header(request: GuardableRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The transport guard, PURE so every refusal is testable without a socket. Order matters only for
 * the message a caller sees; all four checks must pass.
 */
export function guardBrokerRequest(request: GuardableRequest, token: string): GuardVerdict {
  if (request.method !== "POST") {
    return { ok: false, status: 405, reason: "the broker answers POST only" };
  }
  if (request.url !== BROKER_REQUEST_PATH) {
    return { ok: false, status: 404, reason: "no such endpoint" };
  }
  if (!isLoopbackHost(header(request, "host"))) {
    return { ok: false, status: 403, reason: "Host is not loopback" };
  }
  const origin = header(request, "origin");
  if (origin !== undefined && !isLoopbackHost(origin.replace(/^https?:\/\//u, ""))) {
    return { ok: false, status: 403, reason: "Origin is not loopback" };
  }
  if (!tokenMatches(token, header(request, BROKER_TOKEN_HEADER))) {
    return { ok: false, status: 403, reason: "missing or wrong broker token" };
  }
  return { ok: true };
}

/**
 * The `icacls` argument vector that scopes the handshake file to one account.
 *
 * PURE and exported for proof: the arguments are what carry the security property, and a test can
 * assert on them without touching a real ACL. `/inheritance:r` FIRST is load-bearing — without it the
 * inherited grants from the user profile stay, and every later grant is decoration on a file the
 * whole machine can already read.
 *
 * Applied by `icacls.exe <file> /inheritance:r /grant:r <operator>:(R) <sandboxAccount>:(R)`.
 */
export function handshakeAclArguments(args: {
  readonly handshakePath: string;
  readonly operatorAccount: string;
  readonly sandboxAccount: string;
}): readonly string[] {
  return [
    args.handshakePath,
    "/inheritance:r",
    "/grant:r",
    `${args.operatorAccount}:(R,W)`,
    "/grant:r",
    `${args.sandboxAccount}:(R)`,
  ];
}

/**
 * The sandbox account the actuator itself names (`New-Object Security.Principal.NTAccount(
 * $env:COMPUTERNAME, 'CodexSandboxUsers')`), rendered for `icacls`. Kept here so the broker's grant
 * and the actuator's deny can never drift to two different principals.
 */
export function sandboxAccountName(computerName: string): string {
  return `${computerName}\\CodexSandboxUsers`;
}
