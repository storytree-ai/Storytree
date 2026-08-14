/**
 * The RESIDENT claim broker — the process that must already be running as the operator.
 *
 * ## Read this before changing how it starts
 *
 * **Codex must never be able to launch this.** That is not a preference, it is the entire repair.
 * The existing trusted actuator is hash-pinned, exact-grammar, exact-arity and topology-verified, and
 * it STILL fails, because Codex invokes it and it therefore runs with the sandbox's token — the very
 * token `Protect-SandboxCredentials` has just denied every credential path. Authentication is
 * something a process HAS by virtue of who started it. A broker started on demand by the writer is
 * the actuator again, wearing a new name.
 *
 * So this is started by the OPERATOR — by hand, by a logon task, by a service wrapper — and the
 * sandboxed writer only ever sends it a message.
 *
 * ## The identity it holds
 *
 * `storytree-codex-claim-writer@…`, minted and proven narrow on 2026-08-14
 * (`docs/research/codex-claim-writer-scoped-identity-2026-08-14.md`): SELECT/INSERT/UPDATE/DELETE on
 * `events.node_claim`, INSERT on `events.claim_event`, USAGE on its sequence — reaching 2 of the 19
 * tables in `events`, with the audit table append-only. Never the operator's personal login: the
 * whole ordering of this arc exists so the broker was never BUILT holding one.
 *
 * ## Where the credential stops
 *
 * Here. Results cross the wall, credentials do not. The broker performs the ledger write itself and
 * answers `ok` or a refusal naming the holder, so a prompt-injected or confused writer has nothing to
 * exfiltrate — which is exactly why a token-vending broker was rejected: it needs every piece this
 * one needs (a privileged resident process, a channel, an ACL) and THEN hands a credential across.
 *
 * Run it:
 *
 *     node --import tsx packages/cli/src/codex-claim-broker-entry.ts
 */

import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { closePool, createPool } from "@storytree/library/store/connection";
import { PgClaimStore } from "@storytree/notice-board/store/claim-store";

import {
  brokerHandshakePath,
  handshakeAclArguments,
  mintBrokerToken,
  sandboxAccountName,
} from "./codex-claim-broker-door.js";
import { startBrokerServer } from "./codex-claim-broker-server.js";
import { BrokerSessionRegistry, type BrokerTopologyProbe } from "./codex-claim-broker.js";
import { resolveCodexSessionTopology } from "./codex-session-containment.js";

const CLAIM_WRITER_DATABASE_USER = "storytree-codex-claim-writer@storytree-498613.iam";
const CLAIM_WRITER_SERVICE_ACCOUNT =
  "storytree-codex-claim-writer@storytree-498613.iam.gserviceaccount.com";

function git(cwd: string, args: readonly string[]): string {
  return (
    execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }) as string
  ).trim();
}

/**
 * The real topology probe: run Git against the path the caller named and let GIT say who that is.
 *
 * Fenced to ONE repository — the primary checkout this broker was started for. A worktree of some
 * other repository is refused even if its topology resolves perfectly, because a broker that would
 * promote claims for any checkout on the host is a broker whose fence is "whatever the caller sends".
 */
