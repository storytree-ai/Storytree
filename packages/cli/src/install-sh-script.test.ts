import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

/**
 * Structural + executable floor for the Linux bootstrap installer (ADR-0207 D1), `infra/install.sh`
 * — the POSIX-sh parity sibling of `infra/install.ps1`.
 *
 * WHY THIS FILE EXISTS AT ALL. `install.sh` was authored on a Windows box and its install actions
 * (apt-get, NodeSource, GitHub's apt repo, `gh auth login`, `git clone`, `pnpm install`, the Claude
 * CLI installer) CANNOT be executed by CI without mutating the runner — so the script's true proof
 * is a real run on a fresh Linux machine. What IS machine-checkable is its shape, plus the handful
 * of side-effect-free paths that need no external command at all. Both are asserted here:
 *
 *   STRUCTURAL — read the script as text and hold it to its three load-bearing invariants:
 *     1. every step is IDEMPOTENT (the runner's satisfied-check early return precedes the install
 *        action), ADR-0207 D1 / D6 — re-run is both the retry and the repair story;
 *     2. `--step <name>` targeted repair dispatches from ONE step inventory, skips a non-matching
 *        step whole, fails loudly on an unknown name, and stops before the trailing actions;
 *     3. the D3 trust boundary — the script may DETECT a logged-in Claude CLI but never read the
 *        credential's contents.
 *
 *   EXECUTABLE — actually run the script's hermetic paths (`--help`, an unknown `--step`, and a
 *     `--step` whose check is already satisfied). These invoke no external command, so they are
 *     safe to run anywhere a POSIX shell exists. On Linux CI they always run; on a Windows dev box
 *     they skip when no `sh` is resolvable, which is why the structural half above is not optional.
 *
 * PARITY IS THE POINT, and it is asserted against the real `.ps1`: the two installers must declare
 * the SAME ordered step inventory, because `storytree doctor`'s repair vocabulary (`fixStep` ->
 * `planRepairs` -> the `run-installer-step` directive) names those step names on both platforms.
 * A step renamed on one side and not the other silently breaks the repair loop for that platform.
 */

const shPath = fileURLToPath(new URL("../../../infra/install.sh", import.meta.url));
const ps1Path = fileURLToPath(new URL("../../../infra/install.ps1", import.meta.url));
const script = readFileSync(shPath, "utf8");

/**
 * The canonical idempotent-prerequisite inventory, in dependency order (each step's check assumes
 * its predecessors). Declared as a literal here — NOT derived from either script — so that a
 * rename, reorder or silent drop in `install.sh` turns this red rather than quietly redefining
 * what the expectation was. The trailing `storytree doctor` verify and the Claude-login notice are
 * ACTIONS, not convergent steps, so they carry no `# @step:` marker and are excluded.
 */
const EXPECTED_STEPS = [
  "git",
  "node",
  "pnpm",
  "gh-cli",
  "github-auth",
  "clone",
  "provision",
  "claude-cli",
] as const;

/**
 * The script with whole-line `#` comments removed — what the fence assertions below must read.
 * Those fences forbid ACTIONS (launching the desktop app, installing a GPU stack), and the header
 * necessarily NAMES those actions to explain why it does not take them. Scanning the raw text
 * would make documenting a decision indistinguishable from taking it.
 */
function codeOnly(): string {
  return script
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
}

/** The `run_step` runner body — the region every idempotency/dispatch assertion reads. */
function runnerBody(): string {
  const start = script.indexOf("run_step() {");
  assert.notEqual(start, -1, "install.sh must define a run_step() runner");
  const end = script.indexOf("\n}", start);
  assert.notEqual(end, -1, "run_step() must be a closed function body");
  return script.slice(start, end);
}

// --- the idempotency invariant (ADR-0207 D1 / D6) ------------------------------------------------

