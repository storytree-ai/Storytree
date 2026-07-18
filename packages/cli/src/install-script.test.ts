import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Structural floor for the explorer-onboarding D1 one-liner installer (ADR-0207 D1),
 * `infra/install.ps1`. A Windows bootstrap script cannot run under this repo's Linux CI, and its
 * true proof is the owner's fresh-machine attestation — but its ONE load-bearing, machine-checkable
 * invariant is testable by reading the script as text: every setup step is IDEMPOTENT and no-ops
 * when already satisfied (ADR-0207 D1 / D6 — re-run is both the retry and the repair story).
 *
 * This test reads the single source (the .ps1 itself — no second copy of the step list to drift
 * against) and asserts:
 *   1. the `Invoke-Step` runner exists and carries the guard that makes every step idempotent
 *      (Check runs first; on satisfied it returns BEFORE the install action);
 *   2. the ordered `# @step:<name>` inventory matches the intended setup sequence exactly;
 *   3. every declared step routes through `Invoke-Step` (no unguarded install slips in).
 *
 * A regression that removes the guard, reorders/renames a step, or adds an unguarded install turns
 * this red — the honest CI floor under a script whose full behaviour only a human can attest.
 */

const scriptPath = fileURLToPath(new URL("../../../infra/install.ps1", import.meta.url));
const script = readFileSync(scriptPath, "utf8");

// The canonical idempotent-prerequisite inventory, in dependency order (each step's Check assumes
// its predecessors). The trailing Claude-login prompt and desktop launch are ACTIONS, not
// convergent steps, so they carry no `# @step:` marker and are intentionally excluded here.
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

test("Invoke-Step enforces the idempotency guard (never installs when already satisfied)", () => {
  const fnStart = script.indexOf("function Invoke-Step");
  assert.notEqual(fnStart, -1, "install.ps1 must define an Invoke-Step runner");
  // Within the runner, the satisfied-Check early return must precede the install invocation, so a
  // satisfied step is a genuine no-op.
  const body = script.slice(fnStart, fnStart + 800);
  const guardIdx = body.search(/if\s*\(\s*&\s*\$Check\s*\)\s*\{[^}]*return/);
  const installIdx = body.indexOf("& $Install");
  assert.notEqual(guardIdx, -1, "Invoke-Step must return early when Check is satisfied");
  assert.notEqual(installIdx, -1, "Invoke-Step must invoke the step's install action");
  assert.ok(
    guardIdx < installIdx,
    "the satisfied-Check early return must come BEFORE the install action (the no-op invariant)",
  );
});

test("the # @step: inventory matches the intended setup sequence, in order", () => {
  const found = [...script.matchAll(/#\s*@step:([a-z0-9-]+)/g)].map((m) => m[1]);
  assert.deepEqual(
    found,
    [...EXPECTED_STEPS],
    "install.ps1 step markers must match the canonical ordered inventory",
  );
});

test("every declared step routes through the guarded Invoke-Step runner", () => {
  // Slice the script at each `# @step:` marker and assert the block invokes Invoke-Step before the
  // next marker — i.e. no step declares an install path that bypasses the idempotency guard.
  const markers = [...script.matchAll(/#\s*@step:([a-z0-9-]+)/g)];
  assert.equal(markers.length, EXPECTED_STEPS.length, "unexpected number of step markers");
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i]!.index!;
    const end = i + 1 < markers.length ? markers[i + 1]!.index! : script.length;
    const block = script.slice(start, end);
    assert.ok(
      block.includes("Invoke-Step"),
      `step '${markers[i]![1]}' must route through Invoke-Step (found no guarded runner in its block)`,
    );
  }
});

test("the D3 trust invariant is honoured: the script never captures a Claude credential", () => {
  // storytree may DETECT a logged-in CLI (the .credentials.json existence probe) but must never
  // read the token's contents or pipe it anywhere. Guard against an obvious regression: reading the
  // credentials file body (Get-Content) rather than merely testing its presence.
  assert.ok(
    !/Get-Content[^\n]*\.credentials\.json/i.test(script),
    "install.ps1 must not read the contents of .credentials.json (D3: detect, never capture)",
  );
});

// --- D6 targeted repair: -Step single-step invocation --------------------------------------------
// The guide's repair loop emits a `run-installer-step` directive naming ONE `# @step:` (doctor's
// fixStep -> planRepairs -> guide-loop). That directive is only enactable if the installer can run a
// SINGLE step, so these assert the -Step contract the loop depends on.

test("-Step: the installer accepts a single-step parameter (the loop's enactable repair)", () => {
  assert.ok(
    /\[string\]\$Step\b/.test(script),
    "install.ps1 must declare a [string]$Step parameter so one @step can be re-invoked",
  );
});

test("-Step dispatches on the SAME @step inventory (no second step list to drift against)", () => {
  // The filter must compare the runner's own $Name against $Step, so every declared @step is
  // invocable by construction and a new step needs no registration anywhere else.
  const fnStart = script.indexOf("function Invoke-Step");
  const body = script.slice(fnStart, fnStart + 900);
  assert.ok(
    /\$Name\s*-ne\s*\$script:Step/.test(body),
    "Invoke-Step must filter by comparing its own $Name against $Step (dispatch by inventory)",
  );
  // The valid-name list is accumulated from the runner itself, never hand-maintained.
  assert.ok(
    /\$script:StepNames\s*\+=\s*\$Name/.test(body),
    "the valid-step list must be collected from Invoke-Step calls, not hand-maintained",
  );
});

test("-Step skips a non-matching step WHOLE (never runs its Check or Install)", () => {
  const fnStart = script.indexOf("function Invoke-Step");
  const body = script.slice(fnStart, fnStart + 900);
  const filterIdx = body.search(/if\s*\(\s*\$Name\s*-ne\s*\$script:Step\s*\)\s*\{\s*return/);
  const checkIdx = body.search(/if\s*\(\s*&\s*\$Check\s*\)/);
  assert.notEqual(filterIdx, -1, "the -Step filter must return early for a non-matching step");
  assert.notEqual(checkIdx, -1, "Invoke-Step must still run its Check for a matching step");
  assert.ok(
    filterIdx < checkIdx,
    "the -Step skip must precede the Check, so a filtered-out step is a whole no-op",
  );
});

test("-Step fails LOUDLY on an unknown name (never a silent no-op the guide misreads as repaired)", () => {
  assert.ok(
    /throw\s+"unknown -Step/.test(script),
    "an unrecognised -Step name must throw, not silently do nothing",
  );
  assert.ok(
    /\$script:StepNames\s*-join/.test(script),
    "the unknown-step error must list the valid step names",
  );
});

test("-Step stops before the trailing actions (a targeted repair never launches the app)", () => {
  const guardIdx = script.search(/if\s*\(\$Step\)\s*\{[\s\S]*?return\s*\n\}/);
  const trailingIdx = script.indexOf("trailing actions (not idempotent-convergent steps)");
  const launchIdx = script.indexOf("Start-Process");
  assert.notEqual(guardIdx, -1, "install.ps1 must return after a -Step run");
  assert.ok(guardIdx < trailingIdx, "the -Step return must precede the trailing verify/login actions");
  assert.ok(guardIdx < launchIdx, "a -Step repair must never reach the desktop-app launch");
});
