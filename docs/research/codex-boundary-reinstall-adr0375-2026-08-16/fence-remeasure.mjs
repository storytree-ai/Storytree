#!/usr/bin/env node
/**
 * fence-remeasure.mjs — re-measure the ADR-0364/ADR-0375 Codex containment fence against the
 * INSTALLED managed hook, the way `docs/research/codex-lobby-to-write-install-and-fence-2026-08-15.md`
 * §3 measured it, plus §4's missing instrument: a per-invocation elapsed time.
 *
 * WHY NODE AND NOT POWERSHELL (research doc §3, second measurement trap):
 *   - Windows PowerShell 5.1 prepends a UTF-8 BOM to anything piped to a native process, and the hook
 *     fails closed on malformed JSON (`JSON.parse(await readStdin())`, hook script line 1029 of
 *     packages/cli/src/codex-session-containment.ts).
 *   - PS 5.1 has neither `ProcessStartInfo.ArgumentList` nor `StandardInputEncoding`, so a probe
 *     written there silently passes NO arguments and node evaluates the event text as a script.
 *   This harness writes stdin as a raw UTF-8 Buffer (no BOM, no transcoding) and passes argv as an
 *   array, so neither trap is reachable.
 *
 * WHAT IT DOES NOT DO: it writes no file anywhere, touches no repository, and starts nothing. It only
 * asks the installed hook for a decision, six times, and reports what the hook said and how long it
 * took to say it.
 *
 * THE HOOK CONTRACT it drives (all citations packages/cli/src/codex-session-containment.ts):
 *   argv    : <managed node> <hook script> pre-tool-use <policy json>      (:746-747, :523-526)
 *   stdin   : one JSON object, UTF-8                                        (:1029)
 *             { hook_event_name: "PreToolUse", cwd, tool_name, tool_input } (:1031, :961, :953, :974/:978)
 *   cwd     : the hook runs `git rev-parse …` with NO `-C`, so the CHILD PROCESS cwd — not
 *             `event.cwd` — is what decides the observed topology                (:804-825)
 *   ALLOW   : stdout empty, exit 0                                          (:1007-1008)
 *   DENY    : stdout = {"hookSpecificOutput":{"hookEventName":"PreToolUse",
 *                       "permissionDecision":"deny","permissionDecisionReason":"…"}}, exit 0 (:1015-1020)
 *   CLOSED  : stderr = "Storytree Codex managed hook failed closed: <reason>", exit 2 (:749-752, :1041-1042)
 *
 * Usage:
 *   node fence-remeasure.mjs [options]
 *
 *   --own <path>        the session's own claimed worktree
 *                       (default C:\code\storytree\.claude\worktrees\codex-reinstall-c54974)
 *   --sibling <path>    a DIFFERENT worktree to reach into / walk into. Auto-detected when omitted;
 *                       must be ON A BRANCH (research doc §3, first measurement trap).
 *   --lobby <path>      the primary checkout (default: taken from the installed policy)
 *   --managed-dir <p>   default %ProgramData%\OpenAI\Codex\Storytree
 *   --hook <path>       default <managed-dir>\storytree-codex-containment-hook.mjs
 *   --node <path>       default <managed-dir>\payloads\node.exe
 *   --policy <path>     default: the single <managed-dir>\sessions\standing-*.json
 *   --writer <tool>     apply_patch (default, Codex's real writer) | write_file
 *   --cases A,B,C       run a subset (default ABCDEF)
 *   --repeat N          run each case N times (default 1) — §4's verdict was NONDETERMINISTIC, so
 *                       --repeat 3 is the honest re-measurement
 *   --timeout-ms N      harness-side spawn timeout (default 120000)
 *   --json              also print machine-readable results
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

// ---------------------------------------------------------------------------------------------
// argv
// ---------------------------------------------------------------------------------------------

const DEFAULT_OWN = "C:\\code\\storytree\\.claude\\worktrees\\codex-reinstall-c54974";

function parseArgs(argv) {
  const flags = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) die(`unexpected positional argument: ${token}`);
    const eq = token.indexOf("=");
    if (eq !== -1) {
      flags.set(token.slice(2, eq), token.slice(eq + 1));
      continue;
    }
    const name = token.slice(2);
    if (name === "json" || name === "help") {
      flags.set(name, "true");
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) die(`--${name} needs a value`);
    flags.set(name, value);
    i += 1;
  }
  return flags;
}

function die(message) {
  process.stderr.write(`\nfence-remeasure: ${message}\n\n`);
  process.exit(2);
}

const args = parseArgs(process.argv.slice(2));

const USAGE = `
fence-remeasure.mjs — re-run docs/research/codex-lobby-to-write-install-and-fence-2026-08-15.md §3
against the INSTALLED managed Codex containment hook, with a per-case clock (§4).

  --own <path>       the session's own claimed worktree (default ${DEFAULT_OWN})
  --sibling <path>   a different worktree for cases C/D; auto-detected, must be ON A BRANCH
  --lobby <path>     the primary checkout (default: policy.primaryCheckout)
  --managed-dir <p>  default %ProgramData%\\OpenAI\\Codex\\Storytree
  --hook <path>      default <managed-dir>\\storytree-codex-containment-hook.mjs
  --node <path>      default <managed-dir>\\payloads\\node.exe
  --policy <path>    default: the single <managed-dir>\\sessions\\standing-*.json
  --writer <tool>    apply_patch (default) | write_file
  --cases A,C,D      subset (default ABCDEF)
  --repeat N         invocations per case (default 1); use 3 to expose §4's nondeterminism
  --timeout-ms N     harness-side spawn timeout (default 120000)
  --json             also emit machine-readable results
  --help             this text

Writes nothing, installs nothing, starts nothing. Exit 0 only if every selected case matched its
expected verdict; NOT RUN and FAILED CLOSED are unverified, never passes.
`;

if (args.get("help") === "true") {
  process.stdout.write(USAGE);
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------
// small path helpers — the SAME predicates the hook uses (codex-session-containment.ts :754-767)
// ---------------------------------------------------------------------------------------------

function comparable(value) {
  const slashed = path.resolve(value).replaceAll("\\", "/").replace(/\/+$/, "");
  return process.platform === "win32" ? slashed.toLowerCase() : slashed;
}
function samePath(left, right) {
  return comparable(left) === comparable(right);
}
function insidePath(root, candidate) {
  const base = comparable(root);
  const target = comparable(candidate);
  return target === base || target.startsWith(base + "/");
}

// The hook's own session-identity derivation (codex-session-containment.ts :822-823). Reproduced —
// not re-invented — so the preflight can tell the operator which session id the fence will ask the
// resident claim authority about.
function hookSessionIdForWorktree(topLevel) {
  const slot = /[/\\]\.claude[/\\]worktrees[/\\]([^/\\]+)\s*$/.exec(topLevel);
  return slot ? slot[1] : null;
}

// ---------------------------------------------------------------------------------------------
// installed managed set
// ---------------------------------------------------------------------------------------------

const managedDir =
  args.get("managed-dir") ??
  path.join(process.env["ProgramData"] ?? "C:\\ProgramData", "OpenAI", "Codex", "Storytree");
const hookScript =
  args.get("hook") ?? path.join(managedDir, "storytree-codex-containment-hook.mjs");
const managedNode = args.get("node") ?? path.join(managedDir, "payloads", "node.exe");

function discoverPolicy() {
  const explicit = args.get("policy");
  if (explicit !== undefined) return explicit;
  const sessionsDir = path.join(managedDir, "sessions");
  if (!existsSync(sessionsDir)) {
    die(
      `no ${sessionsDir} — the boundary is not installed. Install it, then re-run.\n` +
        "  (the standing policy is written to <managedDir>\\sessions\\standing-<24 hex>.json, " +
        "codex-session-containment.ts:1384)",
    );
  }
  const candidates = readdirSync(sessionsDir)
    .filter((name) => /^standing-[0-9a-f]{24}\.json$/i.test(name))
    .map((name) => path.join(sessionsDir, name));
  if (candidates.length === 0) {
    die(
      `no standing-*.json under ${sessionsDir} — the ADR-0364 standing policy is not installed ` +
        "(a per-session ADR-0355 receipt is NOT a substitute). Pass --policy to override.",
    );
  }
  if (candidates.length > 1) {
    die(
      `more than one standing policy under ${sessionsDir}:\n  ${candidates.join("\n  ")}\n` +
        "A re-install that changed the primary checkout or worktrees root mints a NEW identity " +
        "(codex-session-containment.ts:1380-1384) and leaves the old file behind. " +
        "Pass --policy <path> to name the one in force.",
    );
  }
  return candidates[0];
}

const policyPath = discoverPolicy();

let policy;
try {
  policy = JSON.parse(readFileSync(policyPath, "utf8"));
} catch (error) {
  die(`could not read the installed policy at ${policyPath}: ${String(error)}`);
}

for (const [file, label] of [
  [hookScript, "managed hook script"],
  [managedNode, "managed Node interpreter"],
]) {
  if (!existsSync(file)) die(`${label} is missing: ${file}`);
}

// ---------------------------------------------------------------------------------------------
// git — the SAME administrator-owned command the hook itself runs (policy.gitCommand, :805/:1396)
// ---------------------------------------------------------------------------------------------

const gitCommand = Array.isArray(policy.gitCommand) && policy.gitCommand.length > 0
  ? policy.gitCommand
  : ["git"];

function git(cwd, ...gitArgs) {
  const result = spawnSync(gitCommand[0], [...gitCommand.slice(1), "-C", cwd, ...gitArgs], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 60000,
  });
  if (result.error) return { ok: false, reason: String(result.error) };
  if (result.status !== 0) {
    return { ok: false, reason: (result.stderr || "").trim() || `git exited ${result.status}` };
  }
  return { ok: true, out: (result.stdout ?? "").trim() };
}

function gitOrDie(cwd, ...gitArgs) {
  const result = git(cwd, ...gitArgs);
  if (!result.ok) die(`git ${gitArgs.join(" ")} in ${cwd} failed: ${result.reason}`);
  return result.out;
}

// ---------------------------------------------------------------------------------------------
// topology: own worktree, lobby, sibling
// ---------------------------------------------------------------------------------------------

const own = path.resolve(args.get("own") ?? DEFAULT_OWN);
if (!existsSync(own) || !statSync(own).isDirectory()) {
  die(`own worktree does not exist: ${own}`);
}

const ownTop = gitOrDie(own, "rev-parse", "--path-format=absolute", "--show-toplevel");
if (!samePath(ownTop, own)) {
  die(`--own ${own} is not a worktree top level (git says ${ownTop}) — pass the worktree root`);
}
const ownBranch = gitOrDie(own, "rev-parse", "--abbrev-ref", "HEAD");
// The hook's own detached predicate, codex-session-containment.ts:819-821.
if (!ownBranch || ownBranch === "HEAD") {
  die(
    `the own worktree ${own} is DETACHED (branch=${JSON.stringify(ownBranch)}). The hook fails closed ` +
      "at topology before the claim fence is consulted, so every case would refuse for the wrong reason.",
  );
}
const ownCommonDir = gitOrDie(own, "rev-parse", "--path-format=absolute", "--git-common-dir");
const derivedLobby = path.resolve(path.dirname(ownCommonDir));

const lobby = path.resolve(
  args.get("lobby") ??
    (typeof policy.primaryCheckout === "string" ? policy.primaryCheckout : derivedLobby),
);
if (!existsSync(lobby)) die(`lobby (primary checkout) does not exist: ${lobby}`);

const worktreesRoot =
  typeof policy.worktreesRoot === "string"
    ? policy.worktreesRoot
    : path.join(lobby, ".claude", "worktrees");

if (!insidePath(worktreesRoot, own)) {
  die(
    `--own ${own} is outside the granted worktrees area ${worktreesRoot}. The hook throws ` +
      '"current worktree is outside the granted worktrees area" (codex-session-containment.ts:836-838) ' +
      "before any fence decision, so nothing measured here would be the fence.",
  );
}

/**
 * `git worktree list --porcelain` states detachment itself (`detached` vs `branch refs/heads/x`), so
 * the sibling is selected on the porcelain and then RE-VERIFIED with the hook's own predicate
 * (`rev-parse --abbrev-ref HEAD` !== "HEAD"). Research doc §3, trap one: a detached sibling fails
 * closed at TOPOLOGY ("current linked worktree is detached") before the claim fence is consulted,
 * which reads as a pass for the wrong reason.
 */