test("run_step enforces the idempotency guard (never installs when already satisfied)", () => {
  const body = runnerBody();
  // The satisfied-check early return must precede the install invocation, so a satisfied step is a
  // genuine no-op. `"$2"` is the check function, `"$3"` the install function.
  const guardIdx = body.search(/if\s+"\$2";\s*then[\s\S]*?return 0/);
  const installIdx = body.indexOf('"$3"');
  assert.notEqual(guardIdx, -1, "run_step must return early when the check function succeeds");
  assert.notEqual(installIdx, -1, "run_step must invoke the step's install function");
  assert.ok(
    guardIdx < installIdx,
    "the satisfied-check early return must come BEFORE the install action (the no-op invariant)",
  );
});

test("run_step re-checks after installing, and dies when a step does not converge", () => {
  const body = runnerBody();
  const installIdx = body.indexOf('"$3"');
  const reCheck = body.indexOf('if "$2"; then', installIdx);
  assert.ok(reCheck > installIdx, "run_step must re-run the check after the install action");
  assert.ok(
    /die "\$1 - still not satisfied after setup/.test(body),
    "a step that does not converge after its install must die, not be reported as done",
  );
});

// --- the step inventory --------------------------------------------------------------------------

test("the # @step: inventory matches the intended setup sequence, in order", () => {
  const found = [...script.matchAll(/#\s*@step:([a-z0-9-]+)/g)].map((m) => m[1]);
  assert.deepEqual(
    found,
    [...EXPECTED_STEPS],
    "install.sh step markers must match the canonical ordered inventory",
  );
});

test("every declared step routes through the guarded run_step runner", () => {
  // Slice the script at each `# @step:` marker and assert the block invokes run_step before the
  // next marker — i.e. no step declares an install path that bypasses the idempotency guard.
  const markers = [...script.matchAll(/#\s*@step:([a-z0-9-]+)/g)];
  assert.equal(markers.length, EXPECTED_STEPS.length, "unexpected number of step markers");
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i]!.index!;
    const end = i + 1 < markers.length ? markers[i + 1]!.index! : script.length;
    const block = script.slice(start, end);
    assert.ok(
      block.includes("run_step "),
      `step '${markers[i]![1]}' must route through run_step (found no guarded runner in its block)`,
    );
  }
});

test("PARITY: install.sh and install.ps1 declare the SAME ordered step inventory", () => {
  // The repair vocabulary is shared: doctor's `fixStep` names a step by name, and the guide's
  // `run-installer-step` directive enacts it on whichever platform the dev is on. A step renamed
  // or reordered on one side only breaks that loop for the other platform, silently.
  const ps1 = readFileSync(ps1Path, "utf8");
  const shSteps = [...script.matchAll(/#\s*@step:([a-z0-9-]+)/g)].map((m) => m[1]);
  const ps1Steps = [...ps1.matchAll(/#\s*@step:([a-z0-9-]+)/g)].map((m) => m[1]);
  assert.deepEqual(
    shSteps,
    ps1Steps,
    "the two installers must declare identical ordered @step inventories (shared repair vocabulary)",
  );
});

// --- the single inventory: --step dispatch (ADR-0207 D6) ------------------------------------------

test("--step dispatches on ONE inventory, enforced in both directions", () => {
  const body = runnerBody();
  // Forward: a run_step call whose name is not in $STEPS dies.
  assert.ok(
    /step_declared "\$1" \|\|/.test(body),
    "run_step must refuse a step name that is not in the $STEPS inventory",
  );
  // Reverse: an inventory name that no run_step call declares dies.
  assert.ok(
    /for _declared in \$STEPS; do[\s\S]*?is in STEPS but no run_step call declares it/.test(script),
    "every $STEPS name must be asserted to have a declaring run_step call",
  );
  // And there is exactly one place the inventory is written down.
  const inventoryDecls = [...script.matchAll(/^STEPS="/gm)];
  assert.equal(inventoryDecls.length, 1, "the step inventory must be declared exactly once");
});

test("--help advertises the inventory rather than a hand-copied second list", () => {
  const usageStart = script.indexOf("usage() {");
  const usageEnd = script.indexOf("\n}", usageStart);
  const usage = script.slice(usageStart, usageEnd);
  assert.ok(
    usage.includes("$STEPS"),
    "usage() must interpolate $STEPS, not restate the step names (no second list to drift against)",
  );
});

test("--step skips a non-matching step WHOLE (never runs its check or install)", () => {
  const body = runnerBody();
  const filterIdx = body.search(/if\s+\[\s+"\$1"\s+!=\s+"\$STEP"\s+\];\s*then\s*\n\s*return 0/);
  const checkIdx = body.search(/if\s+"\$2";\s*then/);
  assert.notEqual(filterIdx, -1, "the --step filter must return early for a non-matching step");
  assert.notEqual(checkIdx, -1, "run_step must still run its check for a matching step");
  assert.ok(
    filterIdx < checkIdx,
    "the --step skip must precede the check, so a filtered-out step is a whole no-op",
  );
});

test("--step fails LOUDLY on an unknown name (never a silent no-op read as a repair)", () => {
  assert.ok(
    /die "unknown --step/.test(script),
    "an unrecognised --step name must die, not silently do nothing",
  );
  assert.ok(
    /Valid steps: \$STEPS/.test(script),
    "the unknown-step error must list the valid step names from the inventory",
  );
});

test("--step stops before the trailing actions (a targeted repair never re-verifies)", () => {
  const stepExitIdx = script.search(/if\s+\[\s+-n\s+"\$STEP"\s+\];\s*then[\s\S]*?exit 0\n?fi/);
  const trailingIdx = script.indexOf("trailing actions (not idempotent-convergent steps)");
  const doctorIdx = script.indexOf("verifying setup with 'storytree doctor'");
  assert.notEqual(stepExitIdx, -1, "install.sh must exit after a --step run");
  assert.ok(stepExitIdx < trailingIdx, "the --step exit must precede the trailing verify/login actions");
  assert.ok(stepExitIdx < doctorIdx, "a --step repair must never reach the trailing doctor run");
});

// --- the D3 trust invariant -----------------------------------------------------------------------

test("the D3 trust invariant is honoured: the script never captures a Claude credential", () => {
  // storytree may DETECT a logged-in CLI (the .credentials.json existence probe) but must never
  // read the token's contents or pipe it anywhere. Guard against the obvious regression: reading
  // the file's body rather than merely testing its presence.
  // Code only, and LINE-BOUNDED: the header necessarily discusses the credential file to explain
  // the boundary, and `\s` would match a newline — letting a mention on one line pair with the
  // path on the next and fire on a script that reads nothing.
  const readsCredential =
    /(?:^|[;&|(]|[ \t])(cat|head|tail|grep|sed|awk|jq|xargs|read|source|\.)[ \t]+[^\n]*\.credentials\.json/im;
  assert.ok(
    !readsCredential.test(codeOnly()),
    "install.sh must not read the contents of .credentials.json (D3: detect, never capture)",
  );
  // The presence probe itself must still be there — otherwise the login notice is dead code.
  assert.ok(
    /\[\s+-f\s+"\$HOME\/\.claude\/\.credentials\.json"\s+\]/.test(script),
    "install.sh must detect a logged-in CLI by the credential file's EXISTENCE",
  );
});

// --- the decided differences from install.ps1 -------------------------------------------------------

test("ASCII-only: the enforceable proxy for the C-locale output constraint", () => {
  // This constraint is NOT inherited from install.ps1's reason (PowerShell 5.1 mis-decoding a
  // BOM-less UTF-8 file through `irm | iex`), which does not apply to sh at all — sh never decodes
  // the script. It is kept for a narrower reason: the script prints diagnostics on boxes that may
  // run under LC_ALL=C, where non-ASCII output renders as mojibake. Only PRINTED strings strictly
  // need it, but that is not checkable from outside; whole-file ASCII is the cheap proxy.
  const bytes = readFileSync(shPath);
  const offending: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    const isAllowed = b === 0x09 || b === 0x0a || (b >= 0x20 && b <= 0x7e);
    if (!isAllowed) {
      const line = bytes.subarray(0, i).toString("latin1").split("\n").length;
      offending.push(`line ${line}: byte 0x${b.toString(16).padStart(2, "0")}`);
      if (offending.length >= 5) break;
    }
  }
  assert.deepEqual(offending, [], "install.sh must be plain ASCII (LF only, no CR, no UTF-8)");
});

test("LF line endings: a CRLF shebang is an unrunnable script", () => {
  // Authored on Windows. `.gitattributes` normalises to LF, but a stray CRLF would make the
  // shebang `/bin/sh\r` — "bad interpreter" on every Linux box, and invisible on the dev box.
  assert.ok(!script.includes("\r"), "install.sh must use LF line endings (CRLF breaks the shebang)");
  assert.ok(script.startsWith("#!/bin/sh\n"), "install.sh must start with a POSIX sh shebang");
});

test("no desktop-app launch: this installer provisions a dev box, not an explorer's app", () => {
  // install.ps1 ends with `pnpm desktop:start` because it onboards an EXPLORER, for whom the app
  // IS the product. Porting that here would be a cargo-cult copy — decided against.
  assert.ok(
    !/desktop:start/.test(codeOnly()),
    "install.sh must not launch the desktop app (explorer affordance, not a dev-box one)",
  );
});

test("the scope fence holds: no dev-credential provisioning", () => {
  // The fence (arc `second-box-absorbs-the-expensive-work`, inc-03): bare machine -> cloned,
  // provisioned checkout, and STOP. gcloud ADC, the secrets file and DB access belong to the
  // separate dev-box guide; Blender/GPU/herdr are fenced out of the arc entirely. Mentioning them
  // in a comment or a closing pointer is fine — INSTALLING them is the regression.
  const commandLike = [
    /gcloud\s+auth/,
    /apt[-_]install\s+[^\n]*blender/i,
    /--step\s+secrets/,
    /\bherdr\b/i,
    /\bnvidia-/i,
    /\bcuda\b/i,
  ];
  const code = codeOnly();
  for (const pattern of commandLike) {
    assert.ok(
      !pattern.test(code),
      `install.sh must not act outside the bootstrap fence (matched ${pattern})`,
    );
  }
});

// --- executable: the hermetic paths ------------------------------------------------------------------
//
// Three of the script's paths need NO external command, no network and no privilege: `--help`, an
// unknown `--step`, and a `--step` whose check is already satisfied. Those are executed here for
// real — the only end-to-end evidence available for a script CI cannot otherwise run.
//
// ONE test that ALWAYS RUNS, deliberately — not three behind `{ skip: ... }`. node:test's
// options-form skip is invisible to `analyzeObservedTests` (the classifier `check:coverage` reads,
// which parses only the `.skip`/`.todo` MODIFIER), so a conditionally-skipped test is reported as
// having run and substantively asserted. `check:verification-decay`'s `vacuous-proof` instrument
// locates exactly that shape, and three such skips here pushed it over its ceiling. A test that
// always runs cannot misreport itself, so the environment gate is an assertion in the BODY rather
// than a skip on the declaration — and the gate is asserted rather than assumed, so a broken shell
// probe fails loudly on Linux instead of quietly verifying nothing everywhere.

/** The first resolvable POSIX shell, or null. Absent from a stock Windows PATH. */
function findSh(): string | null {
  for (const candidate of ["sh", "dash", "bash"]) {
    const probe = spawnSync(candidate, ["-c", "exit 0"], { encoding: "utf8" });
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}

/** One installer run: its exit status, and stdout+stderr joined as the script emitted them. */
interface InstallerRun {
  readonly status: number | null;
  readonly out: string;
}

function runInstaller(sh: string, args: string[]): InstallerRun {
  const r = spawnSync(sh, [shPath, ...args], { encoding: "utf8" });
  assert.equal(r.error, undefined, `spawning ${sh} must not fail`);
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/**
 * A checkout directory whose `provision` check is satisfied BY CONSTRUCTION — `check_provisioned`
 * tests for `node_modules/.modules.yaml`, so creating it guarantees the check passes and therefore
 * guarantees `install_provision` (a real `pnpm install`) cannot run. That is why the no-op scenario
 * below uses `provision` and not `git`: depending on git being installed would mean that, on a box
 * without it, the assertion silently became `apt-get install git`. A test must never be one absent
 * binary away from mutating the machine it runs on.
 */
function provisionedStub(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "storytree-install-sh-"));
  mkdirSync(path.join(dir, "node_modules"), { recursive: true });
  writeFileSync(path.join(dir, "node_modules", ".modules.yaml"), "");
  // MSYS/Cygwin sh reads drive-letter paths with forward slashes; a backslash path is not a path.
  return dir.replace(/\\/g, "/");
}

test("the hermetic paths, EXECUTED under a real POSIX shell", () => {
  const sh = findSh();
  if (sh === null) {
    // The one sanctioned reason to have nothing to run against: a Windows shell without a POSIX
    // shell on PATH. Asserted, not assumed — on Linux CI a null probe is a real failure here, so
    // this can never degrade into a test that verifies nothing on the platform that matters.
    assert.equal(
      process.platform,
      "win32",
      "a POSIX shell must be resolvable on any non-Windows box; findSh() returning null there is a defect",
    );
    return;
  }

  // 1. --help prints usage, exits 0, and advertises every step (what makes $STEPS load-bearing).
  const help = runInstaller(sh, ["--help"]);
  assert.equal(help.status, 0, "--help must exit 0");
  assert.match(help.out, /Usage:/, "--help must print usage");
  for (const step of EXPECTED_STEPS) {
    assert.ok(help.out.includes(step), `--help must advertise step '${step}'`);
  }

  // 2. An unknown --step is loud, lists the valid names, and runs NO step. The whole-skip
  //    invariant is OBSERVED rather than inferred: no step reported a verdict, so no step's check
  //    ran — which is what makes a mistyped repair side-effect-free as well as loud.
  const unknown = runInstaller(sh, ["--step", "no-such-step"]);
  assert.notEqual(unknown.status, 0, "an unknown --step must exit non-zero");
  assert.match(unknown.out, /unknown --step 'no-such-step'/, "the error must name the bad step");
  for (const step of EXPECTED_STEPS) {
    assert.ok(unknown.out.includes(step), `the unknown-step error must list valid step '${step}'`);
  }
  assert.doesNotMatch(
    unknown.out,
    /already satisfied|setting up/,
    "an unknown --step must run no step at all",
  );

  // 3. A --step whose check is satisfied is a genuine no-op that stops before the trailing actions.
  const stub = provisionedStub();
  try {
    const noop = runInstaller(sh, ["--step", "provision", "--checkout-dir", stub]);
    assert.equal(noop.status, 0, "a satisfied --step must exit 0");
    assert.match(noop.out, /provision - already satisfied/, "the satisfied step must report the no-op");
    assert.doesNotMatch(
      noop.out,
      /provision - setting up/,
      "a satisfied step must NOT run its install action (the load-bearing idempotency invariant)",
    );
    assert.match(noop.out, /step 'provision' complete/, "a --step run must report completion");
    assert.doesNotMatch(
      noop.out,
      /verifying setup with/,
      "a --step repair must not reach the trailing verify",
    );
  } finally {
    rmSync(stub, { recursive: true, force: true });
  }
});
