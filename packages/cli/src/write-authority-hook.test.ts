/**
 * Behavioural contract for the Claude `PreToolUse` write-authority boundary
 * (`packages/cli/write-authority-hook.mjs`, ADR-0257 D1/D3/D5 — increment 2 of the
 * session-isolation wall).
 *
 * THIS SUITE SPAWNS THE REAL HOOK AGAINST A REAL FILESYSTEM. That is deliberate and is the point of
 * the increment: `write-authority.ts` already had 28 unit tests and refused every unauthorised shape
 * — and refused nothing in reality, because nothing invoked it. A suite that imported the decision
 * again would re-prove the half that was never in doubt. So every case below builds an actual
 * primary checkout with two actual sibling worktrees, actual `.git`/HEAD files, an actual receipt,
 * pipes actual hook JSON over stdin, and asserts on what the hook actually printed.
 *
 * THE RED IS PROVEN BEFORE THE GREEN. The first test drives a genuinely conflicting write — session
 * `alpha` writing into sibling `beta`'s workspace — with the wall switched OFF, and asserts the hook
 * PERMITS it. That is today's behaviour and the failure mode the arc exists to close; asserting it
 * makes the green that follows meaningful rather than decorative. The very next test sends the SAME
 * input with the wall switched ON and asserts the refusal. The only variable between them is the
 * switch.
 *
 * It also pins the thing the increment most needs pinned: the wall is OFF BY DEFAULT, so merging it
 * changes no session's behaviour until the fleet is drained and the flip lands.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { mintReceipt, receiptPath, type LiveClaim } from "@storytree/drive";

const HOOK = fileURLToPath(new URL("../write-authority-hook.mjs", import.meta.url));

const ALPHA = "alpha-1a2b3c";
const BETA = "beta-4d5e6f";
const ALPHA_BRANCH = "claude/alpha-1a2b3c";

interface Fixture {
  primaryRoot: string;
  alphaRoot: string;
  betaRoot: string;
}

/**
 * Build a real primary checkout with two sibling worktrees. `.git` is a FILE pointing at a gitdir
 * whose HEAD names the branch — the exact shape a linked git worktree has, because the hook reads
 * HEAD off disk rather than spawning git.
 */
function buildRepo(root: string, opts: { alphaHead?: string | null } = {}): Fixture {
  const primaryRoot = path.join(root, "primary");
  const worktrees = path.join(primaryRoot, ".claude", "worktrees");
  const alphaRoot = path.join(worktrees, ALPHA);
  const betaRoot = path.join(worktrees, BETA);

  fs.mkdirSync(path.join(primaryRoot, "packages", "drive", "src"), { recursive: true });
  fs.mkdirSync(path.join(alphaRoot, "packages"), { recursive: true });
  fs.mkdirSync(path.join(betaRoot, "packages"), { recursive: true });

  for (const [name, wt] of [
    [ALPHA, alphaRoot],
    [BETA, betaRoot],
  ] as const) {
    const gitDir = path.join(primaryRoot, ".git", "worktrees", name);
    fs.mkdirSync(gitDir, { recursive: true });
    const head =
      name === ALPHA
        ? opts.alphaHead === undefined
          ? `ref: refs/heads/${ALPHA_BRANCH}\n`
          : opts.alphaHead === null
            ? "9f8e7d6c5b4a39281706f5e4d3c2b1a098765432\n" // detached HEAD: a raw sha, no ref
            : `ref: refs/heads/${opts.alphaHead}\n`
        : `ref: refs/heads/claude/${BETA}\n`;
    fs.writeFileSync(path.join(gitDir, "HEAD"), head, "utf8");
    fs.writeFileSync(path.join(wt, ".git"), `gitdir: ${gitDir.replaceAll("\\", "/")}\n`, "utf8");
  }
  return { primaryRoot, alphaRoot, betaRoot };
}

function stampReceipt(
  fx: Fixture,
  over: { expiresInMs?: number; branch?: string; claims?: readonly LiveClaim[] } = {},
): void {
  const receipt = mintReceipt({
    sessionId: ALPHA,
    worktreeRoot: fx.alphaRoot,
    primaryRoot: fx.primaryRoot,
    branch: over.branch ?? ALPHA_BRANCH,
    claims: over.claims ?? [{ unitId: "drive-machinery", branch: over.branch ?? ALPHA_BRANCH }],
    now: new Date(),
    ...(over.expiresInMs !== undefined ? { ttlMs: over.expiresInMs } : {}),
  });
  const target = receiptPath(fx.primaryRoot, ALPHA);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(receipt), "utf8");
}