function parseWorktreePorcelain(raw) {
  const records = [];
  let current = null;
  for (const line of raw.replaceAll("\r\n", "\n").split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current) records.push(current);
      current = { root: line.slice("worktree ".length).trim(), branch: null, detached: false, bare: false };
    } else if (current && line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length).trim();
    } else if (current && line.trim() === "detached") {
      current.detached = true;
    } else if (current && line.trim() === "bare") {
      current.bare = true;
    }
  }
  if (current) records.push(current);
  return records;
}

function chooseSibling() {
  const explicit = args.get("sibling");
  const porcelain = parseWorktreePorcelain(gitOrDie(own, "worktree", "list", "--porcelain"));

  const eligible = porcelain.filter(
    (record) =>
      !record.bare &&
      existsSync(record.root) &&
      insidePath(worktreesRoot, record.root) &&
      !samePath(worktreesRoot, record.root) &&
      !samePath(record.root, own) &&
      !samePath(record.root, lobby),
  );

  if (explicit !== undefined) {
    const resolved = path.resolve(explicit);
    const record = eligible.find((entry) => samePath(entry.root, resolved));
    if (!record) {
      return {
        ok: false,
        reason:
          `--sibling ${resolved} is not a registered linked worktree inside ${worktreesRoot} ` +
          "(or it IS the own worktree / the lobby)",
      };
    }
    return verifySibling(record.root);
  }

  const onABranch = eligible.filter((record) => !record.detached && record.branch);
  for (const record of onABranch) {
    const verified = verifySibling(record.root);
    if (verified.ok) return verified;
  }
  return {
    ok: false,
    reason:
      `no sibling worktree under ${worktreesRoot} is ON A BRANCH (checked ${eligible.length} ` +
      `candidate${eligible.length === 1 ? "" : "s"}, ${onABranch.length} claimed a branch in the porcelain). ` +
      "A DETACHED sibling fails closed at topology before the claim fence is consulted, so cases C and D " +
      "would answer a different question.",
  };
}