function realTopologyProbe(primaryCheckout: string, canonicalize: (p: string) => string): BrokerTopologyProbe {
  return {
    async derive(worktree) {
      let topology;
      try {
        topology = resolveCodexSessionTopology(
          {
            topLevel: git(worktree, ["rev-parse", "--path-format=absolute", "--show-toplevel"]),
            gitDir: git(worktree, ["rev-parse", "--path-format=absolute", "--git-dir"]),
            commonDir: git(worktree, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
            branch: git(worktree, ["rev-parse", "--abbrev-ref", "HEAD"]),
            worktreeList: (execFileSync("git", ["-C", worktree, "worktree", "list", "--porcelain"], {
              encoding: "utf8",
              stdio: ["ignore", "pipe", "pipe"],
            }) as string),
          },
          { canonicalize },
        );
      } catch (error) {
        return {
          ok: false,
          reason: `Git could not describe "${worktree}": ${error instanceof Error ? error.message : String(error)}`,
        };
      }
      if (!topology.ok) return { ok: false, reason: topology.reason };
      if (topology.location !== "worktree") {
        return { ok: false, reason: "that path is the lobby, not a linked worktree" };
      }
      if (canonicalize(topology.primaryCheckout) !== primaryCheckout) {
        return { ok: false, reason: "that worktree belongs to a different repository" };
      }
      return { ok: true, identity: { sessionId: topology.sessionId, branch: topology.branch } };
    },
  };
}

/**
 * Publish the handshake, then scope it to exactly two principals. Read access to this file IS the
 * permission to knock, so the ACL is the door's lock and `/inheritance:r` is what makes it one —
 * without it the profile's inherited grants stand and every later grant is decoration.
 *
 * On a non-Windows host there is no `CodexSandboxUsers` and no sandbox to scope to; the file is
 * written 0600 and the broker says plainly that it is running unfenced, rather than pretending.
 */
function publishHandshake(handshakePath: string, handshake: unknown): void {
  mkdirSync(path.dirname(handshakePath), { recursive: true });
  writeFileSync(handshakePath, JSON.stringify(handshake), { encoding: "utf8", mode: 0o600 });

  if (process.platform !== "win32") {
    chmodSync(handshakePath, 0o600);
    process.stderr.write(
      "storytree codex claim broker: not Windows — handshake is 0600 with no sandbox ACL applied.\n",
    );
    return;
  }
  const computerName = process.env["COMPUTERNAME"];
  const operator = process.env["USERNAME"];
  if (!computerName || !operator) {
    throw new Error("cannot scope the handshake ACL: COMPUTERNAME/USERNAME are not set");
  }
  execFileSync(
    "icacls.exe",
    [
      ...handshakeAclArguments({
        handshakePath,
        operatorAccount: `${computerName}\\${operator}`,
        sandboxAccount: sandboxAccountName(computerName),
      }),
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
}

async function main(): Promise<void> {
  const handshakePath = brokerHandshakePath(process.env);
  const primaryCheckout = path.resolve(
    git(process.cwd(), ["rev-parse", "--path-format=absolute", "--show-toplevel"]),
  );

  const handle = await createPool({
    user: CLAIM_WRITER_DATABASE_USER,
    impersonateServiceAccount: CLAIM_WRITER_SERVICE_ACCOUNT,
  });

  const broker = await startBrokerServer({
    token: mintBrokerToken(),
    deps: {
      ledger: new PgClaimStore(handle.pool),
      topology: realTopologyProbe(primaryCheckout, (p) => path.resolve(p)),
      registry: new BrokerSessionRegistry(),
    },
  });

  try {
    publishHandshake(handshakePath, broker.handshake);
  } catch (error) {
    // A handshake we cannot scope is a door with no lock. Refuse to serve rather than serve openly.
    await broker.close();
    await closePool(handle.pool, handle.connector);
    throw error;
  }

  process.stderr.write(
    `storytree codex claim broker listening on 127.0.0.1:${broker.port}\n` +
      `  identity:  ${CLAIM_WRITER_DATABASE_USER}\n` +
      `  repository: ${primaryCheckout}\n` +
      `  handshake:  ${handshakePath}\n`,
  );

  const shutdown = (signal: string): void => {
    process.stderr.write(`storytree codex claim broker: ${signal} — shutting down\n`);
    void (async () => {
      // The handshake names a port that is about to stop answering; removing it is what stops a
      // later caller from failing with a connection error instead of an honest "broker not running".
      try {
        rmSync(handshakePath, { force: true });
      } catch {
        // Best-effort — a stale handshake fails closed at the client anyway.
      }
      await broker.close();
      await closePool(handle.pool, handle.connector);
      process.exit(0);
    })();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `storytree codex claim broker failed closed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 2;
});