/** Run the real hook. `wall: true` switches it on; otherwise it stays at its shipped default. */
function runHook(input: unknown, opts: { wall?: boolean; raw?: string } = {}): {
  decision: "deny" | "pass";
  reason: string;
} {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env["STORYTREE_WRITE_AUTHORITY"];
  if (opts.wall === true) env["STORYTREE_WRITE_AUTHORITY"] = "on";

  const res = spawnSync(process.execPath, [HOOK], {
    input: opts.raw ?? JSON.stringify(input),
    encoding: "utf8",
    env,
  });
  assert.equal(res.status, 0, `hook must always exit 0; got ${res.status}. stderr: ${res.stderr}`);
  const out = (res.stdout ?? "").trim();
  if (out === "") return { decision: "pass", reason: "" };
  const parsed = JSON.parse(out) as {
    hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string };
  };
  return {
    decision: parsed.hookSpecificOutput?.permissionDecision === "deny" ? "deny" : "pass",
    reason: parsed.hookSpecificOutput?.permissionDecisionReason ?? "",
  };
}

function editCall(cwd: string, filePath: string, tool = "Edit"): unknown {
  return { hook_event_name: "PreToolUse", tool_name: tool, cwd, tool_input: { file_path: filePath } };
}

function withRepo(fn: (fx: Fixture) => void, opts: { alphaHead?: string | null } = {}): void {
  const raw = fs.mkdtempSync(path.join(os.tmpdir(), "storytree-wa-hook-"));
  try {
    fn(buildRepo(fs.realpathSync.native(raw), opts));
  } finally {
    fs.rmSync(raw, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// RED → GREEN: the conflicting write
// ---------------------------------------------------------------------------

test("RED — with the wall OFF, a session writing into a SIBLING's workspace is PERMITTED", () => {
  // Today's behaviour, and the incident ADR-0255/0257 were written for. Proving it here is what
  // makes the next test a real red→green rather than an assertion that already held.
  withRepo((fx) => {
    stampReceipt(fx);
    const got = runHook(editCall(fx.alphaRoot, path.join(fx.betaRoot, "packages", "stolen.ts")));
    assert.equal(got.decision, "pass");
  });
});

test("GREEN — the SAME conflicting write is REFUSED once the wall is switched on", () => {
  withRepo((fx) => {
    stampReceipt(fx);
    const got = runHook(editCall(fx.alphaRoot, path.join(fx.betaRoot, "packages", "stolen.ts")), {
      wall: true,
    });
    assert.equal(got.decision, "deny");
    assert.match(got.reason, /ANOTHER\s+session's workspace/);
    // The refusal must name the offending path, or an operator cannot act on it.
    assert.match(got.reason, /stolen\.ts/);
  });
});

// ---------------------------------------------------------------------------
// The shipped default — merging this must change nothing
// ---------------------------------------------------------------------------

test("the wall is OFF by default: a lobby write passes when the switch is unset", () => {
  // The increment lands disabled on purpose (owner call): 38 of 39 live worktrees hold no claim, so
  // an on-by-default merge would refuse writes fleet-wide. If this ever flips accidentally, this
  // test is the alarm.
  withRepo((fx) => {
    stampReceipt(fx);
    const got = runHook(editCall(fx.alphaRoot, path.join(fx.primaryRoot, "packages", "drive", "src", "x.ts")));
    assert.equal(got.decision, "pass");
  });
});

// ---------------------------------------------------------------------------
// Every arm fails closed (wall on)
// ---------------------------------------------------------------------------

test("a write into the PRIMARY CHECKOUT is refused and names the mint ceremony", () => {
  withRepo((fx) => {
    stampReceipt(fx);
    const got = runHook(
      editCall(fx.alphaRoot, path.join(fx.primaryRoot, "packages", "drive", "src", "x.ts")),
      { wall: true },
    );
    assert.equal(got.decision, "deny");
    assert.match(got.reason, /read-only agent lobby|PRIMARY CHECKOUT/);
  });
});

test("a write inside the session's OWN claimed worktree is allowed", () => {
  withRepo((fx) => {
    stampReceipt(fx);
    const got = runHook(editCall(fx.alphaRoot, path.join(fx.alphaRoot, "packages", "mine.ts")), {
      wall: true,
    });
    assert.equal(got.decision, "pass", `expected allow, got: ${got.reason}`);
  });
});

test("a RELATIVE target inside the own worktree is allowed (cwd resolves it, and only it)", () => {
  withRepo((fx) => {
    stampReceipt(fx);
    const got = runHook(editCall(fx.alphaRoot, path.join("packages", "mine.ts")), { wall: true });
    assert.equal(got.decision, "pass", `expected allow, got: ${got.reason}`);
  });
});

test("a relative `..` escape out of the worktree is refused — resolution, not text matching", () => {
  withRepo((fx) => {
    stampReceipt(fx);
    const got = runHook(editCall(fx.alphaRoot, path.join("..", "..", "..", "CLAUDE.md")), {
      wall: true,
    });
    assert.equal(got.decision, "deny");
  });
});

test("NO receipt refuses — an unclaimed worktree is a directory, not a workspace", () => {
  withRepo((fx) => {
    const got = runHook(editCall(fx.alphaRoot, path.join(fx.alphaRoot, "packages", "mine.ts")), {
      wall: true,
    });
    assert.equal(got.decision, "deny");
    assert.match(got.reason, /NO write-authority receipt/);
  });
});

test("an EXPIRED receipt refuses — authority is finite (ADR-0257 D5)", () => {
  withRepo((fx) => {
    stampReceipt(fx, { expiresInMs: -1000 });
    const got = runHook(editCall(fx.alphaRoot, path.join(fx.alphaRoot, "packages", "mine.ts")), {
      wall: true,
    });
    assert.equal(got.decision, "deny");
    assert.match(got.reason, /EXPIRED/);
  });
});

test("a FORGED/malformed receipt refuses rather than parsing into partial authority", () => {
  withRepo((fx) => {
    const target = receiptPath(fx.primaryRoot, ALPHA);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify({ sessionId: ALPHA, claims: [] }), "utf8");
    const got = runHook(editCall(fx.alphaRoot, path.join(fx.alphaRoot, "packages", "mine.ts")), {
      wall: true,
    });
    assert.equal(got.decision, "deny");
    assert.match(got.reason, /not usable|policyVersion/);
  });
});

test("a DETACHED HEAD refuses — no branch identity, no authority", () => {
  withRepo(
    (fx) => {
      stampReceipt(fx);
      const got = runHook(editCall(fx.alphaRoot, path.join(fx.alphaRoot, "packages", "mine.ts")), {
        wall: true,
      });
      assert.equal(got.decision, "deny");
      assert.match(got.reason, /DETACHED HEAD/);
    },
    { alphaHead: null },
  );
});

test("a worktree moved OFF its claimed branch refuses — the rewound-ref friction shape", () => {
  // HEAD says `main`; the receipt's claim says the session branch. Every git signal afterwards
  // reads as success, which is exactly why this has to be caught before the byte moves.
  withRepo(
    (fx) => {
      stampReceipt(fx);
      const got = runHook(editCall(fx.alphaRoot, path.join(fx.alphaRoot, "packages", "mine.ts")), {
        wall: true,
      });
      assert.equal(got.decision, "deny");
      assert.match(got.reason, /branch mismatch/i);
    },
    { alphaHead: "main" },
  );
});

test("a session running OUTSIDE any managed worktree refuses", () => {
  withRepo((fx) => {
    stampReceipt(fx);
    const got = runHook(editCall(fx.primaryRoot, path.join(fx.primaryRoot, "packages", "x.ts")), {
      wall: true,
    });
    assert.equal(got.decision, "deny");
    assert.match(got.reason, /not running inside a repository-minted worktree/);
  });
});

test("a gated tool call with NO extractable target refuses (ADR-0257 D3)", () => {
  withRepo((fx) => {
    stampReceipt(fx);
    const got = runHook(
      { hook_event_name: "PreToolUse", tool_name: "Edit", cwd: fx.alphaRoot, tool_input: {} },
      { wall: true },
    );
    assert.equal(got.decision, "deny");
    assert.match(got.reason, /no write target could be extracted/);
  });
});

test("unreadable hook input refuses rather than falling open", () => {
  withRepo((fx) => {
    stampReceipt(fx);
    const got = runHook(null, { wall: true, raw: "{not json" });
    assert.equal(got.decision, "deny");
    assert.match(got.reason, /could not read its own hook input/);
  });
});

test("NotebookEdit is gated too (it takes notebook_path, not file_path)", () => {
  withRepo((fx) => {
    stampReceipt(fx);
    const got = runHook(
      {
        hook_event_name: "PreToolUse",
        tool_name: "NotebookEdit",
        cwd: fx.alphaRoot,
        tool_input: { notebook_path: path.join(fx.betaRoot, "nb.ipynb") },
      },
      { wall: true },
    );
    assert.equal(got.decision, "deny");
  });
});

test("a NON-write tool is none of this boundary's business and passes untouched", () => {
  // Bash is deliberately NOT gated in this increment. Asserting it keeps the scope limit honest
  // rather than letting a reader assume shell writes are covered.
  withRepo((fx) => {
    stampReceipt(fx);
    for (const tool of ["Read", "Grep", "Bash"]) {
      const got = runHook(
        {
          hook_event_name: "PreToolUse",
          tool_name: tool,
          cwd: fx.alphaRoot,
          tool_input: { command: `rm -rf ${fx.primaryRoot}` },
        },
        { wall: true },
      );
      assert.equal(got.decision, "pass", `${tool} must not be gated by this increment`);
    }
  });
});
