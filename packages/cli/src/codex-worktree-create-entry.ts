import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";

import { createClaimUniverseLoader } from "@storytree/drive/claim-universe";
import { loadLocalSecrets } from "@storytree/drive/secrets";
import { closePool, createPool } from "@storytree/library/store/connection";
import { PgLibraryStore } from "@storytree/library/store/pg-store";
import { PgClaimStore } from "@storytree/notice-board/store/claim-store";

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
  let handle: Awaited<ReturnType<typeof createPool>> | undefined;
  try {
    const request = parseRequest(process.argv.slice(2));
    const primary = verifyPrimary(request.primary);
    process.chdir(primary);

    loadLocalSecrets();
    handle = await createPool();
    const library = new PgLibraryStore(handle.pool);
    const envelope = await createWorktree(
      { nodes: [request.node], intent: request.intent },
      {
        ledger: new PgClaimStore(handle.pool),
        universe: createClaimUniverseLoader({
          storiesDir: path.join(primary, "stories"),
          library,
          manifestPath: path.join(primary, "repo-manifest.json"),
        }),
        io: { ...defaultWorktreeCreateIo, primaryRoot: () => primary },
      },
    );
    if (!envelope.ok) throw new Error(envelope.body);
    const worktree = worktreeFromEnvelope(envelope.body, primary);

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
    const promotion = await promoteBootstrapClaimsToWork({
      ledger: new PgClaimStore(handle.pool),
      nodes: [request.node],
      sessionId: path.basename(worktree),
      branch,
      intent: request.intent,
    });
    if (!promotion.ok) throw new Error(promotion.reason);

    await closePool(handle.pool, handle.connector);
    handle = undefined;
    process.stdout.write(JSON.stringify({ worktree }));
  } catch (error) {
    if (handle !== undefined) {
      try {
        await closePool(handle.pool, handle.connector);
      } catch {
        // The original refusal is the useful one; closing is best-effort on that path.
      }
    }
    fail(error instanceof Error ? error.message : String(error));
  }
}

void main();