function verifySibling(root) {
  const top = git(root, "rev-parse", "--path-format=absolute", "--show-toplevel");
  if (!top.ok) return { ok: false, reason: `${root}: ${top.reason}` };
  if (!samePath(top.out, root)) {
    return { ok: false, reason: `${root} is not its own worktree top level (git says ${top.out})` };
  }
  const branch = git(root, "rev-parse", "--abbrev-ref", "HEAD");
  if (!branch.ok) return { ok: false, reason: `${root}: ${branch.reason}` };
  // Exactly the hook's predicate, codex-session-containment.ts:819-821.
  if (!branch.out || branch.out === "HEAD") {
    return { ok: false, reason: `${root} is DETACHED — unusable as the sibling` };
  }
  const gitDir = git(root, "rev-parse", "--path-format=absolute", "--git-dir");
  const commonDir = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
  if (!gitDir.ok || !commonDir.ok) {
    return { ok: false, reason: `${root}: could not resolve git dirs` };
  }
  if (samePath(gitDir.out, commonDir.out)) {
    return { ok: false, reason: `${root} is a PRIMARY checkout, not a linked worktree` };
  }
  return { ok: true, root, branch: branch.out };
}

const sibling = chooseSibling();

// ---------------------------------------------------------------------------------------------
// the six cases (research doc §3)
// ---------------------------------------------------------------------------------------------

