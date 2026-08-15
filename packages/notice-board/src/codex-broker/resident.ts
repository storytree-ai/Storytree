/**
 * The RESIDENT claim authority, as a composition a host process can hold (ADR-0375).
 *
 * ## What moved, and what did not
 *
 * ADR-0368 D1 required that **Codex never LAUNCH the broker** — authority comes from who started the
 * process, and a broker the writer starts is the actuator again wearing a new name. That rule is
 * untouched here. What changes is only WHICH operator-started process holds it: this module is the
 * composition, and it is called by two hosts — `codex-claim-broker-entry.ts` (the standalone,
 * headless form) and the storytree desktop backend, which is already a long-lived operator process
 * holding a warm pool.
 *
 * A desktop app spawned BY a sandboxed Codex runs as `CodexSandboxUsers` with ADC denied: it holds no
 * credential and can impersonate nothing, so `createPool` below fails and the broker never starts.
 * D1 therefore survives embedding rather than being weakened by it.
 *
 * ## Why this is not just `main()` with the signal handlers deleted
 *
 * A host cannot call the entry's `main()`: it registers process-wide `SIGINT`/`SIGTERM` handlers and
 * calls `process.exit(0)`, which in an embedded setting kills the host. Everything here returns a
 * handle whose {@link ResidentClaimBroker.close} the host wires into its OWN shutdown, and nothing
 * touches `process.on` or `process.exit`.
 *
 * ## The identity, and why a second pool is the correct shape
 *
 * `storytree-codex-claim-writer@…` — SELECT/INSERT/UPDATE/DELETE on `events.node_claim`, INSERT on
 * `events.claim_event`, USAGE on its sequence: 2 of the 19 tables in `events`
 * (`docs/research/codex-claim-writer-scoped-identity-2026-08-14.md`, PR #1323).
 *
 * The desktop backend ALREADY holds a pool — `createPool()` with no arguments, which is the desktop's
 * FULL library identity. Riding that pool is the one thing this must not do: it would hand the broker
 * a broad credential and silently undo the property the whole arc was sequenced to establish (the
 * narrow identity landed FIRST precisely so the broker was never built holding anything broader). Two
 * pools in one process is not a smell here; it is the decision.
 */

import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { closePool, createPool } from "@storytree/library/store/connection";

import { PgClaimStore } from "../store/claim-store.js";
import {
  brokerHandshakePath,
  handshakeAclArguments,
  mintBrokerToken,
  sandboxAccountName,
  type BrokerHandshake,
} from "./door.js";
import { startBrokerServer } from "./server.js";
import { BrokerSessionRegistry, type BrokerTopologyProbe } from "./broker.js";
import { resolveCodexSessionTopology } from "./topology.js";

/** The Cloud SQL IAM user the broker connects as. Never the operator's personal login. */
export const CLAIM_WRITER_DATABASE_USER = "storytree-codex-claim-writer@storytree-498613.iam";
/** The service account that user impersonates — operator-only impersonation, granted in PR #1323. */
export const CLAIM_WRITER_SERVICE_ACCOUNT =
  "storytree-codex-claim-writer@storytree-498613.iam.gserviceaccount.com";

/**
 * The EXACT pool options the resident broker connects with — pure, so a host can be held to them by
 * test without opening a connection.
 *
 * This exists because the failure it guards is silent: a host that passed `{}` (or reused a pool it
 * already had) would work perfectly, pass every functional test, and be connected as whatever
 * identity the host holds. Nothing downstream would notice, which is exactly why the assertion has to
 * be on the OPTIONS rather than on the behaviour.
 */
export function claimWriterPoolOptions(): { user: string; impersonateServiceAccount: string } {
  return {
    user: CLAIM_WRITER_DATABASE_USER,
    impersonateServiceAccount: CLAIM_WRITER_SERVICE_ACCOUNT,
  };
}

function git(cwd: string, args: readonly string[]): string {
  return (
    execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }) as string
  ).trim();
}

/**
 * The repository this broker is fenced to, derived from Git's COMMON directory rather than from
 * `--show-toplevel`.
 *
 * This distinction is load-bearing and was a live defect. `--show-toplevel` answers the working tree
 * the process is standing in, so a broker started from a linked worktree pinned ITSELF to that
 * worktree — and then refused every `promote`, because the topology probe resolves a caller's
 * `primaryCheckout` through the common dir and the two could never agree. `--git-common-dir` answers
 * the same primary checkout from anywhere in the repository, including from the desktop's pinned
 * runtime worktree (ADR-0181), which is a linked worktree and therefore precisely the case that was
 * broken.
 */
