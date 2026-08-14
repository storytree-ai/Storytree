import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";

import { createClaimUniverseLoader } from "@storytree/drive/claim-universe";

import {
  brokerHandshakePath,
  BrokerClaimLedger,
  readBrokerHandshake,
} from "./codex-claim-broker-client.js";
import { promoteBootstrapClaimsToWork } from "./codex-session-containment.js";
import { createWorktree, defaultWorktreeCreateIo } from "./worktree-create.js";

interface BootstrapRequest {
  readonly node: string;
  readonly intent: string;
  readonly primary: string;
}

function fail(reason: string): void {
  process.stderr.write(`Storytree Codex worktree bootstrap failed closed: ${reason}\n`);
  process.exitCode = 2;
}

/**
 * Parse the one deliberately narrow trusted command surface. Each flag appears exactly once, every
 * value is a separate argv token, and nothing positional or generic can ride beside it.
 */
function parseRequest(argv: readonly string[]): BootstrapRequest {
  if (argv.length !== 6) {
    throw new Error("expected exactly --node <id> --intent <one-line> --primary <absolute-lobby>");
  }
  const values = new Map<string, string>();
  const allowed = new Set(["--node", "--intent", "--primary"]);
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === undefined || !allowed.has(flag) || values.has(flag)) {
      throw new Error("arguments must contain each of --node, --intent and --primary exactly once");
    }
    if (value === undefined || value.length === 0 || value.startsWith("--")) {
      throw new Error(`${flag} requires one non-empty value`);
    }
    values.set(flag, value);
  }

  const node = values.get("--node");
  const intent = values.get("--intent");
  const primary = values.get("--primary");
  if (node === undefined || intent === undefined || primary === undefined) {
    throw new Error("arguments must contain each of --node, --intent and --primary exactly once");
  }
  if (node.trim() !== node || node.length === 0 || /[\r\n]/u.test(node)) {
    throw new Error("--node must be one non-blank, single-line id without surrounding whitespace");
  }
  if (intent.trim() !== intent || intent.length === 0 || /[\r\n]/u.test(intent)) {
    throw new Error("--intent must be one non-blank line without surrounding whitespace");
  }
  if (!path.isAbsolute(primary)) throw new Error("--primary must be an absolute path");
  return { node, intent, primary };
}

/** Resolve symlinks and prove this path is the primary checkout, not merely another linked worktree. */
function verifyPrimary(candidate: string): string {
  const primary = realpathSync(candidate);
  const topLevel = realpathSync(
    execFileSync("git", ["-C", primary, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim(),
  );
  const commonDirRaw = execFileSync(
    "git",
    ["-C", primary, "rev-parse", "--path-format=absolute", "--git-common-dir"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
  const commonParent = realpathSync(path.dirname(commonDirRaw));
  const same = (left: string, right: string): boolean =>
    process.platform === "win32"
      ? left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0
      : left === right;
  if (!same(primary, topLevel) || !same(primary, commonParent)) {
    throw new Error("--primary is not the repository's primary checkout");
  }
  return primary;
}

function worktreeFromEnvelope(body: string, primary: string): string {
  const match = /(?:^|\n)work from this path:\r?\n  ([^\r\n]+)(?:\r?\n|$)/u.exec(body);
  if (match?.[1] === undefined) {
    throw new Error("successful worktree ceremony returned no parseable worktree path");
  }
  const worktree = path.resolve(match[1]);
  const worktreesRoot = path.join(primary, ".claude", "worktrees");
  const relative = path.relative(worktreesRoot, worktree);
  if (
    relative.length === 0 ||
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    relative.includes(path.sep)
  ) {
    throw new Error("successful worktree ceremony returned a path outside the primary worktree root");
  }
  return worktree;
}

async function main(): Promise<void> {
  try {
    const request = parseRequest(process.argv.slice(2));
    const primary = verifyPrimary(request.primary);
    process.chdir(primary);

    // This payload holds NO credential and opens NO database connection (ADR-0368 D1/D2). It reads
    // the operator broker's handshake — whose ACL is the permission to knock at all — and every
    // ledger operation happens on the far side of that wall, performed by a process the sandbox
    // could not have started. The credential circularity ADR-0355's delivery status records
    // (`loadLocalSecrets()` + `createPool()` reaching for paths `Protect-SandboxCredentials` has
    // just denied this very account) is closed by removing the reach, not by widening the deny.
    // The shared default location, so broker and bootstrap cannot drift into looking in two places;
    // `STORYTREE_CODEX_BROKER_HANDSHAKE` overrides it. A missing or unreadable handshake refuses the
    // bootstrap outright — there is no second route to the ledger any more, and that is the point.
    const handshakePath = brokerHandshakePath(process.env);
    // Set once the ceremony has minted it; the broker derives session and branch from this PATH
    // rather than from anything this process asserts about itself (ADR-0368 D3), which is why it
    // must be a thunk — at claim-taking time the worktree does not exist yet.
    let mintedWorktree: string | undefined;
    const ledger = new BrokerClaimLedger(readBrokerHandshake(handshakePath), () => mintedWorktree);

    const envelope = await createWorktree(
      { nodes: [request.node], intent: request.intent },
      {
        ledger,
        universe: createClaimUniverseLoader({
          storiesDir: path.join(primary, "stories"),
          // No Library read: the broker exposes the claim ledger and nothing else, and the scoped
          // claim-writer identity cannot SELECT `library_artifact` by design. `claim-universe.ts`
          // treats a null store as an INCOMPLETE universe and stands every claim down rather than
          // refusing one it could not verify — "every read failure withdraws the licence to refuse".
          // So the typo check simply does not run on this path; it never refuses a legitimate claim.
          library: null,
          manifestPath: path.join(primary, "repo-manifest.json"),
        }),
        io: { ...defaultWorktreeCreateIo, primaryRoot: () => primary },
      },
    );
    if (!envelope.ok) throw new Error(envelope.body);
    const worktree = worktreeFromEnvelope(envelope.body, primary);
    mintedWorktree = worktree;

    // The ceremony leaves EXPLORING claims (ADR-0200 D3). `authorizeCodexWriter` admits a writer
    // only on a live WORK claim naming this session and branch, and the actuator has no second turn
    // in which to run `noticeboard declare` the way an interactive Claude session does — so the
    // promotion belongs to this one fail-closed operation. Branch and session identity are read back
    // from the CREATED worktree's own Git topology rather than assumed from the mint, so the claim
    // is stamped to what the writer's hook will independently observe.
    const branch = execFileSync("git", ["-C", worktree, "rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    // The session/branch passed here stay the CROSS-CHECK, not the instruction: the broker ignores
    // them and re-derives both from the worktree's own Git topology, then this function refuses if
    // what came back disagrees with what it asked for. Two independent derivations of the same
    // identity have to agree before a writer is authorised.
    const promotion = await promoteBootstrapClaimsToWork({
      ledger,
      nodes: [request.node],
      sessionId: path.basename(worktree),
      branch,
      intent: request.intent,
    });
    if (!promotion.ok) throw new Error(promotion.reason);

    process.stdout.write(JSON.stringify({ worktree }));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

void main();