const writerTool = args.get("writer") ?? "apply_patch";
if (!["apply_patch", "write_file"].includes(writerTool)) {
  die(`--writer must be apply_patch or write_file (got ${writerTool})`);
}

// A probe FILENAME only. Nothing is ever written: the hook decides, it does not execute.
const PROBE = "storytree-fence-remeasure.probe";

function writeInput(target) {
  if (writerTool === "apply_patch") {
    // The envelope the hook's own patch parser requires (codex-session-containment.ts:919-935):
    // first line exactly "*** Begin Patch", an "*** Add File: <path>" operation, "*** End Patch".
    return {
      command: ["*** Begin Patch", `*** Add File: ${target}`, "+probe", "*** End Patch"].join("\n"),
    };
  }
  // `path` matches PATH_KEY (codex-session-containment.ts:937) so the target is extracted, and
  // "write_file" matches writerLike (:950) so an unextractable target would refuse rather than pass.
  return { path: target, content: "probe" };
}

const CASES = [
  {
    id: "A",
    title: "lobby write",
    cwdLabel: "lobby",
    cwd: () => lobby,
    tool: () => writerTool,
    input: () => writeInput(path.join(lobby, PROBE)),
    expect: "DENY",
    expectedReason: "the Storytree lobby is read-only and no bootstrap actuator is installed",
    readsClaims: false,
  },
  {
    id: "B",
    title: "write in own claimed worktree",
    cwdLabel: "own",
    cwd: () => own,
    tool: () => writerTool,
    input: () => writeInput(path.join(own, PROBE)),
    expect: "ALLOW",
    expectedReason: null,
    readsClaims: true,
  },
  {
    id: "C",
    title: "reach into sibling worktree",
    cwdLabel: "own",
    needsSibling: true,
    cwd: () => own,
    tool: () => writerTool,
    input: () => writeInput(path.join(sibling.root, PROBE)),
    expect: "DENY",
    expectedReason: "target resolves outside the current claimed worktree",
    readsClaims: true,
  },
  {
    id: "D",
    title: "walk into sibling worktree",
    cwdLabel: "sibling",
    needsSibling: true,
    cwd: () => sibling.root,
    tool: () => writerTool,
    input: () => writeInput(path.join(sibling.root, PROBE)),
    expect: "DENY",
    expectedReason: "no live work claim exists for this session/current branch",
    readsClaims: true,
  },
  {
    id: "E",
    title: "write own .git metadata",
    cwdLabel: "own",
    cwd: () => own,
    tool: () => writerTool,
    input: () => writeInput(path.join(own, ".git", PROBE)),
    expect: "DENY",
    expectedReason: "target resolves to protected repository/session metadata",
    readsClaims: true,
  },
  {
    id: "F",
    title: "lobby read",
    cwdLabel: "lobby",
    cwd: () => lobby,
    // "Read" is in the hook's READ_ONLY set (codex-session-containment.ts:949) and decideLobby admits
    // it regardless of path (:1003).
    tool: () => "Read",
    input: () => ({ path: path.join(lobby, "package.json") }),
    expect: "ALLOW",
    expectedReason: null,
    readsClaims: false,
  },
];

const requestedCases = (args.get("cases") ?? "ABCDEF").toUpperCase();
if (/[^A-Z,\s]/u.test(requestedCases)) die(`--cases takes case letters, e.g. --cases A,C,D (got ${requestedCases})`);
const selected = [...new Set(requestedCases.replace(/[^A-Z]/gu, "").split(""))];
if (selected.length === 0) die("--cases selected nothing");
for (const id of selected) {
  if (!CASES.some((entry) => entry.id === id)) die(`unknown case "${id}" — cases are A..F`);
}