export function residentBrokerRepository(cwd: string, canonicalize: (p: string) => string): string {
  return canonicalize(
    path.dirname(git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"])),
  );
}

/**
 * The real topology probe: run Git against the path the caller named and let GIT say who that is.
 *
 * Fenced to ONE repository — the primary checkout this broker was started for. A worktree of some
 * other repository is refused even if its topology resolves perfectly, because a broker that would
 * promote claims for any checkout on the host is a broker whose fence is "whatever the caller sends".
 */
export function realTopologyProbe(
  primaryCheckout: string,
  canonicalize: (p: string) => string,
): BrokerTopologyProbe {
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
            worktreeList: execFileSync("git", ["-C", worktree, "worktree", "list", "--porcelain"], {
              encoding: "utf8",
              stdio: ["ignore", "pipe", "pipe"],
            }) as string,
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
export function publishHandshake(
  handshakePath: string,
  handshake: BrokerHandshake,
  env: NodeJS.ProcessEnv,
  log: (line: string) => void,
): void {
  mkdirSync(path.dirname(handshakePath), { recursive: true });
  writeFileSync(handshakePath, JSON.stringify(handshake), { encoding: "utf8", mode: 0o600 });

  if (process.platform !== "win32") {
    chmodSync(handshakePath, 0o600);
    log("storytree codex claim broker: not Windows — handshake is 0600 with no sandbox ACL applied.\n");
    return;
  }
  const computerName = env["COMPUTERNAME"];
  const operator = env["USERNAME"];
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

/** A running resident broker, and the host's handle on its teardown. */
export interface ResidentClaimBroker {
  readonly port: number;
  readonly handshakePath: string;
  /** The one repository this broker will promote claims for. */
  readonly primaryCheckout: string;
  /** The Cloud SQL IAM user it connected as — surfaced so a host can log (and prove) it. */
  readonly databaseUser: string;
  /** Remove the handshake, stop the listener, end the pool. Safe to call once; never exits. */
  close(): Promise<void>;
}

/** Test seam: the two effectful constructions a host has no business performing for real in a test. */
export interface ResidentBrokerConstruction {
  readonly createPool?: typeof createPool;
  readonly publishHandshake?: (handshakePath: string, handshake: BrokerHandshake) => void;
  readonly resolveRepository?: (cwd: string) => string;
}

/**
 * Compose and start the resident claim authority. The host supplies its environment and working
 * directory and gets back a handle; it registers nothing globally.
 *
 * Fails CLOSED and LOUDLY: if the handshake cannot be scoped to its two principals, the server and
 * the pool are torn down and the error rethrown, because a handshake this process cannot lock is a
 * door with no lock — serving openly would be worse than not serving.
 */
export async function startResidentClaimBroker(
  args: {
    readonly env: NodeJS.ProcessEnv;
    readonly cwd: string;
    /** Where operator-facing lines go. Defaults to stderr; the desktop sidecar reserves stdout. */
    readonly log?: (line: string) => void;
  },
  construction: ResidentBrokerConstruction = {},
): Promise<ResidentClaimBroker> {
  const log = args.log ?? ((line: string) => process.stderr.write(line));
  const canonicalize = (p: string): string => path.resolve(p);
  const handshakePath = brokerHandshakePath(args.env);
  const primaryCheckout = (construction.resolveRepository ?? ((cwd: string) => residentBrokerRepository(cwd, canonicalize)))(
    args.cwd,
  );

  // The one place the identity is chosen. It is passed EXPLICITLY rather than left to ambient
  // STORYTREE_DB_USER, so a host whose environment already names another principal cannot silently
  // lend this broker its own.
  const handle = await (construction.createPool ?? createPool)(claimWriterPoolOptions());

  const broker = await startBrokerServer({
    token: mintBrokerToken(),
    deps: {
      ledger: new PgClaimStore(handle.pool),
      topology: realTopologyProbe(primaryCheckout, canonicalize),
      registry: new BrokerSessionRegistry(),
    },
  });

  try {
    (construction.publishHandshake ??
      ((p: string, h: BrokerHandshake) => publishHandshake(p, h, args.env, log)))(
      handshakePath,
      broker.handshake,
    );
  } catch (error) {
    // Tear down best-effort and rethrow the ORIGINAL error. A failure while cleaning up must never
    // replace the reason we are cleaning up: the caller needs "cannot scope the handshake ACL", not
    // whatever the pool said on its way out, or the operator debugs the wrong problem entirely.
    try {
      await broker.close();
    } catch {
      // ignored — the original error is the one that matters
    }
    try {
      await closePool(handle.pool, handle.connector);
    } catch {
      // ignored — as above
    }
    throw error;
  }

  log(
    `storytree codex claim broker listening on 127.0.0.1:${broker.port}\n` +
      `  identity:   ${CLAIM_WRITER_DATABASE_USER}\n` +
      `  repository: ${primaryCheckout}\n` +
      `  handshake:  ${handshakePath}\n`,
  );

  return {
    port: broker.port,
    handshakePath,
    primaryCheckout,
    databaseUser: CLAIM_WRITER_DATABASE_USER,
    close: async () => {
      // The handshake names a port that is about to stop answering; removing it is what stops a
      // later caller from failing with a connection error instead of an honest "broker not running".
      try {
        rmSync(handshakePath, { force: true });
      } catch {
        // Best-effort — a stale handshake fails closed at the client anyway.
      }
      await broker.close();
      await closePool(handle.pool, handle.connector);
    },
  };
}