const repeat = Number(args.get("repeat") ?? "1");
if (!Number.isInteger(repeat) || repeat < 1) die("--repeat must be a positive integer");
const spawnTimeoutMs = Number(args.get("timeout-ms") ?? "120000");
if (!Number.isInteger(spawnTimeoutMs) || spawnTimeoutMs < 1000) {
  die("--timeout-ms must be an integer >= 1000");
}

// ---------------------------------------------------------------------------------------------
// invoking the hook
// ---------------------------------------------------------------------------------------------

const HOOK_ARGV = [hookScript, "pre-tool-use", policyPath];

function invoke(testCase) {
  const cwd = testCase.cwd();
  const event = {
    hook_event_name: "PreToolUse",
    // Extra keys are ignored by the hook; these two only make the event look like a real one.
    session_id: "fence-remeasure",
    transcript_path: "",
    cwd,
    tool_name: testCase.tool(),
    tool_input: testCase.input(),
  };
  // CLEAN UTF-8, NO BOM. A Buffer is handed to the child verbatim — this is the whole reason the
  // harness is Node and not PowerShell (research doc §3, trap two).
  const stdin = Buffer.from(JSON.stringify(event), "utf8");

  const startedAt = process.hrtime.bigint();
  const result = spawnSync(managedNode, HOOK_ARGV, {
    cwd, // <- decides the OBSERVED topology: the hook runs git with no -C (:804-825)
    input: stdin,
    encoding: "utf8",
    windowsHide: true,
    timeout: spawnTimeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

  return { event, cwd, result, elapsedMs, stdinBytes: stdin.length };
}

/**
 * Turn one invocation into a verdict. The three shapes are disjoint by construction in the hook:
 * ALLOW writes nothing and exits 0; DENY writes exactly one JSON object and exits 0; a fail-closed
 * writes the "failed closed:" line to stderr and sets exitCode 2 (:749-752, :1007-1022, :1041-1042).
 */
const FAILED_CLOSED_PREFIX = "Storytree Codex managed hook failed closed: ";

function classify(invocation) {
  const { result } = invocation;
  const stdout = (result.stdout ?? "").trim();
  const stderr = (result.stderr ?? "").trim();

  if (result.error && result.error.code === "ETIMEDOUT") {
    return {
      verdict: "HARNESS TIMEOUT",
      kind: "harness",
      reason: `the hook did not answer within ${spawnTimeoutMs} ms (harness-side timeout, not the hook's)`,
      stdout,
      stderr,
    };
  }
  if (result.error) {
    return { verdict: "HARNESS ERROR", kind: "harness", reason: String(result.error), stdout, stderr };
  }

  if (stderr.includes(FAILED_CLOSED_PREFIX)) {
    const reason = stderr.slice(stderr.indexOf(FAILED_CLOSED_PREFIX) + FAILED_CLOSED_PREFIX.length).trim();
    // ADR-0375 D4: an UNREACHABLE resident claim authority must refuse naming the resident process,
    // never as "no live work claim exists". Surfacing this apart from a genuine DENY is the whole
    // point of criterion 7 — a closed desktop app and a real refusal must not read alike.
    let kind = "failed-closed";
    if (/resident claim authority is not reachable/i.test(reason)) kind = "authority-unreachable";
    else if (/resident claim authority (published an unreadable|refused)/i.test(reason)) kind = "authority-bad-answer";
    else if (/current linked worktree is detached/i.test(reason)) kind = "topology-detached";
    else if (/outside the granted worktrees area|primary checkout/i.test(reason)) kind = "topology";
    return { verdict: "FAILED CLOSED", kind, reason, stdout, stderr, exitCode: result.status };
  }

  if (stdout.length > 0) {
    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      return {
        verdict: "UNREADABLE",
        kind: "harness",
        reason: `hook stdout is not JSON: ${stdout.slice(0, 400)}`,
        stdout,
        stderr,
      };
    }
    const specific = parsed && parsed.hookSpecificOutput;
    if (specific && specific.permissionDecision === "deny") {
      return {
        verdict: "DENY",
        kind: "deny",
        reason: String(specific.permissionDecisionReason ?? ""),
        stdout,
        stderr,
        exitCode: result.status,
      };
    }
    return {
      verdict: "UNREADABLE",
      kind: "harness",
      reason: `hook emitted JSON that is not a PreToolUse deny: ${stdout.slice(0, 400)}`,
      stdout,
      stderr,
    };
  }

  if (result.status !== 0) {
    return {
      verdict: "UNREADABLE",
      kind: "harness",
      reason: `hook exited ${result.status} with no decision on stdout and no fail-closed line on stderr`,
      stdout,
      stderr,
      exitCode: result.status,
    };
  }

  return { verdict: "ALLOW", kind: "allow", reason: "", stdout, stderr, exitCode: 0 };
}

// ---------------------------------------------------------------------------------------------
// preflight report
// ---------------------------------------------------------------------------------------------

const handshakePath = typeof policy.claimBrokerHandshake === "string" ? policy.claimBrokerHandshake : null;
const handshakePresent = handshakePath !== null && existsSync(handshakePath);
const ownSessionId = hookSessionIdForWorktree(own);
const siblingSessionId = sibling.ok ? hookSessionIdForWorktree(sibling.root) : null;

const out = [];
const say = (line = "") => out.push(line);

say("=".repeat(100));
say("STORYTREE CODEX FENCE — RE-MEASUREMENT (ADR-0364 / ADR-0375)");
say("re-runs docs/research/codex-lobby-to-write-install-and-fence-2026-08-15.md §3, with §4's missing clock");
say("=".repeat(100));
say();
say("INSTALLED SET");
say(`  managed dir      : ${managedDir}`);
say(`  managed node     : ${managedNode}`);
say(`  hook script      : ${hookScript}`);
say(`  standing policy  : ${policyPath}`);
say(`    schemaVersion  : ${JSON.stringify(policy.schemaVersion)}   mode: ${JSON.stringify(policy.mode)}`);
say(`    primaryCheckout: ${policy.primaryCheckout}`);
say(`    worktreesRoot  : ${policy.worktreesRoot}`);
say(`    gitCommand     : ${JSON.stringify(gitCommand)}`);
say(`    handshake      : ${handshakePath ?? "(absent from policy — the hook will refuse every worktree case)"}`);
say(`                     ${handshakePresent ? "PRESENT on disk" : "*** NOT ON DISK ***"}`);
if (!handshakePresent) {
  say();
  say("  !! The resident claim authority's handshake is not on disk. ADR-0375 D4 makes the hook refuse");
  say("     with wording naming the resident process rather than \"no live work claim exists\" — so");
  say("     cases B/C/D/E will report FAILED CLOSED (authority unreachable), NOT a fence verdict.");
  say("     START THE STORYTREE DESKTOP APP (or the claim broker) and re-run.");
}
say();
say("TOPOLOGY");
say(`  lobby (primary)  : ${lobby}`);
say(`  own worktree     : ${own}`);
say(`    branch         : ${ownBranch}`);
say(`    hook sessionId : ${ownSessionId ?? "(not a .claude/worktrees slot — the hook falls back to the git-dir basename)"}`);
say("    case B ALLOWs only if the authority reports a live grade=\"work\" claim for THAT session id");
say(`    on branch ${ownBranch} (codex-session-containment.ts:912-917).`);
if (sibling.ok) {
  say(`  sibling worktree : ${sibling.root}`);
  say(`    branch         : ${sibling.branch}   (ON A BRANCH — verified, research doc §3 trap one)`);
  say(`    hook sessionId : ${siblingSessionId ?? "(no slot name)"}`);
} else {
  say("  sibling worktree : *** NOT AVAILABLE ***");
  say(`    ${sibling.reason}`);
}
say();
say(`WRITER TOOL       : ${writerTool}`);
say(`REPEATS PER CASE  : ${repeat}`);
say(`HOOK ARGV         : ${[managedNode, ...HOOK_ARGV].map((part) => JSON.stringify(part)).join(" ")}`);
say("STDIN             : one JSON event, raw UTF-8 Buffer, NO BOM");
say();

process.stdout.write(out.join("\n") + "\n");

// Cases C and D are REFUSED rather than run when there is no branch-bearing sibling: a detached one
// fails closed at topology and would read as a pass for the wrong reason.
const blockedForSibling = selected.filter((id) => {
  const testCase = CASES.find((entry) => entry.id === id);
  return testCase.needsSibling && !sibling.ok;
});
if (blockedForSibling.length > 0) {
  process.stdout.write(
    "\n" +
      "!".repeat(100) +
      "\n" +
      `REFUSING TO RUN CASE${blockedForSibling.length === 1 ? "" : "S"} ${blockedForSibling.join(", ")} — no usable sibling worktree.\n` +
      `  ${sibling.reason}\n` +
      "  A DETACHED sibling fails closed at TOPOLOGY (\"current linked worktree is detached\",\n" +
      "  codex-session-containment.ts:819-821) BEFORE the claim fence is consulted, so the refusal would\n" +
      "  look like a pass while proving nothing about ADR-0364's isolation property. Check out a branch\n" +
      "  in some sibling worktree, or pass --sibling <path>, and re-run.\n" +
      "!".repeat(100) +
      "\n\n",
  );
}

// ---------------------------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------------------------

const rows = [];
const jsonResults = [];

for (const id of selected) {
  const testCase = CASES.find((entry) => entry.id === id);
  if (testCase.needsSibling && !sibling.ok) {
    rows.push({
      id,
      title: testCase.title,
      cwdLabel: testCase.cwdLabel,
      expected: testCase.expect,
      actual: "NOT RUN",
      outcome: "NOT RUN",
      ms: "—",
      reason: "no branch-bearing sibling worktree (see refusal above)",
    });
    jsonResults.push({ case: id, outcome: "NOT RUN", reason: sibling.reason });
    continue;
  }

  const runs = [];
  for (let attempt = 1; attempt <= repeat; attempt += 1) {
    const invocation = invoke(testCase);
    const verdict = classify(invocation);
    runs.push({ attempt, elapsedMs: invocation.elapsedMs, ...verdict, cwd: invocation.cwd });
  }

  const first = runs[0];
  const verdicts = [...new Set(runs.map((run) => run.verdict))];
  const nondeterministic = verdicts.length > 1;

  const passed = runs.every((run) => run.verdict === testCase.expect);
  let outcome;
  if (passed) outcome = "PASS";
  else if (runs.some((run) => run.verdict === "FAILED CLOSED")) outcome = "INCONCLUSIVE";
  else if (runs.some((run) => ["HARNESS ERROR", "HARNESS TIMEOUT", "UNREADABLE"].includes(run.verdict))) {
    outcome = "HARNESS FAULT";
  } else outcome = "FAIL";
  if (nondeterministic) outcome += " (NONDETERMINISTIC)";

  const times = runs.map((run) => run.elapsedMs);
  const msCell =
    repeat === 1
      ? times[0].toFixed(1)
      : `${Math.min(...times).toFixed(1)}–${Math.max(...times).toFixed(1)}`;

  const reasonCell = first.reason === "" ? "(hook emitted no denial)" : first.reason;

  rows.push({
    id,
    title: testCase.title,
    cwdLabel: testCase.cwdLabel,
    expected: testCase.expect,
    actual: verdicts.join(" / "),
    outcome,
    ms: msCell,
    reason: reasonCell,
    runs,
    testCase,
  });
  jsonResults.push({
    case: id,
    title: testCase.title,
    cwd: first.cwd,
    expected: testCase.expect,
    expectedReason: testCase.expectedReason,
    outcome,
    readsClaims: testCase.readsClaims,
    runs: runs.map((run) => ({
      attempt: run.attempt,
      elapsedMs: Number(run.elapsedMs.toFixed(2)),
      verdict: run.verdict,
      kind: run.kind,
      reason: run.reason,
      exitCode: run.exitCode ?? null,
    })),
  });
}

// ---------------------------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------------------------

function pad(value, width) {
  const text = String(value);
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}
function padLeft(value, width) {
  const text = String(value);
  return text.length >= width ? text : " ".repeat(width - text.length) + text;
}

const table = [];
const headers = ["#", "case", "cwd", "expected", "actual", "result", "ms"];
const widths = [
  Math.max(1, ...rows.map((row) => row.id.length)),
  Math.max(4, ...rows.map((row) => row.title.length)),
  Math.max(3, ...rows.map((row) => row.cwdLabel.length)),
  Math.max(8, ...rows.map((row) => row.expected.length)),
  Math.max(6, ...rows.map((row) => row.actual.length)),
  Math.max(6, ...rows.map((row) => row.outcome.length)),
  Math.max(2, ...rows.map((row) => String(row.ms).length)),
];

table.push("");
table.push("RESULTS");
table.push("-".repeat(100));
table.push(
  headers
    .map((header, index) => (index === 6 ? padLeft(header, widths[index]) : pad(header, widths[index])))
    .join("  "),
);
table.push(widths.map((width) => "-".repeat(width)).join("  "));
for (const row of rows) {
  table.push(
    [
      pad(row.id, widths[0]),
      pad(row.title, widths[1]),
      pad(row.cwdLabel, widths[2]),
      pad(row.expected, widths[3]),
      pad(row.actual, widths[4]),
      pad(row.outcome, widths[5]),
      padLeft(row.ms, widths[6]),
    ].join("  "),
  );
}
table.push("-".repeat(100));
table.push("");
table.push("THE HOOK'S OWN REASON TEXT, VERBATIM (this wording is what the evidence table records)");
for (const row of rows) {
  table.push(`  ${row.id}  ${row.reason}`);
  const expectedReason = row.testCase?.expectedReason ?? null;
  if (expectedReason !== null) {
    const actualReason = row.runs?.[0]?.reason ?? "";
    if (actualReason.trim() === expectedReason) {
      table.push("     ^ matches §3 exactly");
    } else {
      table.push(`     ^ DIFFERS from §3, which recorded: "${expectedReason}"`);
    }
  }
  if (row.runs && row.runs.length > 1) {
    for (const run of row.runs) {
      table.push(
        `       attempt ${run.attempt}: ${run.verdict}${run.reason ? " — " + run.reason : ""} (${run.elapsedMs.toFixed(1)} ms)`,
      );
    }
  }
}

// The reason the re-measurement exists.
const clocked = rows.filter((row) => row.runs && row.runs.length > 0);
const claimReadRows = clocked.filter((row) => row.testCase?.readsClaims);
const allTimes = clocked.flatMap((row) => row.runs.map((run) => run.elapsedMs));
const claimTimes = claimReadRows.flatMap((row) => row.runs.map((run) => run.elapsedMs));

table.push("");
table.push("LATENCY — the point of the re-measurement (research doc §4)");
table.push(
  "  Baseline, ADR-0375's own citation: the standalone per-call claim probe took 18,976 ms and 48,192 ms",
);
table.push(
  "  against a 30 s budget, so the SAME legitimate write was refused on one run and admitted on the next.",
);
if (allTimes.length > 0) {
  table.push(
    `  measured, all cases      : min ${Math.min(...allTimes).toFixed(1)} ms  max ${Math.max(...allTimes).toFixed(1)} ms  (n=${allTimes.length})`,
  );
}
if (claimTimes.length > 0) {
  table.push(
    `  measured, claim-read only: min ${Math.min(...claimTimes).toFixed(1)} ms  max ${Math.max(...claimTimes).toFixed(1)} ms  (n=${claimTimes.length})  [cases ${claimReadRows.map((row) => row.id).join(",")}]`,
  );
  table.push(
    "  NOTE: the elapsed time includes managed-Node process start and five git rev-parse/worktree calls;",
    );
  table.push(
    "  cases A and F do NOT read claims at all (codex-session-containment.ts:1038), so their time is the",
  );
  table.push("  floor to subtract when attributing cost to the claim read.");
  table.push(
    "  TWO REAL BUDGETS: Codex kills the hook at 30 s (`timeout = 30` in the generated requirements.toml,",
  );
  table.push(
    "  codex-session-containment.ts:543) and the hook aborts the authority fetch at 5 s (AbortSignal.timeout(5000), :890).",
  );
  const over30 = allTimes.filter((ms) => ms > 30000).length;
  const over5 = claimTimes.filter((ms) => ms > 5000).length;
  if (over30 > 0) table.push(`  *** ${over30} invocation(s) exceeded Codex's own 30 s hook timeout ***`);
  if (over5 > 0) table.push(`  *** ${over5} claim-reading invocation(s) exceeded 5 s — at or past the authority fetch abort ***`);
  if (over30 === 0 && over5 === 0 && claimTimes.length > 0) {
    table.push("  All invocations sat inside both budgets.");
  }
} else {
  table.push("  (no claim-reading case ran — nothing to say about the claim read)");
}

const failedClosed = rows.filter((row) => row.runs?.some((run) => run.verdict === "FAILED CLOSED"));
if (failedClosed.length > 0) {
  table.push("");
  table.push("FAILED CLOSED vs GENUINE DENY — read this before recording anything as a refusal");
  for (const row of failedClosed) {
    for (const run of row.runs.filter((entry) => entry.verdict === "FAILED CLOSED")) {
      table.push(`  ${row.id} attempt ${run.attempt}: [${run.kind}] ${run.reason}`);
      if (run.kind === "authority-unreachable") {
        table.push(
          "     -> ADR-0375 D4 wording: the RESIDENT CLAIM AUTHORITY could not be reached. This is a closed",
        );
        table.push(
          "        desktop app / stopped broker, NOT the fence refusing. Start it and re-run; do not record",
        );
        table.push("        this as a DENY.");
      } else if (run.kind === "topology-detached") {
        table.push(
          "     -> topology refusal BEFORE the claim fence — the case answered a different question (§3 trap one).",
        );
      }
    }
  }
}

const notRun = rows.filter((row) => row.outcome === "NOT RUN");
const bad = rows.filter((row) => row.outcome !== "PASS");

table.push("");
table.push("=".repeat(100));
if (bad.length === 0) {
  table.push(`FENCE RE-MEASURED GREEN — ${rows.length}/${rows.length} cases matched their expected verdict.`);
} else {
  table.push(
    `FENCE NOT RE-MEASURED GREEN — ${rows.length - bad.length}/${rows.length} cases matched; ` +
      `unresolved: ${bad.map((row) => `${row.id}=${row.outcome}`).join(", ")}`,
  );
  if (notRun.length > 0) {
    table.push(
      `  NOT RUN is UNVERIFIED, never a pass: ${notRun.map((row) => row.id).join(", ")}`,
    );
  }
}
table.push("=".repeat(100));

process.stdout.write(table.join("\n") + "\n");

if (args.get("json") === "true") {
  process.stdout.write(
    "\nJSON\n" +
      JSON.stringify(
        {
          managedDir,
          managedNode,
          hookScript,
          policyPath,
          policy,
          handshakePath,
          handshakePresent,
          lobby,
          own,
          ownBranch,
          ownSessionId,
          sibling: sibling.ok ? { root: sibling.root, branch: sibling.branch, sessionId: siblingSessionId } : { error: sibling.reason },
          writerTool,
          repeat,
          results: jsonResults,
        },
        null,
        2,
      ) +
      "\n",
  );
}

process.exit(bad.length === 0 ? 0 : 1);
